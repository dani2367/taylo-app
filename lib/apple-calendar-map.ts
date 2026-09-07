export const APPLE_CALENDAR_SYNC_TASK = 'taylo-apple-calendar-sync';

export function calendarExternalId(eventId: string, eventDate: string): string {
  return `${eventId}:${eventDate}`;
}

export function normalizeCalendarEventDate(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value.slice(0, 19);
  if (!match[2] || (match[2] === '00' && match[3] === '00')) return match[1];
  return `${match[1]}T${match[2]}:${match[3]}:00`;
}

export function toCalendarEventDate(start: Date, allDay: boolean): string {
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  if (allDay) return `${y}-${m}-${d}`;
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00`;
}
