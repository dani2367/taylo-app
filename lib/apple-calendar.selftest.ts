import { calendarExternalId, toCalendarEventDate } from './apple-calendar-map.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const allDay = new Date(2026, 8, 12, 0, 0, 0);
const timed = new Date(2026, 8, 12, 14, 15, 0);

expect('all-day date', toCalendarEventDate(allDay, true), '2026-09-12');
expect('timed date', toCalendarEventDate(timed, false), '2026-09-12T14:15:00');
expect(
  'external id includes occurrence',
  calendarExternalId('ek-1', '2026-09-12T14:15:00'),
  'ek-1:2026-09-12T14:15:00',
);

if (!process.exitCode) console.log('apple-calendar self-test passed');
