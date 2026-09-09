export function shouldClassifyExistingCalendarItem(opts: {
  classifiedAt: string | null | undefined;
  titleChanged: boolean;
  dateChanged: boolean;
}): boolean {
  return opts.titleChanged || opts.dateChanged || !opts.classifiedAt;
}

/** User close actions stay closed even if the calendar event still exists. */
export function syncedCalendarItemStatus(existingStatus: string | null | undefined): string {
  const value = (existingStatus || 'open').toLowerCase();
  if (value === 'done' || value === 'delegated' || value === 'dismissed') return value;
  return 'open';
}
