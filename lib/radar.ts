import { calendarDateLabel, daysUntil, thingsToSortLabel } from './human-date';
import { isObligationOverdueAgainstParent, unwrapPlacementParent } from './placement';

export const RADAR_PREVIEW = 5;

export type RadarItem = {
  id: string;
  title: string | null;
  body?: string | null;
  kind?: string | null;
  event_date: string | null;
  due_at?: string | null;
  surface_from?: string | null;
  urgency_level?: string | null;
  status?: string | null;
  created_at?: string | null;
  parent_id?: string | null;
  parent?: {
    title?: string | null;
    occurs_at?: string | null;
    event_date?: string | null;
  } | {
    title?: string | null;
    occurs_at?: string | null;
    event_date?: string | null;
  }[] | null;
};

export function compareRadarItems(a: RadarItem, b: RadarItem): number {
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  if (ca !== cb) return cb - ca;
  return (a.title || '').localeCompare(b.title || '');
}

function parentWhen(item: RadarItem, today: Date): string | null {
  const parent = unwrapPlacementParent(item.parent);
  return calendarDateLabel(parent?.occurs_at || parent?.event_date, today);
}

export function radarStatusLine(item: RadarItem, today = new Date()): string {
  if (isObligationOverdueAgainstParent(item, today)) {
    return 'Still to sort — this has already happened';
  }

  const parent = unwrapPlacementParent(item.parent);
  const parentDate = parent?.occurs_at || parent?.event_date;
  const ownDate = item.due_at || item.event_date;
  const days = daysUntil(ownDate || parentDate, today);

  if (ownDate == null && parentDate) {
    const parentDays = daysUntil(parentDate, today);
    const when = parentWhen(item, today);
    if (parentDays != null && parentDays < 0) {
      return 'Still to sort — this has already happened';
    }
    if (parentDays === 0) return 'Still to sort for today';
    if (when) return `I'll bring this up closer to ${when}`;
  }

  if (days == null) {
    const blob = `${item.title || ''} ${item.body || ''}`.toLowerCase();
    if (/\b(sort|pack|book|renew|apply|buy|organise|organize|still need)\b/.test(blob)) {
      return 'Worth sorting soon';
    }
    if (item.created_at) {
      const created = new Date(item.created_at);
      if (!Number.isNaN(created.getTime())) {
        const age = Math.round((today.getTime() - created.getTime()) / 86400000);
        if (age >= 14) return "No rush — I'll keep this on your radar";
      }
    }
    return 'No date yet';
  }

  const when = calendarDateLabel(ownDate || parentDate, today);
  if (when) return when;
  return "No rush — I'll keep this on your radar";
}

export function radarWatchTitle(item: { title?: string | null }): string {
  return (item.title || '').trim() || 'Untitled';
}

export function radarGroupedContext(
  count: number,
  parentDate: string | null | undefined,
  today = new Date(),
  childTitles: string[] = [],
): string {
  const countLabel = thingsToSortLabel(count);
  const when = calendarDateLabel(parentDate, today);
  const compact = childTitles
    .map((title) => title.replace(/\s+/g, ' ').trim())
    .filter((title) => title && title.length <= 28);
  const names =
    compact.length > 0 && compact.length === childTitles.filter(Boolean).length
      ? compact.slice(0, 3).join(', ')
      : '';

  if (names) {
    if (!when) return names;
    return `${when} · ${names}`;
  }
  if (!when) return countLabel;
  return `${when} · ${countLabel}`;
}
