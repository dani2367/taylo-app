export function shouldClassifyExistingCalendarItem(opts: {
  classifiedAt: string | null | undefined;
  titleChanged: boolean;
  dateChanged: boolean;
}): boolean {
  return opts.titleChanged || opts.dateChanged || !opts.classifiedAt;
}
