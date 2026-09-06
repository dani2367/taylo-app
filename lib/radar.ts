import { daysUntil, humanizeEventDate, parseEventDate } from './human-date';

export const RADAR_PREVIEW = 5;

export type RadarItem = {
  id: string;
  title: string | null;
  body?: string | null;
  event_date: string | null;
  urgency_level?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export function compareRadarItems(a: RadarItem, b: RadarItem, today = new Date()): number {
  const da = daysUntil(a.event_date, today);
  const db = daysUntil(b.event_date, today);
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  if (ca !== cb) return cb - ca;
  return (a.title || '').localeCompare(b.title || '');
}

export function radarStatusLine(item: RadarItem, today = new Date()): string {
  const days = daysUntil(item.event_date, today);
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

  const date = parseEventDate(item.event_date);
  if (date) {
    const nextMonth = (today.getMonth() + 1) % 12;
    const nextYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    if (date.getMonth() === nextMonth && date.getFullYear() === nextYear) {
      return 'Due next month';
    }
  }

  if (days > 45) return "No rush — I'll keep this on your radar";

  const when = humanizeEventDate(item.event_date, today);
  if (when) {
    if (/^in\s+/i.test(when)) return `Due ${when.toLowerCase()}`;
    return when;
  }
  return "No rush — I'll keep this on your radar";
}
