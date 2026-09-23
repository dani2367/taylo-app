function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseEventDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

export function daysUntil(eventDate: string | null | undefined, today = new Date()): number | null {
  const date = resolvePlanDate(eventDate, today);
  if (!date) return null;
  const start = startOfLocalDay(today);
  return Math.round((date.getTime() - start.getTime()) / 86400000);
}

/**
 * Open items dated many months in the past are almost always a missing/wrong year
 * ("9 September" resolved to last year because that weekday matched). Roll them
 * to this year, or next year if this year's date already passed.
 */
export function resolvePlanDate(eventDate: string | null | undefined, today = new Date()): Date | null {
  const date = parseEventDate(eventDate);
  if (!date) return null;
  const start = startOfLocalDay(today);
  const days = Math.round((date.getTime() - start.getTime()) / 86400000);
  if (days >= -45) return date;

  const thisYear = new Date(start.getFullYear(), date.getMonth(), date.getDate());
  const thisYearDays = Math.round((thisYear.getTime() - start.getTime()) / 86400000);
  if (thisYearDays >= -14) return thisYear;
  return new Date(start.getFullYear() + 1, date.getMonth(), date.getDate());
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Monday as the start of the week (UK). */
export function startOfWeek(d: Date): Date {
  const start = startOfLocalDay(d);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(start, offset);
}

function weeksBetween(a: Date, b: Date): number {
  return Math.round((startOfWeek(b).getTime() - startOfWeek(a).getTime()) / (7 * 86400000));
}

/**
 * Relative, spoken date for Plan cards. Never returns a raw calendar date like "23 Sep".
 */
export function humanizeEventDate(eventDate: string | null | undefined, today = new Date()): string | null {
  const date = resolvePlanDate(eventDate, today);
  const days = daysUntil(eventDate, today);
  if (!date || days == null) return null;

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? 'Yesterday' : `${ago} days ago`;
  }

  const weekday = date.getDay();
  const weekDelta = weeksBetween(today, date);
  const isWeekend = weekday === 0 || weekday === 6;

  if (weekDelta === 0) {
    if (isWeekend) return 'This weekend';
    return `Due ${WEEKDAYS[weekday]}`;
  }

  if (weekDelta === 1) return 'Next week';

  const wholeWeeks = Math.max(2, Math.round(days / 7));
  if (wholeWeeks === 1) return 'Next week';
  return `In ${wholeWeeks} weeks`;
}

/**
 * Calendar day with no relative wording and no year rollover.
 * "22 September" is the stored day, including when that day is today or already past.
 */
export function specificCalendarLabel(raw: string | null | undefined): string | null {
  const date = parseEventDate(raw);
  if (!date) return null;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

const PROSE_MONTH: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function proseMonthDay(text: string): { day: number; month: number } | null {
  const t = text.replace(/\s+/g, ' ');
  const months = Object.keys(PROSE_MONTH).join('|');
  const dayMonth = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\b`, 'i'));
  const monthDay = dayMonth
    ? null
    : t.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  if (dayMonth) {
    return { day: Number(dayMonth[1]), month: PROSE_MONTH[dayMonth[2].toLowerCase()] };
  }
  if (monthDay) {
    return { day: Number(monthDay[2]), month: PROSE_MONTH[monthDay[1].toLowerCase()] };
  }
  return null;
}

function isCalendarOnlyPhrase(text: string): boolean {
  const leftover = text
    .toLowerCase()
    .replace(/\b(next|this|on|due|the|of|a|an|and)\b/g, ' ')
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, ' ')
    .replace(/\b(today|tomorrow|yesterday|tonight)\b/g, ' ')
    .replace(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/g,
      ' ',
    )
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return !leftover;
}

/**
 * When stored copy is only a date, or names a different day than the date fields,
 * the line to show is the stored calendar day ("23 September").
 * Real extra facts return null so the caller can keep the sentence.
 */
export function canonicalDateDetail(
  prose: string | null | undefined,
  canonical: string | null | undefined,
): string | null {
  const text = (prose || '').replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  const label = specificCalendarLabel(canonical);
  if (!text || !label) return null;
  const named = proseMonthDay(text);
  const date = parseEventDate(canonical);
  const conflicts =
    !!named && !!date && (named.day !== date.getDate() || named.month !== date.getMonth());
  if (conflicts || isCalendarOnlyPhrase(text)) return label;
  return null;
}

/** Calendar date for Radar watch copy: "15 October". */
export function calendarDateLabel(eventDate: string | null | undefined, today = new Date()): string | null {
  const date = resolvePlanDate(eventDate, today);
  if (!date) return null;
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  if (date.getFullYear() !== today.getFullYear()) return `${day} ${month} ${date.getFullYear()}`;
  return `${day} ${month}`;
}

/** Short weekday fragment for Family blurbs: "Thu", or Today/Tomorrow. */
export function weekdayShort(eventDate: string | null | undefined, today = new Date()): string | null {
  const date = resolvePlanDate(eventDate, today);
  const days = daysUntil(eventDate, today);
  if (!date || days == null) return null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return WEEKDAYS_SHORT[date.getDay()];
}

export function clipContext(raw: string | null | undefined, max = 100): string | null {
  const body = (raw || '').trim().replace(/\s+/g, ' ');
  if (!body) return null;
  if (body.length <= max) return body;
  const slice = body.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 32 ? slice.slice(0, lastSpace) : slice.trim();
  return `${cut}…`;
}

/** One line: relative when, plus a short extra fact that is not itself a date. */
export function planContextLine(
  item: {
    event_date: string | null;
    body: string | null;
    urgency_level?: string | null;
  },
  today = new Date(),
): string | null {
  const when = humanizeEventDate(item.event_date, today);
  const extra = clipContext(item.body);
  const extraLooksLikeDate =
    !!extra &&
    /^(today|tomorrow|yesterday|this weekend|next week|due\s+\w+|in\s+\d+\s+weeks?)/i.test(extra);

  if (when && extra && !extraLooksLikeDate && extra.toLowerCase() !== when.toLowerCase()) {
    return `${when} · ${extra}`;
  }
  if (when) return when;
  if (extra && !extraLooksLikeDate) return extra;
  if (item.urgency_level === 'today') return 'Today';
  if (item.urgency_level === 'this_week') return 'This week';
  if (item.urgency_level === 'upcoming') return 'Coming up';
  return null;
}

export function thingsToSortLabel(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 thing to sort';
  return `${count} things to sort`;
}

export function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}
