import { calendarDateLabel, canonicalDateDetail, humanizeEventDate, specificCalendarLabel, weekdayShort } from './human-date.ts';

const today = new Date(2026, 8, 3); // Thursday 3 Sep 2026

function ymd(offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expect(name: string, got: string | null, want: string | null) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect('today', humanizeEventDate(ymd(0), today), 'Today');
expect('tomorrow', humanizeEventDate(ymd(1), today), 'Tomorrow');
expect('this weekend (Sat)', humanizeEventDate(ymd(2), today), 'This weekend');
expect('this weekend (Sun)', humanizeEventDate(ymd(3), today), 'This weekend');
expect('next week', humanizeEventDate(ymd(5), today), 'Next week');
expect('in 3 weeks', humanizeEventDate(ymd(21), today), 'In 3 weeks');
expect('year-behind September rolls forward', humanizeEventDate('2025-09-09', today), 'Next week');

const wed = new Date(2026, 8, 2);
expect('due Friday', humanizeEventDate('2026-09-04', wed), 'Due Friday');
expect('calendar date', calendarDateLabel('2026-10-15', today), '15 October');
expect('specific day does not roll a past year', specificCalendarLabel('2025-09-09'), '9 September');
expect('specific day keeps the stored day', specificCalendarLabel('2026-09-22'), '22 September');
expect('weekday short today', weekdayShort(ymd(0), today), 'Today');
expect('weekday short later', weekdayShort('2026-09-10', today), 'Thu');
expect(
  'conflicting prose date yields the stored day',
  canonicalDateDetail('next Wednesday, 25 September', '2026-09-23'),
  '23 September',
);
expect(
  'a real fact is not replaced by the date',
  canonicalDateDetail('Marie will be there.', '2026-09-29'),
  null,
);

if (!process.exitCode) console.log('human-date self-test passed');
