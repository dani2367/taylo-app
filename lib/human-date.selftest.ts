import { humanizeEventDate } from './human-date.ts';

const today = new Date(2026, 8, 3); // Thursday 3 Sep 2026

function ymd(offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expect(name: string, got: string | null, want: string) {
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

if (!process.exitCode) console.log('human-date self-test passed');
