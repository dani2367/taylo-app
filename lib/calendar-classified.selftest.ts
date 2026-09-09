import { shouldClassifyExistingCalendarItem, syncedCalendarItemStatus } from './calendar-classified.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect(
  'unclassified is sent',
  shouldClassifyExistingCalendarItem({ classifiedAt: null, titleChanged: false, dateChanged: false }),
  true,
);
expect(
  'already classified is skipped',
  shouldClassifyExistingCalendarItem({
    classifiedAt: '2026-09-06T10:00:00Z',
    titleChanged: false,
    dateChanged: false,
  }),
  false,
);
expect(
  'title change is resent',
  shouldClassifyExistingCalendarItem({
    classifiedAt: '2026-09-06T10:00:00Z',
    titleChanged: true,
    dateChanged: false,
  }),
  true,
);
expect(
  'date change is resent',
  shouldClassifyExistingCalendarItem({
    classifiedAt: '2026-09-06T10:00:00Z',
    titleChanged: false,
    dateChanged: true,
  }),
  true,
);

expect('done stays done on calendar sync', syncedCalendarItemStatus('done'), 'done');
expect('dismissed stays dismissed on calendar sync', syncedCalendarItemStatus('dismissed'), 'dismissed');
expect('delegated stays delegated on calendar sync', syncedCalendarItemStatus('delegated'), 'delegated');
expect('open stays open', syncedCalendarItemStatus('open'), 'open');

if (!process.exitCode) console.log('calendar-classified self-test passed');
