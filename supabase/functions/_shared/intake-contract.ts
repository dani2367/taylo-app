/** Canonical intake fields written by AI classification across email, calendar, and chat. */

export const KINDS = ['occurrence', 'obligation', 'hold', 'list_item', 'context_only'] as const;
export const ACTIONABLE = ['yes', 'no', 'maybe'] as const;
export const PREP_IMPLIED = ['none', 'stated', 'inferred'] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;

export type IntakeKind = (typeof KINDS)[number];
export type Actionable = (typeof ACTIONABLE)[number];
export type PrepImplied = (typeof PREP_IMPLIED)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type IntakeSource = 'calendar' | 'email' | 'chat';

export type RawIntakeItem = {
  title?: unknown;
  kind?: unknown;
  occurs_at?: unknown;
  due_at?: unknown;
  actionable?: unknown;
  prep_implied?: unknown;
  prep_origin?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  surface_from?: unknown;
  surface_until?: unknown;
};

export type IntakeItem = {
  title: string;
  kind: IntakeKind;
  occurs_at: string | null;
  due_at: string | null;
  actionable: Actionable;
  prep_implied: PrepImplied;
  confidence: Confidence;
  evidence: string;
  surface_from: string | null;
  surface_until: string | null;
};

export const INTAKE_ITEM_JSON = `{
  "title": "short item title",
  "kind": "occurrence|obligation|hold|list_item|context_only",
  "occurs_at": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or null",
  "due_at": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or null",
  "actionable": "yes|no|maybe",
  "prep_implied": "none|stated|inferred",
  "confidence": "high|medium|low",
  "evidence": "short quote from the source, or empty string",
  "surface_from": "YYYY-MM-DD or null",
  "surface_until": "YYYY-MM-DD or null"
}`;

export function intakeContractRules(source: IntakeSource): string {
  const occursRule =
    source === 'calendar'
      ? `occurs_at: REQUIRED on the occurrence (the calendar event start). Child obligations must set occurs_at to null. Never copy a due date onto occurs_at.`
      : `occurs_at: null for obligations, holds, and list_items. A date that is an action deadline is due_at on an obligation — never occurs_at.
- kind=occurrence IS allowed for ${source} when they state that a thing happens on an unambiguous calendar day — "X is on 23 October", "spa day on 12 June", "parents evening on 4 November", "on Wednesday next week". The noun does not have to be wedding/birthday. occurs_at = that day. Confidence high.
- Dated chores stay obligations: the date is a deadline or the sentence is the work ("book the eye test on 5 December", "email the teacher about the trip", "return the form by the 19th", "buy shoes for the wedding"). Those go on General to do from chat.
- If they name the event AND extra work ("Oliver's stag is on the 23rd October — need to book flights"), return the event as occurrence AND the action as its own obligation. Do not collapse them into one to-do. Do not invent "arrive" / "attend" / "go to the hospital" as a child — the event on the card is enough.
- A named thing that already happens that day (spa day, parents evening, haircut, pre-op, sports day) is the event. Showing up is not an obligation. "Book the eye test" is still the chore. Standups, 1:1s, and generic diary filler are not family events.
- A confirmation that admin is done ("authorisation is in place", "we have received the form", "RSVP noted") is not an occurrence. capture nothing_here when there is no new action. Do not mark existing work done — the parent completes it in the app.
- context_only MAY set occurs_at only for a stated fact that is not an event they attend (e.g. "nursery is closed on the 19th") AND confidence is high.
- Never for inferred, hedged, or estimated dates ("might", "sometime next week", "Tuesday-ish", a weekday with no this/next). "Wednesday next week", "this Friday", "tomorrow", and "today" are real days — keep them. A bare "Friday" or "next week" alone is not. Code will strip occurs_at unless that bar is met.`;

  return `Intake contract — every item you return must fill these fields. ${INTAKE_ITEM_JSON}

kind:
- occurrence: something that genuinely happens on a day. Calendar events always. Email/chat: use this when they say a named thing happens on a calendar day. Not for admin ("book", "email", "return a form") even if that sentence contains a date.
- obligation: a concrete action (bring packed lunch, sign a form, write a speech).
- hold: awareness with no deadline ("trainers are getting small").
- list_item: a product or line on a shopping/custom list.
- context_only: useful context that is not an event they attend (nursery closed).

${occursRule}
due_at: when the action is due, if applicable. Any source may set this. Holds have due_at null. Do not invent a deadline.
actionable: yes if a real action exists; no if informational; maybe if uncertain.
prep_implied: none | stated | inferred. Map to storage as prep_origin.
confidence: high | medium | low.
evidence: a short quote or reference from the source text. Empty string if none.

Prep discipline — do NOT invent prep:
- Only create an obligation for prep that is explicitly stated, OR a well-established high-confidence type default (birthday → present and/or card, unless told otherwise).
- Actively check exclusions. If the source rules something out ("no presents please", "no gifts", "don't bring anything"), that specific prep must not be created, and prep_implied for it is none. Respect negatives; do not only look for positive signals.
- Low-confidence inferences must never become obligations. Example: "lunch with a friend" must NOT imply a gift. If you are not at least medium-confidence, omit the obligation entirely.
- When an occurrence or heads-up implies several obligations (birthday → card; school trip → packed lunch AND waterproof coat), return each as its own item. Do not bundle them into one record or a checklist blob.
- "Bring packed lunch and a waterproof coat" → exactly two high-confidence stated obligations, titles like "Packed lunch" and "Waterproof coat".
- "Taya's trainers are getting small" → one hold, due_at null, occurs_at null. Not an obligation with a fabricated deadline.
- "Olivier's wedding on 5 December, need to plan a speech" → occurrence (wedding, occurs_at = 5 Dec) plus obligation ("Plan the speech", due_at on/before that day). Not one to-do titled "wedding — speech".
- "Oliver's stag is on the 23rd October — need to book flights" → occurrence (stag, occurs_at = that day) plus obligation ("Book flights"). The flights to-do does not replace the event on Schedule.
- "Nursery is closed on the 19th for staff training" → one context_only, high confidence, occurs_at = that day, no prep obligations.
- "Might need to pop in sometime next week" → hold or context_only with occurs_at null. Do not invent a calendar day.

Surface windows (you may set surface_from / surface_until as YYYY-MM-DD; code will fill defaults if null):
- birthday/party: about 7 days before until the day
- school forms / permission slips: based on the actual due date (about 14 days before until due)
- appointments: 1 day before or same-day
- holidays / passports: weeks to months before (about 60–90 days)`;
}

const KIT_TITLE_RE =
  /\b(packed lunch|waterproof|wellies|wellingtons|water bottle|named (towel|bottle)|towel|goggles|costume|swimsuit|swim suit|bobble|hair (band|tie)|socks|sun cream|sunhat|sun hat)\b/i;
const RSVP_ASK_RE =
  /\b(rsvp|reply so we know|please reply|let us know (if you can|numbers|if a grown-up|if you(?:'re| are) coming))\b/i;
const RSVP_TITLE_RE = /\b(rsvp|confirm (numbers|attendance)|reply)\b/i;
const DONATION_RE = /\b(donat(?:e|ion)|sanctuary|charity|in lieu)\b/i;
const GIFT_TITLE_RE = /\b(presents?|gifts?|goody\s*bags?)\b/i;
const CARD_TITLE_RE = /\b(cards?)\b/i;
const GIFT_EXCLUSION_RE = /\bno\s+(?:need\s+for\s+)?(?:presents?|gifts?)|please\s+no\s+(?:presents?|gifts?)|no\s+(?:presents?|gifts?)\s+please|don'?t\s+bring\s+(?:a\s+)?(?:present|gift)|without\s+(?:presents?|gifts?)/i;
const CARD_EXCLUSION_RE = /\bno\s+(?:need\s+for\s+)?cards?|please\s+no\s+cards?|no\s+cards?\s+please|don'?t\s+bring\s+(?:a\s+)?card/i;
const BIRTHDAY_RE = /\b(birthday|bday|party)\b/i;
const BIRTHDAY_DEFAULT_RE = /\bbirthdays?\b|\bbday\b/i;
const FORM_RE = /\b(form|permission|slip|ofsted|return by|due)\b/i;
const HOLIDAY_RE = /\b(holiday|holidays|passport|vacation|half[-\s]?term)\b/i;
const APPOINT_RE =
  /\b(appointment|dentist|doctor|gp|hospital|checkup|injection|vaccine|optician|hearing|pre[- ]?opp?|pre[- ]?op(?:erative)?)\b/i;
const ADMIN_TASK_TITLE_RE =
  /^(email|call|text|message|book|sign|return|pay|buy|get|order|pick\s*up|renew|apply|arrange|organise|organize|sort|print|tell|ask|chase|send)\b/i;
const BARE_EVENT_NOUN_RE =
  /^(the\s+)?(wedding|funeral|christening|party|trip|concert|festival|gala|holiday|birthday|match|stag(?:\s+do)?|hen(?:\s+(?:do|party))?)$/i;
const POSSESSIVE_LIFE_EVENT_NOUN =
  'stag(?:\\s+do)?|hen(?:\\s+(?:do|party))?|wedding|funeral|christening|bar\\s+mitzvah|bat\\s+mitzvah|birthday(?:\\s+party)?|operation|surgery|appointment';
const POSSESSIVE_NAME_STOP = /^(need|needs|this|his|its|us|as|is|was|has|does)$/i;
const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function stripLeadingNeed(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(please\s+)?(?:i\s+)?(?:still\s+)?(?:need to |need |have to |gotta |must )/i, '')
    .trim();
}

/** Work diary filler — stays on Schedule, never Radar or Home. */
export function isGenericDiaryTitle(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return true;
  if (
    /^(daily |weekly |morning |team |sprint )?(standup|stand-up|stand up)$/.test(t) ||
    /^(daily |weekly |morning |team )?(sync|huddle)$/.test(t) ||
    /^(all[-\s]?hands|sprint (planning|review|retro)|retrospective)$/.test(t) ||
    /^(weekly |daily |team )?(catch[-\s]?up|check[-\s]?in)$/.test(t) ||
    /^(meeting|call|zoom|teams|webex)$/.test(t) ||
    /^(weekly|daily|team) meeting$/.test(t)
  ) {
    return true;
  }
  if (/\b(1\s*[:/.-]\s*1|one[-\s]?on[-\s]?one)\b/.test(t)) return true;
  if (/\b(standup|stand-up|all[-\s]?hands|sprint (planning|review|retro))\b/.test(t)) return true;
  return false;
}

function isInformationalContextTitle(title: string): boolean {
  return /\b(closed|inset|no school|staff training|cancelled|canceled)\b/i.test(title);
}

function isChoreLikeTitle(title: string): boolean {
  const t = stripLeadingNeed(title);
  if (!t) return false;
  if (ADMIN_TASK_TITLE_RE.test(t)) return true;
  if (isEventKitTitle(t)) return true;
  if (/^(a |the )?(card|present|gift)s?$/i.test(t)) return true;
  if (isInformationalContextTitle(t)) return true;
  return false;
}

/** Named thing they attend — not a chore, and not a generic diary meeting. */
export function titleNamesAttendableEvent(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (isGenericDiaryTitle(t) || isChoreLikeTitle(t) || BARE_EVENT_NOUN_RE.test(t)) return false;
  if (/\b(wedding|funeral|christening|bar\s+mitzvah|bat\s+mitzvah)\b/i.test(t)) return true;
  if (/\b(stag(?:\s+do)?|hen(?:\s+(?:do|party))?)\b/i.test(t)) return true;
  if (/\bbirthdays?\b|\bbday\b/i.test(t)) return true;
  if (/\b[\w']+'s\s+party\b/i.test(t) || /\bbirthday\s+party\b/i.test(t)) return true;
  if (/\b(school|year\s+\d+|farm|class|residential|ski)\s+trip\b/i.test(t)) return true;
  if (/\b(concert|festival|gala)\b/i.test(t)) return true;
  if (/\b(football|netball|rugby|cricket|tennis)\s+match\b/i.test(t)) return true;
  if (/\b(operation|surgery)\b/i.test(t)) return true;
  if (APPOINT_RE.test(t)) return true;
  if (/\bholiday\b/i.test(t) && !/\bpassport\b/i.test(t)) return true;
  return isConcreteEventPhrase(t);
}

/** "Oliver's stag" / "olivers wedding" from the offload sentence itself. */
export function namedPossessiveLifeEvent(text: string): string | null {
  const re = new RegExp(`\\b([A-Za-z]+)(?:['’]s|s)\\s+(${POSSESSIVE_LIFE_EVENT_NOUN})\\b`, 'i');
  const match = text.match(re);
  if (!match) return null;
  if (POSSESSIVE_NAME_STOP.test(match[1])) return null;
  const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const event = match[2].replace(/\s+/g, ' ').toLowerCase();
  const title = `${name}'s ${event}`;
  return isSpecificAttendableEventTitle(title) ? title : null;
}

/** 23rd October / October 23 / 24/09/2026. No weekday or tomorrow. */
function explicitCalendarDay(text: string, today = new Date()): string | null {
  const t = text.replace(/\s+/g, ' ');
  const dayMonth = t.match(new RegExp(`\\b(${ORDINAL_DAY})\\s+(?:of\\s+)?(${MONTH_NAME})(?:\\s+(20\\d{2}))?\\b`, 'i'));
  const monthDay = dayMonth
    ? null
    : t.match(new RegExp(`\\b(${MONTH_NAME})\\s+(${ORDINAL_DAY})(?:\\s+(20\\d{2}))?\\b`, 'i'));
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  if (dayMonth) {
    day = Number.parseInt(dayMonth[1], 10);
    month = MONTH_INDEX[dayMonth[2].toLowerCase()] ?? null;
    year = dayMonth[3] ? Number(dayMonth[3]) : null;
  } else if (monthDay) {
    month = MONTH_INDEX[monthDay[1].toLowerCase()] ?? null;
    day = Number.parseInt(monthDay[2], 10);
    year = monthDay[3] ? Number(monthDay[3]) : null;
  }
  if (day != null && month != null && !Number.isNaN(day) && day >= 1 && day <= 31) {
    const nowY = today.getFullYear();
    const nowM = today.getMonth();
    const nowD = today.getDate();
    let y = year ?? nowY;
    if (year == null && (month < nowM || (month === nowM && day < nowD))) y = nowY + 1;
    const dt = new Date(Date.UTC(y, month, day));
    if (dt.getUTCMonth() === month && dt.getUTCDate() === day) {
      return `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const slashDay = Number.parseInt(slash[1], 10);
    const slashMonth = Number.parseInt(slash[2], 10);
    let slashYear = Number.parseInt(slash[3], 10);
    if (slashYear < 100) slashYear += 2000;
    const slashDt = new Date(Date.UTC(slashYear, slashMonth - 1, slashDay));
    if (
      slashMonth >= 1 &&
      slashMonth <= 12 &&
      slashDt.getUTCMonth() === slashMonth - 1 &&
      slashDt.getUTCDate() === slashDay
    ) {
      return `${slashYear}-${String(slashMonth).padStart(2, '0')}-${String(slashDay).padStart(2, '0')}`;
    }
  }
  return null;
}

/** 23rd October / October 23 / 24/09/2026 / this Friday / tomorrow → YYYY-MM-DD. */
export function parseUkCalendarDay(text: string, today = new Date()): string | null {
  const t = text.replace(/\s+/g, ' ');
  return explicitCalendarDay(t, today) || parseWeekdayRelativeDay(t, today) || parseTodayTomorrow(t, today);
}

/** "tomorrow" / "tonight" / "today" — only when no calendar day was named. */
function parseTodayTomorrow(text: string, today = new Date()): string | null {
  const t = text.replace(/\s+/g, ' ');
  const start = utcYmd(today);
  if (/\btomorrow\b/i.test(t)) {
    return formatUtcYmd(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1)));
  }
  if (/\b(?:today|tonight)\b/i.test(t)) return formatUtcYmd(start);
  return null;
}

function mentionsDayNumber(text: string, ymd: string): boolean {
  const day = Number(ymd.slice(8, 10));
  if (!day) return false;
  const suffix =
    (day % 10 === 1 && day !== 11) ? 'st' :
    (day % 10 === 2 && day !== 12) ? 'nd' :
    (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
  const t = text.replace(/\s+/g, ' ');
  if (new RegExp(`\\b${day}${suffix}\\b`, 'i').test(t)) return true;
  return new RegExp(`\\b(?:on|the)\\s+${day}\\b`, 'i').test(t);
}

function isSpecificAttendableEventTitle(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!titleNamesAttendableEvent(t)) return false;
  return !BARE_EVENT_NOUN_RE.test(t);
}

/** A person's name is not an event. "for Teddy" must not split a card into the event. */
function isNamedEventTarget(title: string): boolean {
  if (!isSpecificAttendableEventTitle(title)) return false;
  if (/^[A-Za-z]+$/.test(title) && !/\b(wedding|party|birthday|gala|operation|surgery|haircut|appointment)\b/i.test(title)) {
    return false;
  }
  return true;
}

export function isCollapsedWorkForEvent(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  const dash = t.split(/\s+[—–-]\s+/);
  if (dash.length >= 2 && isSpecificAttendableEventTitle(dash[0])) return true;
  const forEvent = t.match(/^(.+?)\s+for\s+(.+)$/i);
  return !!forEvent && isNamedEventTarget(forEvent[2]);
}

/**
 * Chat/email may become an occurrence only when they named the event itself
 * (or work clearly for that event) AND an unambiguous calendar day.
 * Dated chores stay obligations (Offload → General to do).
 */
export function isNamedDatedLifeEventCapture(title: string, sourceText: string): boolean {
  if (hasSoftOrInferredDateLanguage(sourceText)) return false;
  if (!hasUnambiguousStatedDate(sourceText)) return false;
  if (isTransactionalConfirmation(title, sourceText)) return false;
  if (isCollapsedWorkForEvent(title)) return true;
  if (ADMIN_TASK_TITLE_RE.test(title.trim())) return false;
  if (isSpecificAttendableEventTitle(title)) return true;
  const fromText = statedEventFromOffload(sourceText);
  if (fromText && (titlesAlign(fromText, title) || titlesLooselyMatch(fromText, title))) return true;
  return false;
}

function foldTitle(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/['’]/g, '')
    .replace(/\bpre[- ]?opp?\b/gi, 'preop')
    .trim()
    .toLowerCase();
}

function titlesLooselyMatch(a: string, b: string): boolean {
  const na = foldTitle(a);
  const nb = foldTitle(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

export function parseIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== m - 1) return null;
  if (!match[4]) return `${match[1]}-${match[2]}-${match[3]}`;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}`;
}

export function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

const MONTH_NAME =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const ORDINAL_DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const WEEKDAY = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const WEEKDAY_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** "Wednesday next week" / "next Wednesday" / "this Friday" — not "Friday" or "next week" alone. */
function weekdayRelativePattern(): string {
  return `(?:${WEEKDAY})\\s+(?:this|next)\\s+week|(?:this|next)\\s+week(?:\\s+on)?\\s+(?:${WEEKDAY})|next\\s+(?:${WEEKDAY})|this\\s+(?:${WEEKDAY})`;
}

export function hasWeekdayRelativeDate(text: string): boolean {
  return new RegExp(`\\b(?:on\\s+)?(?:${weekdayRelativePattern()})\\b`, 'i').test(text.replace(/\s+/g, ' '));
}

function utcYmd(today: Date): Date {
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

function formatUtcYmd(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mondayOfContainingWeek(utcDay: Date, weekOffset: number): Date {
  const dow = utcDay.getUTCDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), utcDay.getUTCDate() + toMonday + weekOffset * 7));
}

function ymdOnWeekday(monday: Date, weekday: number): string {
  const fromMonday = weekday === 0 ? 6 : weekday - 1;
  return formatUtcYmd(
    new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + fromMonday)),
  );
}

/** Resolve "Wednesday next week" against a UK week (Monday start). */
export function parseWeekdayRelativeDay(text: string, today = new Date()): string | null {
  const t = text.replace(/\s+/g, ' ');
  const named = (match: RegExpMatchArray | null, a: number, b: number): string | null => {
    const raw = match?.[a] || match?.[b];
    if (!raw) return null;
    return raw.toLowerCase();
  };

  const inWeek = t.match(
    new RegExp(`\\b(?:on\\s+)?(${WEEKDAY})\\s+(this|next)\\s+week\\b|\\b(this|next)\\s+week(?:\\s+on)?\\s+(${WEEKDAY})\\b`, 'i'),
  );
  if (inWeek) {
    const weekdayName = named(inWeek, 1, 4);
    const which = (inWeek[2] || inWeek[3] || '').toLowerCase();
    const weekday = weekdayName ? WEEKDAY_NUM[weekdayName] : undefined;
    if (weekday == null) return null;
    const monday = mondayOfContainingWeek(utcYmd(today), which === 'next' ? 1 : 0);
    return ymdOnWeekday(monday, weekday);
  }

  const thisWeekday = t.match(new RegExp(`\\bthis\\s+(${WEEKDAY})\\b`, 'i'));
  if (thisWeekday) {
    const weekday = WEEKDAY_NUM[thisWeekday[1].toLowerCase()];
    if (weekday == null) return null;
    return ymdOnWeekday(mondayOfContainingWeek(utcYmd(today), 0), weekday);
  }

  const nextWeekday = t.match(new RegExp(`\\bnext\\s+(${WEEKDAY})\\b`, 'i'));
  if (nextWeekday) {
    const weekday = WEEKDAY_NUM[nextWeekday[1].toLowerCase()];
    if (weekday == null) return null;
    const start = utcYmd(today);
    let delta = (weekday - start.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return formatUtcYmd(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + delta)),
    );
  }

  return null;
}

const CLOCK_COLON_RE = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i;
const CLOCK_MERIDIEM_RE = /\b(\d{1,2})\s*(am|pm)\b/i;
const APPOINTMENT_CLOCK_RE =
  /\b(?:arrive\s+)?(?:by|at|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const APPOINTMENT_CONTEXT_RE =
  /\b(arrive|appointment|meeting|operation|surgery|dentist|hospital|nursery|interview|parents\s+evening|drop[- ]off)\b/i;
const TRANSACTIONAL_CONFIRMATION_RE =
  /\b(we(?:['’]ve| have)\s+(?:accepted|received|processed|confirmed)|(?:your\s+)?(?:return|order|request|booking)\s+(?:has been|was|have been)\s+(?:accepted|received|processed|requested|submitted|placed|confirmed)|(?:return|order|request)\s+you\s+submitted|submitted\s+on|placed\s+on|accepted\s+on|order was placed)\b/i;

/** Order/return/request confirmations — dated admin, not something you attend. */
export function isTransactionalConfirmation(title?: string | null, sourceText?: string | null): boolean {
  const blob = `${title || ''} ${sourceText || ''}`.replace(/\s+/g, ' ').trim();
  if (!blob) return false;
  return TRANSACTIONAL_CONFIRMATION_RE.test(blob);
}

function clockFromMatch(
  hourRaw: string,
  minuteRaw: string | undefined,
  suffixRaw: string | undefined,
): string | null {
  let hour = Number.parseInt(hourRaw, 10);
  const minute = minuteRaw ? Number.parseInt(minuteRaw, 10) : 0;
  const suff = (suffixRaw || '').toLowerCase();
  if (Number.isNaN(hour) || hour > 23 || Number.isNaN(minute) || minute > 59) return null;
  if (suff === 'pm' && hour < 12) hour += 12;
  if (suff === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1);
  const end = text.indexOf('.', index);
  return text.slice(start, end < 0 ? text.length : end);
}

/** "Sep 23, 2026, 7:43 pm" / time sitting on "on" — a recorded timestamp, not arrive-at. */
function isDateTimestampClock(text: string, clockIndex: number): boolean {
  const before = text.slice(Math.max(0, clockIndex - 48), clockIndex);
  if (/\bon\s+$/i.test(before)) return true;
  if (/\b20\d{2}\s*,?\s*$/.test(before)) return true;
  if (new RegExp(`\\b(?:${MONTH_NAME})\\s+${ORDINAL_DAY}(?:\\s*,?\\s*20\\d{2})?\\s*,?\\s*$`, 'i').test(before)) {
    return true;
  }
  return false;
}

/** "by 7:30" / "at 7:30am" → HH:MM. Do not treat "by the 19th" or confirmation timestamps as a clock. */
export function parseStatedClock(text: string): string | null {
  const t = text.replace(/\s+/g, ' ');
  const appointment = t.match(APPOINTMENT_CLOCK_RE);
  if (appointment && !/\bby\s+the\s+\d/i.test(appointment[0])) {
    return clockFromMatch(appointment[1], appointment[2], appointment[3]);
  }
  const loose = t.match(CLOCK_COLON_RE) || t.match(CLOCK_MERIDIEM_RE);
  if (!loose || loose.index == null) return null;
  const around = sentenceAround(t, loose.index);
  if (TRANSACTIONAL_CONFIRMATION_RE.test(around)) return null;
  if (isDateTimestampClock(t, loose.index)) return null;
  if (!APPOINTMENT_CONTEXT_RE.test(t)) return null;
  const colon = CLOCK_COLON_RE.test(loose[0]);
  return clockFromMatch(loose[1], colon ? loose[2] : undefined, colon ? loose[3] : loose[2]);
}

function withStatedClock(ymd: string, text: string): string {
  const day = dateOnly(ymd);
  if (!day) return ymd;
  if (/T\d{2}:\d{2}/.test(ymd) && !/T00:00/.test(ymd)) return ymd;
  const clock = parseStatedClock(text);
  if (!clock) return day;
  return `${day}T${clock}:00`;
}

/** A specific calendar day named as fact — not "Friday" or "next week" alone. */
export function hasUnambiguousStatedDate(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  if (new RegExp(`\\b(?:on|from|until|closed(?:\\s+on)?)\\s+(?:the\\s+)?${ORDINAL_DAY}\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b${ORDINAL_DAY}\\s+(?:of\\s+)?(?:${MONTH_NAME})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:${MONTH_NAME})\\s+${ORDINAL_DAY}\\b`, 'i').test(t)) return true;
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(t)) return true;
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t)) return true;
  if (hasWeekdayRelativeDate(t)) return true;
  if (/\b(?:tomorrow|tonight|today)\b/i.test(t)) return true;
  return false;
}

/** A calendar-day span as written: 23rd October, October 23, 2026-10-23, Wednesday next week. */
function calendarDayPattern(): string {
  return `(?:the\\s+)?${ORDINAL_DAY}\\s+(?:of\\s+)?(?:${MONTH_NAME})|(?:${MONTH_NAME})\\s+${ORDINAL_DAY}|20\\d{2}-\\d{2}-\\d{2}|${weekdayRelativePattern()}`;
}

function cleanEventPhrase(raw: string): string {
  return raw
    .replace(/^(?:oh\s+)?(?:also\s+)?(?:btw\s+)?/i, '')
    .replace(/^(?:there(?:'s| is)|it(?:'s| is)|a|an|the)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isConcreteEventPhrase(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t || t.length < 3 || t.length > 60) return false;
  if (BARE_EVENT_NOUN_RE.test(t)) return false;
  if (isGenericDiaryTitle(t) || isChoreLikeTitle(t)) return false;
  if (isTransactionalConfirmation(t)) return false;
  if (/^(form|email|call|reminder|deadline|flights?|tickets?|shoes?)$/i.test(t)) return false;
  return true;
}

function titlesAlign(a: string, b: string): boolean {
  const norm = (value: string) => value.replace(/\s+/g, ' ').replace(/['’]/g, '').trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * The date in this offload is attached to something that happens that day
 * ("X is on 23 October", "spa day on 12 June") — not a chore deadline
 * ("book the eye test on…", "return the form by…").
 */
export function statedEventFromOffload(text: string): string | null {
  if (hasSoftOrInferredDateLanguage(text)) return null;
  if (!hasUnambiguousStatedDate(text)) return null;
  if (isTransactionalConfirmation(null, text)) return null;

  const possessive = namedPossessiveLifeEvent(text);
  if (possessive) return possessive;

  const datePat = calendarDayPattern();
  const clauses = text.split(/[.;\n]|\s+[-–—]\s+/);
  for (const clause of clauses) {
    const title = eventTitleFromClause(clause, datePat);
    if (title) return title;
  }

  const forEvent = text.match(new RegExp(`\\bfor\\s+(.+?)\\s+(?:is\\s+)?on\\s+(?:${datePat})\\b`, 'i'));
  if (forEvent) {
    const title = cleanEventPhrase(forEvent[1]);
    if (title && !ADMIN_TASK_TITLE_RE.test(title) && isConcreteEventPhrase(title)) {
      return titleCaseLabel(title);
    }
  }

  return null;
}

function eventTitleFromClause(clause: string, datePat: string): string | null {
  const c = clause.replace(/\s+/g, ' ').trim();
  if (!c) return null;
  if (ADMIN_TASK_TITLE_RE.test(c)) return null;
  const hasStatedDay = new RegExp(`\\bis(?:\\s+on)?\\s+(?:${datePat})\\b`, 'i').test(c);
  if (/\b(by|due)\s+(?:the\s+)?\d/i.test(c) && !hasStatedDay) return null;

  const isOn = c.match(new RegExp(`^(.+?)\\s+(?:is|it'?s)\\s+(?:on\\s+)?(?:${datePat})\\b`, 'i'));
  const on = isOn || c.match(new RegExp(`^(.+?)\\s+(?:on|for)\\s+(?:${datePat})\\b`, 'i'));
  if (!on) return null;
  const title = cleanEventPhrase(on[1]);
  if (!title || ADMIN_TASK_TITLE_RE.test(title) || !isConcreteEventPhrase(title)) return null;
  if (isTransactionalConfirmation(title, c)) return null;
  return titleCaseLabel(title);
}

export function hasSoftOrInferredDateLanguage(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  if (/\b(sometime|some\s+time)\b/i.test(t)) return true;
  if (/\b\w+-ish\b/i.test(t)) return true;
  if (new RegExp(`\\blate\\s+(?:on\\s+)?(?:${WEEKDAY})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:might|maybe|perhaps|possibly)\\b.{0,48}\\b(?:next\\s+week|this\\s+week|pop\\s+in|be\\s+back|come\\s+by|come\\s+in)\\b`, 'i').test(t)) {
    return true;
  }
  if (new RegExp(`\\b(?:next\\s+week|this\\s+week|pop\\s+in|be\\s+back)\\b.{0,48}\\b(?:might|maybe|perhaps|possibly)\\b`, 'i').test(t)) {
    return true;
  }
  if (/\b(?:next|this)\s+week\b/i.test(t) && !hasUnambiguousStatedDate(t)) return true;
  return false;
}

/**
 * Email/chat may write occurs_at only for high-confidence context_only whose
 * source names a calendar day as fact. Obligations and inferred dates never qualify.
 */
export function informationalScheduleOccursAt(params: {
  kind: IntakeKind;
  confidence: Confidence;
  source: IntakeSource;
  sourceText: string;
  candidate: string | null;
}): string | null {
  if (params.source === 'calendar') return null;
  if (params.kind !== 'context_only') return null;
  if (params.confidence !== 'high') return null;
  return statedCalendarDay(params);
}

/** Email/chat occurrence: a named event on an unambiguous day, not a chore deadline. */
export function statedEventOccursAt(params: {
  kind: IntakeKind;
  confidence: Confidence;
  source: IntakeSource;
  sourceText: string;
  title: string;
  candidate: string | null;
}): string | null {
  if (params.source === 'calendar') return null;
  if (params.kind !== 'occurrence') return null;
  if (params.confidence === 'low') return null;
  if (!isNamedDatedLifeEventCapture(params.title, params.sourceText)) return null;
  return statedCalendarDay(params);
}

function statedCalendarDay(params: {
  source: IntakeSource;
  sourceText: string;
  candidate: string | null;
}): string | null {
  if (hasSoftOrInferredDateLanguage(params.sourceText)) return null;
  const explicit = explicitCalendarDay(params.sourceText);
  const weekday = parseWeekdayRelativeDay(params.sourceText);
  const candidate = dateOnly(params.candidate);
  if (weekday) return withStatedClock(weekday, params.sourceText);
  if (explicit) {
    if (candidate && explicit.slice(5) === candidate.slice(5)) return withStatedClock(candidate, params.sourceText);
    return withStatedClock(explicit, params.sourceText);
  }
  if (candidate && mentionsDayNumber(params.sourceText, candidate)) {
    return withStatedClock(candidate, params.sourceText);
  }
  const relative = parseTodayTomorrow(params.sourceText);
  if (relative) return withStatedClock(relative, params.sourceText);
  if (!hasUnambiguousStatedDate(params.sourceText)) return null;
  return candidate ? withStatedClock(candidate, params.sourceText) : null;
}

export function hasPersistableKind(items: IntakeItem[]): boolean {
  return items.some((item) => KINDS.includes(item.kind) && !!item.title);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function defaultSurfaceWindow(item: {
  title: string;
  kind: IntakeKind;
  occurs_at: string | null;
  due_at: string | null;
}): { surface_from: string | null; surface_until: string | null } {
  const anchor = dateOnly(item.occurs_at) || dateOnly(item.due_at);
  const title = item.title;

  if (item.kind === 'hold' || item.kind === 'list_item' || item.kind === 'context_only') {
    if (!anchor) return { surface_from: null, surface_until: null };
  }

  if (!anchor) return { surface_from: null, surface_until: null };

  if (BIRTHDAY_RE.test(title) || item.kind === 'occurrence' && BIRTHDAY_RE.test(title)) {
    return { surface_from: addDays(anchor, -7), surface_until: anchor };
  }
  if (HOLIDAY_RE.test(title)) {
    const days = /\bpassport\b/i.test(title) ? -90 : -60;
    return { surface_from: addDays(anchor, days), surface_until: anchor };
  }
  if (FORM_RE.test(title) || item.kind === 'obligation' && FORM_RE.test(title)) {
    return { surface_from: addDays(anchor, -14), surface_until: anchor };
  }
  if (APPOINT_RE.test(title)) {
    return { surface_from: addDays(anchor, -1), surface_until: anchor };
  }
  if (item.kind === 'obligation') {
    return { surface_from: addDays(anchor, -3), surface_until: anchor };
  }
  if (item.kind === 'occurrence') {
    if (BIRTHDAY_RE.test(title)) return { surface_from: addDays(anchor, -7), surface_until: anchor };
    return { surface_from: addDays(anchor, -1), surface_until: anchor };
  }
  return { surface_from: addDays(anchor, -3), surface_until: anchor };
}

function asKind(value: unknown, _source: IntakeSource): IntakeKind | null {
  if (typeof value !== 'string') return null;
  const kind = value.trim().toLowerCase();
  if (!KINDS.includes(kind as IntakeKind)) return null;
  return kind as IntakeKind;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase() as T;
  return allowed.includes(v) ? v : fallback;
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  const title = value.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  if (!title || title.toLowerCase() === 'null') return '';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function cleanEvidence(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return '';
  return text.slice(0, 280);
}

export function sourceHasGiftExclusion(sourceText: string): boolean {
  return GIFT_EXCLUSION_RE.test(sourceText);
}

export function sourceHasCardExclusion(sourceText: string): boolean {
  return CARD_EXCLUSION_RE.test(sourceText);
}

export function isEventKitTitle(title?: string | null): boolean {
  return KIT_TITLE_RE.test(title || '');
}

export function sourceAsksForRsvp(sourceText: string): boolean {
  return RSVP_ASK_RE.test(sourceText);
}

export function isExcludedPrep(title: string, sourceText: string): boolean {
  if (GIFT_TITLE_RE.test(title) && sourceHasGiftExclusion(sourceText)) return true;
  if (CARD_TITLE_RE.test(title) && sourceHasCardExclusion(sourceText)) return true;
  return false;
}

export function titlesAlreadyCoverPrep(titles: string[], kind: 'gift' | 'card'): boolean {
  const re = kind === 'gift' ? GIFT_TITLE_RE : CARD_TITLE_RE;
  return titles.some((title) => re.test(title));
}

/** Drop low-confidence invented prep; keep stated items and high-confidence type defaults. */
export function shouldPersistObligation(item: IntakeItem): boolean {
  if (item.kind !== 'obligation') return true;
  if (item.confidence === 'low' && item.prep_implied === 'inferred') return false;
  if (item.confidence === 'low' && item.actionable !== 'yes') return false;
  return true;
}

export function normalizeIntakeItem(
  raw: RawIntakeItem,
  opts: { source: IntakeSource; sourceText: string; fallbackTitle?: string },
): IntakeItem | null {
  const title = cleanTitle(raw.title) || cleanTitle(opts.fallbackTitle);
  if (!title) return null;

  let kind = asKind(raw.kind, opts.source) ?? (opts.source === 'calendar' ? 'occurrence' : 'obligation');
  const rawOccurs = parseIsoDateTime(raw.occurs_at);
  let due_at = parseIsoDateTime(raw.due_at);
  if (opts.source !== 'calendar' && !due_at && kind !== 'occurrence') {
    due_at = rawOccurs;
  }

  if (kind === 'hold') due_at = null;

  const prep_implied = asEnum(
    raw.prep_implied ?? raw.prep_origin,
    PREP_IMPLIED,
    'none',
  );
  const confidence = asEnum(raw.confidence, CONFIDENCE, 'medium');
  const actionable = asEnum(raw.actionable, ACTIONABLE, kind === 'obligation' ? 'yes' : 'no');
  const evidence = cleanEvidence(raw.evidence);
  const candidate = rawOccurs || due_at;

  let occurs_at: string | null = null;
  if (opts.source === 'calendar') {
    occurs_at = rawOccurs;
  } else if (kind === 'occurrence') {
    occurs_at = statedEventOccursAt({
      kind,
      confidence,
      source: opts.source,
      sourceText: opts.sourceText,
      title,
      candidate,
    });
    if (!occurs_at) {
      const day = statedCalendarDay({
        source: opts.source,
        sourceText: opts.sourceText,
        candidate,
      });
      if (day && isNamedDatedLifeEventCapture(title, opts.sourceText)) {
        occurs_at = day;
      } else {
        kind = due_at || isTransactionalConfirmation(title, opts.sourceText) ? 'obligation' : 'context_only';
      }
    }
    if (occurs_at) due_at = null;
  } else if (kind === 'context_only') {
    occurs_at = informationalScheduleOccursAt({
      kind,
      confidence,
      source: opts.source,
      sourceText: opts.sourceText,
      candidate,
    });
  }

  if (isExcludedPrep(title, opts.sourceText)) return null;
  if (isAdminStatusTitle(title)) return null;
  if (kind === 'obligation' && isEventKitTitle(title)) {
    due_at = null;
  }
  if (kind === 'obligation' && due_at && /T\d{2}:\d{2}/.test(due_at) && !parseStatedClock(opts.sourceText)) {
    due_at = isTransactionalConfirmation(title, opts.sourceText) ? null : dateOnly(due_at);
  }

  const item: IntakeItem = {
    title,
    kind,
    occurs_at,
    due_at,
    actionable,
    prep_implied,
    confidence,
    evidence,
    surface_from: parseIsoDateTime(raw.surface_from),
    surface_until: parseIsoDateTime(raw.surface_until),
  };

  if (!shouldPersistObligation(item)) return null;

  if (!item.surface_from || !item.surface_until) {
    const window = defaultSurfaceWindow(item);
    item.surface_from = item.surface_from ?? window.surface_from;
    item.surface_until = item.surface_until ?? window.surface_until;
  }

  return item;
}

export function normalizeIntakeItems(
  rawItems: unknown,
  opts: { source: IntakeSource; sourceText: string; fallbackTitle?: string },
): IntakeItem[] {
  const rows = Array.isArray(rawItems) ? rawItems : [];
  const out: IntakeItem[] = [];
  const seen = new Set<string>();
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const item = normalizeIntakeItem(entry as RawIntakeItem, opts);
    if (!item) continue;
    const key = `${item.kind}:${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function labelsToStatedObligations(
  labels: string[],
  opts: { due_at: string | null; sourceText: string; evidence?: string },
): IntakeItem[] {
  return normalizeIntakeItems(
    labels.map((title) => ({
      title,
      kind: 'obligation',
      occurs_at: null,
      due_at: opts.due_at,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: opts.evidence || title,
    })),
    { source: 'email', sourceText: opts.sourceText },
  );
}

export function intakeRowFields(item: IntakeItem): Record<string, unknown> {
  return {
    kind: item.kind,
    occurs_at: item.occurs_at,
    due_at: item.due_at,
    confidence: item.confidence,
    prep_origin: item.prep_implied,
    evidence: item.evidence,
    surface_from: item.surface_from,
    surface_until: item.surface_until,
  };
}

export function eventDateFromIntake(item: IntakeItem, source: IntakeSource): string | null {
  if (source === 'calendar') return item.occurs_at;
  return dateOnly(item.occurs_at || item.due_at);
}

export function finalizeSourceItems(params: {
  source: 'email' | 'chat';
  sourceText: string;
  fallbackTitle?: string | null;
  date?: string | null;
  rawItems: unknown;
  extraLabels?: string[];
}): IntakeItem[] {
  let items = normalizeIntakeItems(params.rawItems, {
    source: params.source,
    sourceText: params.sourceText,
    fallbackTitle: params.fallbackTitle ?? undefined,
  });

  if (!items.length && params.fallbackTitle) {
    if (isAdminStatusTitle(params.fallbackTitle) || isAdminStatusConfirmation(params.sourceText)) {
      return [];
    }
    const statedFact =
      !!params.date &&
      hasUnambiguousStatedDate(params.sourceText) &&
      !hasSoftOrInferredDateLanguage(params.sourceText);
    const kind = params.extraLabels?.length
      ? 'context_only'
      : statedFact
        ? 'context_only'
        : 'hold';
    items = normalizeIntakeItems(
      [{
        title: params.fallbackTitle,
        kind,
        occurs_at: statedFact ? params.date ?? null : null,
        due_at: kind === 'hold' ? null : params.date ?? null,
        actionable: kind === 'obligation' ? 'yes' : 'no',
        prep_implied: 'none',
        confidence: statedFact ? 'high' : 'medium',
        evidence: '',
      }],
      { source: params.source, sourceText: params.sourceText },
    );
  }

  if (params.extraLabels?.length) {
    const extra = params.extraLabels
      .filter((title) => !isAttendanceRestatement(title))
      .map((title) => ({
      title,
      kind: 'obligation',
      occurs_at: null,
      due_at: params.date ?? null,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: title,
    }));
    items = [
      ...items,
      ...normalizeIntakeItems(extra, { source: params.source, sourceText: params.sourceText }),
    ];
  }

  items = dropRedundantEventWork(
    expandCollapsedLifeEvent(items, params.sourceText, params.date ?? null),
  );

  const parent = items[0];
  const due = parent?.due_at ?? params.date ?? null;
  const defaults = birthdayTypeDefaults({
    sourceText: params.sourceText,
    existingTitles: items.map((item) => item.title),
    due_at: due,
  });
  const existingTitles = items.map((item) => item.title);
  for (const extra of defaults) {
    if (items.some((item) => item.title.toLowerCase() === extra.title.toLowerCase())) continue;
    if (GIFT_TITLE_RE.test(extra.title) && titlesAlreadyCoverPrep(existingTitles, 'gift')) continue;
    if (CARD_TITLE_RE.test(extra.title) && titlesAlreadyCoverPrep(existingTitles, 'card')) continue;
    items.push(extra);
  }

  items = applyPartyRsvp(items, params.sourceText, due);
  if (sourceHasGiftExclusion(params.sourceText)) {
    items = items.filter((item) => !DONATION_RE.test(item.title));
  }

  return rewriteAdminAskParent(promoteStatedLifeEvent(items, params.sourceText));
}

/** Birthday / trip / wedding named as context_only still belongs on Schedule as an occurrence. */
function promoteStatedLifeEvent(items: IntakeItem[], sourceText: string): IntakeItem[] {
  if (hasSoftOrInferredDateLanguage(sourceText)) return items;
  if (!hasUnambiguousStatedDate(sourceText)) return items;
  return items.map((item) => {
    if (item.kind !== 'context_only') return item;
    if (item.confidence === 'low') return item;
    if (!isNamedDatedLifeEventCapture(item.title, sourceText)) return item;
    const day =
      parseWeekdayRelativeDay(sourceText) || dateOnly(item.occurs_at) || dateOnly(item.due_at);
    if (!day) return item;
    return {
      ...item,
      kind: 'occurrence',
      occurs_at: withStatedClock(day, sourceText),
      due_at: null,
      actionable: 'no',
    };
  });
}

function applyPartyRsvp(items: IntakeItem[], sourceText: string, due: string | null): IntakeItem[] {
  if (!sourceAsksForRsvp(sourceText)) return items;
  if (items.some((item) => RSVP_TITLE_RE.test(item.title))) {
    return demotePartyObligation(items);
  }
  const rsvp = normalizeIntakeItem(
    {
      title: 'RSVP',
      kind: 'obligation',
      due_at: due,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'reply',
    },
    { source: 'email', sourceText },
  );
  if (!rsvp) return items;
  return demotePartyObligation([...items, rsvp]);
}

function demotePartyObligation(items: IntakeItem[]): IntakeItem[] {
  if (!items.length) return items;
  const head = items[0];
  if (head.kind !== 'obligation') return items;
  if (!BIRTHDAY_RE.test(head.title)) return items;
  const day = dateOnly(head.occurs_at) || dateOnly(head.due_at);
  return [
    {
      ...head,
      kind: day ? 'occurrence' : 'context_only',
      occurs_at: day,
      due_at: null,
      actionable: 'no',
    },
    ...items.slice(1),
  ];
}

function titleCaseLabel(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function splitCollapsedEventTitle(title: string, sourceText: string): { eventTitle: string; actionTitle: string | null } {
  const parts = title.split(/\s+[—–-]\s+/);
  if (parts.length >= 2 && isSpecificAttendableEventTitle(parts[0])) {
    return { eventTitle: titleCaseLabel(parts[0]), actionTitle: titleCaseLabel(parts.slice(1).join(' — ')) };
  }

  const forEvent = title.match(/^(.+?)\s+for\s+(.+)$/i);
  if (forEvent && isNamedEventTarget(forEvent[2])) {
    return { eventTitle: titleCaseLabel(forEvent[2]), actionTitle: titleCaseLabel(forEvent[1]) };
  }

  let actionTitle: string | null = null;
  const blob = `${title} ${sourceText}`;
  if (/\bspeech\b/i.test(blob) && isSpecificAttendableEventTitle(title)) {
    actionTitle = /\bchairman\b/i.test(blob) ? 'Write the chairman speech' : 'Write the speech';
  }
  return { eventTitle: titleCaseLabel(title), actionTitle };
}

function withSurfaceWindow(item: IntakeItem): IntakeItem {
  const window = defaultSurfaceWindow(item);
  return {
    ...item,
    surface_from: window.surface_from,
    surface_until: window.surface_until,
  };
}

/** One obligation that names both an event and the work — split so Schedule and Radar can each hold a row. */
export function expandCollapsedLifeEvent(
  items: IntakeItem[],
  sourceText: string,
  fallbackDate?: string | null,
): IntakeItem[] {
  const sourceEvent = statedEventFromOffload(sourceText);
  if (items.some((item) => item.kind === 'occurrence')) {
    return withNeedToWork(items, sourceText, fallbackDate ?? null);
  }

  let idx = items.findIndex(
    (item) => item.kind === 'obligation' && isNamedDatedLifeEventCapture(item.title, sourceText),
  );
  if (idx < 0 && sourceEvent) {
    const head = items[0];
    const headIsEvent =
      !!head &&
      head.kind !== 'obligation' &&
      (titlesAlign(head.title, sourceEvent) || titlesLooselyMatch(head.title, sourceEvent));
    if (!headIsEvent) idx = items.findIndex((item) => item.kind === 'obligation');
  }

  const dateFromSource = (() => {
    const day =
      parseWeekdayRelativeDay(sourceText) || dateOnly(fallbackDate ?? null) || parseUkCalendarDay(sourceText);
    return day ? withStatedClock(day, sourceText) : null;
  })();

  if (idx < 0) {
    if (!sourceEvent || !dateFromSource) return items;
    const seed = items[0];
    const occurrence = withSurfaceWindow({
      title: sourceEvent,
      kind: 'occurrence',
      occurs_at: dateFromSource,
      due_at: null,
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: sourceText,
      surface_from: seed?.surface_from ?? null,
      surface_until: seed?.surface_until ?? null,
    });
    const rest = items.filter((row) => !titlesAlign(row.title, sourceEvent));
    return withNeedToWork([occurrence, ...rest], sourceText, dateFromSource);
  }

  const item = items[idx];
  const date = dateFromSource || dateOnly(item.due_at) || dateOnly(item.occurs_at);
  if (!date) return items;

  const split = splitCollapsedEventTitle(item.title, sourceText);
  const eventTitle = sourceEvent || split.eventTitle;
  if (!eventTitle) return items;
  const actionTitle =
    split.actionTitle ||
    (sourceEvent &&
    !titlesLooselyMatch(item.title, eventTitle) &&
    !isAttendanceRestatement(item.title)
      ? item.title
      : null);

  const rest = items.filter((_, i) => i !== idx).filter((row) => row.title.toLowerCase() !== item.title.toLowerCase());
  const occurrence = withSurfaceWindow({
    ...item,
    title: eventTitle,
    kind: 'occurrence',
    occurs_at: date,
    due_at: null,
    actionable: 'no',
    prep_implied: 'none',
  });
  const hasWork = rest.some((row) => row.kind === 'obligation');
  if (!hasWork && actionTitle && actionTitle.toLowerCase() !== occurrence.title.toLowerCase()) {
    const obligation = withSurfaceWindow({
      ...item,
      title: actionTitle,
      kind: 'obligation',
      occurs_at: null,
      due_at: date,
      actionable: 'yes',
      prep_implied: 'stated',
    });
    return withNeedToWork([occurrence, obligation, ...rest], sourceText, date);
  }
  return withNeedToWork([occurrence, ...rest], sourceText, date);
}

function withNeedToWork(items: IntakeItem[], sourceText: string, due: string | null): IntakeItem[] {
  if (!items.some((item) => item.kind === 'occurrence')) return items;
  if (items.some((item) => item.kind === 'obligation')) return items;
  const work = statedNeedToWork(sourceText, due);
  return work ? [...items, work] : items;
}

const DISTINCT_EVENT_WORK_RE =
  /\b(book|email|call|text|pack|buy|write|rsvp|form|pay|order|pick\s*up|arrange|organise|organize|confirm|speech|flights?)\b/i;
const ATTEND_EVENT_RE =
  /^(arrive|be there|get there|get to|go to|go along to|attend|turn up|show up|be at|make it to|head(?:\s+over)?\s+to)\b/i;

export type AdminWorkTopic = 'auth' | 'rsvp' | 'form' | 'payment';

const AUTH_DONE_RE =
  /\b(can now confirm|now confirm|now have|we have the required (authoris|authoriz)|authorisation is in place|authorization is in place|admission authoris(?:ed|ation)|hospital admission authoris)\b/i;
const AUTH_ASK_RE =
  /\b((no |not |without |missing |outstanding )(authoris|authoriz)|(authoris|authoriz).{0,24}\b(needed|required|not (on file|in place)))/i;
const AUTH_ASK_TITLE_RE =
  /\b((bupa\s+)?auth(orisation|orization)? needed|no authoris|authoris(?:ation|ed) required)\b/i;

/** Latest reply only — quoted "no authorisation" in a thread must not hide a confirmation. */
export function latestEmailMessage(sourceText: string): string {
  let text = sourceText || '';
  const bodyIdx = text.search(/\bBody:\s*/i);
  if (bodyIdx >= 0) text = text.slice(bodyIdx).replace(/^Body:\s*/i, '');
  const quote = text.search(/\r?\nFrom: |\r?\nOn .+ wrote:|\r?\n_{8,}|\r?\n> /);
  if (quote > 20) text = text.slice(0, quote);
  return text.replace(/\s+/g, ' ').trim();
}

/** Title is the fact that admin finished — not a happening. */
export function isAdminStatusTitle(title: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (AUTH_ASK_TITLE_RE.test(t)) return false;
  if (/\b(hospital\s+)?admission\s+authoris(?:ed|ation)\b/i.test(t)) return true;
  if (/\b(authoris(?:ed|ation)|authoriz(?:ed|ation))\s+(in\s+place|confirmed|received)\b/i.test(t)) return true;
  if (/\b(rsvp|form|payment|invoice)\s+(received|confirmed|noted)\b/i.test(t)) return true;
  if (/\bpayment received\b|\bpaid in full\b/i.test(t) && !/\b(due|outstanding|need)\b/i.test(t)) return true;
  return false;
}

export function isAdminAskTitle(title: string): boolean {
  return AUTH_ASK_TITLE_RE.test(title || '');
}

export function isAdminStatusConfirmation(sourceText: string): boolean {
  const latest = latestEmailMessage(sourceText);
  if (!latest) return false;
  if (isAuthDone(latest) && !isAuthAskOnly(latest)) return true;
  if (/\b(rsvp|reply)\b.{0,24}\b(received|noted|confirmed)\b/i.test(latest)) return true;
  if (/\b(form|permission slip)\b.{0,24}\b(received|submitted|on file)\b/i.test(latest)) return true;
  if (/\b(payment|invoice)\b.{0,24}\b(received|confirmed|paid)\b/i.test(latest)) return true;
  return false;
}

/** Status mail with no new obligation — ignore; do not complete existing Plan items. */
export function isIgnorableStatusUpdate(params: {
  sourceText: string;
  title?: string | null;
  items?: { title?: string | null; kind?: string | null }[];
}): boolean {
  const items = params.items ?? [];
  if (items.some((item) => (item.kind || '').toLowerCase() === 'obligation')) return false;
  return (
    isAdminStatusConfirmation(params.sourceText) ||
    isAdminStatusTitle(params.title || '') ||
    items.some((item) => isAdminStatusTitle(item.title || ''))
  );
}

function isAuthDone(text: string): boolean {
  return AUTH_DONE_RE.test(text);
}

function isAuthAskOnly(text: string): boolean {
  return AUTH_ASK_RE.test(text) && !AUTH_DONE_RE.test(text);
}

export function confirmationTopic(title: string, sourceText: string): AdminWorkTopic | null {
  const blob = `${title || ''} ${latestEmailMessage(sourceText)}`;
  if (isAdminStatusTitle(title) && /\b(authoris|authoriz|admission)\b/i.test(title)) return 'auth';
  if (isAuthDone(latestEmailMessage(sourceText)) && !isAuthAskOnly(latestEmailMessage(sourceText))) return 'auth';
  if (/\b(rsvp|reply)\b.{0,24}\b(received|noted|confirmed)\b/i.test(blob)) return 'rsvp';
  if (/\b(form|permission slip)\b.{0,24}\b(received|submitted|on file)\b/i.test(blob)) return 'form';
  if (/\b(payment|invoice)\b.{0,24}\b(received|confirmed|paid)\b/i.test(blob)) return 'payment';
  return null;
}

export function childMatchesAdminTopic(title: string, topic: AdminWorkTopic): boolean {
  const t = title || '';
  if (topic === 'auth') return /\b(authoris|authoriz|pre-?auth|\bbupa\b|insur(?:ance|er))\b/i.test(t);
  if (topic === 'rsvp') return RSVP_TITLE_RE.test(t);
  if (topic === 'form') return /\b(form|permission|slip|consent)\b/i.test(t);
  if (topic === 'payment') return /\b(pay|payment|invoice|fee)\b/i.test(t);
  return false;
}

export function splitAuthAskTitle(title: string): { eventTitle: string; workTitle: string } | null {
  const t = title.replace(/\s+/g, ' ').trim();
  const match = t.match(
    /^(.*?)\s*[—–-]\s*((?:bupa\s+)?auth(?:orisation|orization)?\s+needed|no authoris(?:ation|ed).*)$/i,
  );
  if (!match?.[1]?.trim()) return null;
  const eventTitle = match[1].replace(/\s+/g, ' ').trim();
  if (!eventTitle) return null;
  const workTitle = /bupa/i.test(match[2] || '') ? 'Confirm Bupa authorisation' : 'Confirm authorisation';
  return { eventTitle, workTitle };
}

export function stripAdminAskFromEventTitle(title: string): string {
  const split = splitAuthAskTitle(title);
  if (split) return split.eventTitle;
  return title.replace(/\s+/g, ' ').trim();
}

function rewriteAdminAskParent(items: IntakeItem[]): IntakeItem[] {
  if (!items.length) return items;
  const split = splitAuthAskTitle(items[0].title);
  if (!split) return items;
  const parent = { ...items[0], title: split.eventTitle };
  const rest = items.slice(1);
  if (rest.some((item) => childMatchesAdminTopic(item.title, 'auth'))) {
    return [parent, ...rest];
  }
  const workDue = parent.due_at || parent.occurs_at;
  const child = withSurfaceWindow({
    title: split.workTitle,
    kind: 'obligation',
    occurs_at: null,
    due_at: workDue,
    actionable: 'yes',
    prep_implied: 'stated',
    confidence: parent.confidence,
    evidence: parent.evidence,
    surface_from: null,
    surface_until: null,
  });
  return [parent, child, ...rest];
}

/** Showing up to the event is the event — not a Radar checklist line. */
export function isAttendanceRestatement(title: string): boolean {
  const t = title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(please\s+)?(?:i\s+)?(?:still\s+)?(?:need to |need |have to |gotta )/i, '');
  if (!t) return false;
  if (DISTINCT_EVENT_WORK_RE.test(t) && !/\barrive\b/i.test(t)) return false;
  if (ATTEND_EVENT_RE.test(t)) return true;
  if (/\barrive\b/i.test(t) && /\b(by|at|before)\b/i.test(t)) return true;
  return false;
}

function eventRestatementCore(value: string): string {
  return foldTitle(value)
    .replace(/\b(next|this|on)\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, '')
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, '')
    .replace(/\b([a-z]+)s\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Child that restates the event itself, or “showing up”, is not a Home checklist line. */
export function isRedundantEventWork(childTitle: string, parentTitle: string): boolean {
  if (isAttendanceRestatement(childTitle)) return true;
  if (DISTINCT_EVENT_WORK_RE.test(childTitle) && !/\barrive\b/i.test(childTitle)) return false;
  if (titlesAlign(childTitle, parentTitle) || titlesLooselyMatch(childTitle, parentTitle)) return true;
  const child = eventRestatementCore(childTitle);
  const parent = eventRestatementCore(parentTitle);
  if (!child || !parent) return false;
  return child === parent || child.includes(parent) || parent.includes(child);
}

function dropRedundantEventWork(items: IntakeItem[]): IntakeItem[] {
  const event = items.find(
    (item) => item.kind === 'occurrence' || (item.kind === 'context_only' && !!item.occurs_at),
  );
  if (!event) return items;
  return items.filter((item) => {
    if (item === event || item.kind !== 'obligation') return true;
    return !isRedundantEventWork(item.title, event.title);
  });
}

function statedNeedToWork(sourceText: string, due: string | null): IntakeItem | null {
  const match = sourceText.match(/\bneed to\s+([^.—\n]+)/i);
  if (!match) return null;
  let title = match[1].replace(/\s+/g, ' ').trim().replace(/\basap\b/gi, '').replace(/[.]+$/, '').trim();
  if (!title || title.length > 48) return null;
  if (isSpecificAttendableEventTitle(title)) return null;
  if (isAttendanceRestatement(title)) return null;
  title = titleCaseLabel(title);
  return withSurfaceWindow({
    title,
    kind: 'obligation',
    occurs_at: null,
    due_at: due,
    actionable: 'yes',
    prep_implied: 'stated',
    confidence: 'high',
    evidence: match[0],
    surface_from: null,
    surface_until: null,
  });
}

export function splitParentAndChildren(
  items: IntakeItem[],
  fallbackTitle: string,
): { parent: IntakeItem; children: IntakeItem[] } {
  if (!items.length) {
    const parent: IntakeItem = {
      title: fallbackTitle,
      kind: 'hold',
      occurs_at: null,
      due_at: null,
      actionable: 'maybe',
      prep_implied: 'none',
      confidence: 'medium',
      evidence: '',
      surface_from: null,
      surface_until: null,
    };
    return { parent, children: [] };
  }

  const head = items[0];
  const rest = items.slice(1);
  const restObligations = rest.filter((item) => item.kind === 'obligation' || item.kind === 'list_item');
  const allObligations = items.filter((item) => item.kind === 'obligation');

  if (head.kind === 'obligation' && allObligations.length >= 2 && rest.every((item) => item.kind === 'obligation')) {
    const parent: IntakeItem = {
      title: fallbackTitle || head.title,
      kind: 'context_only',
      occurs_at: null,
      due_at: head.due_at,
      actionable: 'no',
      prep_implied: 'stated',
      confidence: head.confidence,
      evidence: head.evidence,
      surface_from: head.surface_from,
      surface_until: head.surface_until,
    };
    return { parent, children: allObligations };
  }

  if (head.kind === 'hold') {
    // Awareness stays one Radar card. Do not also emit "buy a new X" unless it has its own deadline.
    return {
      parent: head,
      children: restObligations.filter((item) => item.kind === 'obligation' && !!item.due_at),
    };
  }

  return { parent: head, children: restObligations.length ? restObligations : rest };
}

/** Birthday type-default: card/present only when not excluded and not already listed. */
export function birthdayTypeDefaults(params: {
  sourceText: string;
  existingTitles: string[];
  due_at: string | null;
}): IntakeItem[] {
  if (!BIRTHDAY_DEFAULT_RE.test(params.sourceText)) return [];
  const raw: RawIntakeItem[] = [];
  if (!sourceHasGiftExclusion(params.sourceText) && !titlesAlreadyCoverPrep(params.existingTitles, 'gift')) {
    raw.push({
      title: 'Present',
      kind: 'obligation',
      due_at: params.due_at,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: '',
    });
  }
  if (!sourceHasCardExclusion(params.sourceText) && !titlesAlreadyCoverPrep(params.existingTitles, 'card')) {
    raw.push({
      title: 'Card',
      kind: 'obligation',
      due_at: params.due_at,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: '',
    });
  }
  return normalizeIntakeItems(raw, { source: 'email', sourceText: params.sourceText });
}
