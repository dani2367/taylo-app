export const APPLE_CALENDAR_SYNC_TASK = 'taylo-apple-calendar-sync';

export function calendarExternalId(eventId: string, eventDate: string): string {
  return `${eventId}:${eventDate}`;
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
