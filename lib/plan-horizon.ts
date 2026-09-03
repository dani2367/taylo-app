import { planContextLine, resolvePlanDate } from './human-date';

export const NOW_DAYS = 3;
export const NEXT_DAYS = 21;

export type Horizon = 'now' | 'next' | 'later';

export type PlanHorizonItem = {
  event_date: string | null;
  urgency_level: string | null;
  status?: string | null;
  collection_id?: string | null;
  title?: string | null;
};

const HORIZON_RANK: Record<Horizon, number> = {
  now: 0,
  next: 1,
  later: 2,
};

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

function horizonFromDays(days: number | null): Horizon | null {
  if (days == null) return null;
  if (days <= NOW_DAYS) return 'now';
  if (days <= NEXT_DAYS) return 'next';
  return 'later';
}

function horizonFromUrgency(urgency: string | null | undefined): Horizon | null {
  if (urgency === 'today' || urgency === 'this_week') return 'now';
  if (urgency === 'upcoming') return 'next';
  return null;
}

function effectiveEventDate(
  item: PlanHorizonItem,
  collectionEarliestDate?: string | null,
): string | null {
  if (item.event_date) return item.event_date;
  if (item.collection_id) return collectionEarliestDate ?? null;
  return null;
}

/** Date, urgency, and overdue/open status. Urgency can only pull an item earlier. */
export function horizonForItem(
  item: PlanHorizonItem,
  today = new Date(),
  collectionEarliestDate?: string | null,
): Horizon {
  const ownDays = daysUntil(item.event_date, today);
  if (item.status === 'open' && ownDays != null && ownDays < 0) return 'now';

  const byUrgency = horizonFromUrgency(item.urgency_level);
  if (byUrgency === 'now') return 'now';

  const byDate = horizonFromDays(daysUntil(effectiveEventDate(item, collectionEarliestDate), today));
  if (byDate === 'now') return 'now';

  if (byDate === 'next' || byUrgency === 'next') return 'next';
  if (byDate === 'later') return 'later';
  return 'later';
}

export function earliestDatesByCollection(
  items: Array<{ collection_id?: string | null; event_date: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (!item.collection_id || !item.event_date) continue;
    const prev = map.get(item.collection_id);
    if (!prev || item.event_date < prev) map.set(item.collection_id, item.event_date);
  }
  return map;
}

export function planSubtitle(item: { event_date: string | null; body: string | null; urgency_level?: string | null }, today = new Date()): string {
  return planContextLine(item, today) ?? '';
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function planDateParts(eventDate: string | null | undefined): { day: string; month: string } {
  const date = parseEventDate(eventDate);
  if (!date) return { day: '–', month: '' };
  return { day: String(date.getDate()), month: SHORT_MONTHS[date.getMonth()] };
}

export function comparePlanItems(a: PlanHorizonItem, b: PlanHorizonItem, today = new Date()): number {
  const rank = HORIZON_RANK[horizonForItem(a, today)] - HORIZON_RANK[horizonForItem(b, today)];
  if (rank !== 0) return rank;
  const da = daysUntil(a.event_date, today);
  const db = daysUntil(b.event_date, today);
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return (a.title || '').localeCompare(b.title || '');
}
