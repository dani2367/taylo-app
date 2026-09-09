import { daysUntil, humanizeEventDate, parseEventDate, thingsToSortLabel } from './human-date';
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
  return humanizeEventDate(parent?.occurs_at || parent?.event_date, today);
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
    const when = parentWhen(item, today);
    if (when && /ago|yesterday/i.test(when)) {
      return 'Still to sort — this has already happened';
    }
    if (when === 'Today') return 'Still to sort for today';
    if (when) {
      const spoken = when.replace(/^due\s+/i, '');
      return `I'll bring this up closer to ${spoken.toLowerCase()}`;
    }
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

  const date = parseEventDate(ownDate || parentDate);
  if (date) {
    const nextMonth = (today.getMonth() + 1) % 12;
    const nextYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    if (date.getMonth() === nextMonth && date.getFullYear() === nextYear) {
      return 'Due next month';
    }
  }

  if (days > 45) return "No rush — I'll keep this on your radar";

  const when = humanizeEventDate(ownDate || parentDate, today);
  if (when) {
    if (/^in\s+/i.test(when)) return `Due ${when.toLowerCase()}`;
    return when;
  }
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
  const names = childTitles.filter(Boolean).slice(0, 3).join(', ');
  const when = humanizeEventDate(parentDate, today);
  if (names) {
    if (!when || /ago|yesterday/i.test(when)) return names;
    return `${when} · ${names}`;
  }
  if (!when || /ago|yesterday/i.test(when)) return countLabel;
  return `${when} · ${countLabel}`;
}
