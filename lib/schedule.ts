import { resolvePlanDate, startOfWeek } from './human-date';
import { isListHubTitle } from './radar-organize';
import { extraEventContext, firstCompleteSentence } from './suggestion';

export const LATER_PREVIEW = 4;
export const BUSY_DAY_MIN = 2;

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
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
const DAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GENERIC_WHO = /^(you|me|family|mum|mom|dad|parent)$/i;

export type ScheduleSourceItem = {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  icon: string | null;
  event_date: string | null;
  who_it_affects: string | null;
  source: string | null;
};

export type AgendaRow = {
  id: string;
  title: string;
  ymd: string;
  date: Date;
  minutes: number | null;
  timeLabel: string | null;
  dateLabel: string;
  sub: string | null;
  category: string | null;
  storedIcon: string | null;
};

export type MonthGroup = {
  key: string;
  label: string;
  count: number;
  items: AgendaRow[];
};

export type ScheduleBuckets = {
  selected: AgendaRow[];
  laterThisMonth: AgendaRow[];
  furtherAhead: MonthGroup[];
};

export type BusyDay = {
  ymd: string;
  weekday: string;
  titles: string[];
  fingerprint: string;
};

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function currentWeekDays(today = new Date()): Date[] {
  const start = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDayLabel(d: Date): string {
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatSelectorLabel(selected: Date, today = new Date()): string {
  const dateBit = formatDayLabel(selected);
  if (ymdLocal(selected) === ymdLocal(today)) return `Today, ${dateBit}`;
  return dateBit;
}

export function selectedSectionTitle(selected: Date, today = new Date()): string {
  if (ymdLocal(selected) === ymdLocal(today)) return 'Today';
  return WEEKDAYS_LONG[selected.getDay()];
}

export function weekCellInitial(d: Date): string {
  return DAY_INITIAL[d.getDay()];
}

export function isScheduleItem(row: ScheduleSourceItem, today = new Date()): boolean {
  if ((row.source || '').toLowerCase() === 'calendar') return false;
  if (isListHubTitle(row.title)) return false;
  return resolvePlanDate(row.event_date, today) != null;
}

function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 || 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return minute === 0 ? `${h12}${suffix}` : `${h12}:${pad2(minute)}${suffix}`;
}

export function extractEventTime(
  eventDate: string | null | undefined,
  blob: string,
): { minutes: number | null; label: string | null } {
  const iso = /T(\d{2}):(\d{2})/.exec(eventDate || '');
  if (iso) {
    const hour = Number(iso[1]);
    const minute = Number(iso[2]);
    if (hour === 0 && minute === 0) return { minutes: null, label: null };
    return { minutes: hour * 60 + minute, label: formatClock(hour, minute) };
  }
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(blob);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] || 0);
    const suff = ampm[3].toLowerCase();
    if (suff === 'pm' && hour < 12) hour += 12;
    if (suff === 'am' && hour === 12) hour = 0;
    return { minutes: hour * 60 + minute, label: formatClock(hour, minute) };
  }
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(blob);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    return { minutes: hour * 60 + minute, label: formatClock(hour, minute) };
  }
  return { minutes: null, label: null };
}

function scheduleSub(title: string, who: string | null, body: string | null): string | null {
  const whoTrim = (who || '').trim();
  const generic = !whoTrim || GENERIC_WHO.test(whoTrim);
  if (!generic && !title.toLowerCase().includes(whoTrim.toLowerCase())) {
    return whoTrim;
  }
  const extra = extraEventContext(title, body);
  if (extra) {
    const sentence = firstCompleteSentence(extra);
    const line = (sentence || extra).replace(/\.$/, '');
    if (line.length <= 80) return line;
    return `${line.slice(0, 72).trim()}…`;
  }
  return generic ? null : whoTrim;
}

export function mapAgendaRow(row: ScheduleSourceItem, today = new Date()): AgendaRow | null {
  if (!isScheduleItem(row, today)) return null;
  const date = resolvePlanDate(row.event_date, today);
  if (!date) return null;
  const title = (row.title || 'Untitled').trim() || 'Untitled';
  const time = extractEventTime(row.event_date, `${row.title || ''} ${row.body || ''}`);
  return {
    id: row.id,
    title,
    ymd: ymdLocal(date),
    date,
    minutes: time.minutes,
    timeLabel: time.label,
    dateLabel: formatDayLabel(date),
    sub: scheduleSub(title, row.who_it_affects, row.body),
    category: row.category,
    storedIcon: row.icon,
  };
}

export function compareAgenda(a: AgendaRow, b: AgendaRow): number {
  if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1;
  if (a.minutes == null && b.minutes != null) return -1;
  if (a.minutes != null && b.minutes == null) return 1;
  if (a.minutes != null && b.minutes != null && a.minutes !== b.minutes) return a.minutes - b.minutes;
  return a.title.localeCompare(b.title);
}

export function monthEndYmd(today: Date): string {
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return ymdLocal(end);
}

export function monthPrefix(today: Date): string {
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
}

export function bucketAgenda(rows: AgendaRow[], selectedYmd: string, today = new Date()): ScheduleBuckets {
  const selected = rows.filter((row) => row.ymd === selectedYmd).sort(compareAgenda);
  const prefix = monthPrefix(today);
  const laterThisMonth = rows
    .filter((row) => row.ymd > selectedYmd && row.ymd.startsWith(prefix))
    .sort(compareAgenda);

  const end = monthEndYmd(today);
  const ahead = rows.filter((row) => row.ymd > end).sort(compareAgenda);
  const byMonth = new Map<string, AgendaRow[]>();
  for (const item of ahead) {
    const key = item.ymd.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(item);
    byMonth.set(key, list);
  }
  const furtherAhead: MonthGroup[] = [...byMonth.entries()].map(([key, items]) => {
    const month = Number(key.slice(5, 7));
    return {
      key,
      label: MONTHS_LONG[month - 1] || key,
      count: items.length,
      items,
    };
  });

  return { selected, laterThisMonth, furtherAhead };
}

export function busyFingerprint(ymd: string, titles: string[]): string {
  return `${ymd}|${[...titles].sort((a, b) => a.localeCompare(b)).join('\u0001')}`;
}

export function findBusyDay(rows: AgendaRow[], week: Date[], today = new Date()): BusyDay | null {
  const weekYmds = week.map(ymdLocal);
  const byDay = new Map<string, AgendaRow[]>();
  for (const ymd of weekYmds) byDay.set(ymd, []);
  for (const row of rows) {
    const list = byDay.get(row.ymd);
    if (list) list.push(row);
  }

  let max = 0;
  for (const ymd of weekYmds) {
    max = Math.max(max, byDay.get(ymd)?.length ?? 0);
  }
  if (max < BUSY_DAY_MIN) return null;

  const todayYmd = ymdLocal(today);
  const candidates = weekYmds.filter((ymd) => (byDay.get(ymd)?.length ?? 0) === max);
  const upcoming = candidates.find((ymd) => ymd >= todayYmd);
  const ymd = upcoming ?? candidates[candidates.length - 1];
  const items = [...(byDay.get(ymd) ?? [])].sort(compareAgenda);
  const titles = items.map((item) => item.title);
  return {
    ymd,
    weekday: WEEKDAYS_LONG[week[weekYmds.indexOf(ymd)].getDay()],
    titles,
    fingerprint: busyFingerprint(ymd, titles),
  };
}

export function fallbackDensityLine(weekday: string, titles: string[]): string {
  const shown = titles.slice(0, 3).map((title) => title.replace(/\.$/, ''));
  let things = shown[0] || 'a few things overlapping';
  if (shown.length === 2) things = `${shown[0]} and ${shown[1]}`;
  if (shown.length >= 3) things = `${shown[0]}, ${shown[1]} and ${shown[2]}`;
  return `${weekday} is tight — ${things}`;
}

export function thingsAheadLabel(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}
