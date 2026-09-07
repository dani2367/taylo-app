import {
  bucketAgenda,
  compareAgenda,
  findBusyDay,
  fallbackDensityLine,
  formatSelectorLabel,
  mapAgendaRow,
  weekDaysAtOffset,
  weekSectionLabel,
  ymdLocal,
  type AgendaRow,
  type ScheduleSourceItem,
} from './schedule.ts';

const today = new Date(2026, 8, 5); // Saturday 5 Sep 2026

function expect(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    console.error(`FAIL ${name}: got ${a}, want ${b}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

function row(partial: Partial<ScheduleSourceItem> & { id: string; title: string; occurs_at: string }): AgendaRow {
  const mapped = mapAgendaRow(
    {
      body: null,
      category: null,
      icon: null,
      who_it_affects: null,
      kind: 'occurrence',
      status: 'open',
      ...partial,
    },
    today,
  );
  if (!mapped) throw new Error(`expected agenda row for ${partial.title}`);
  return mapped;
}

expect('occurrence is on schedule', mapAgendaRow({
  id: 'c',
  title: 'Nursery',
  occurs_at: '2026-09-05',
  body: null,
  category: null,
  icon: null,
  who_it_affects: null,
  kind: 'occurrence',
  status: 'open',
}, today)?.title, 'Nursery');

expect('obligation with firm due_at stays off schedule', mapAgendaRow({
  id: 'e',
  title: 'Return the trip form',
  occurs_at: null,
  event_date: '2026-09-05',
  body: null,
  category: null,
  icon: null,
  who_it_affects: null,
  kind: 'obligation',
  status: 'open',
}, today), null);

expect('list hub stays off schedule', mapAgendaRow({
  id: 's',
  title: 'Shopping',
  occurs_at: '2026-09-05',
  body: null,
  category: null,
  icon: null,
  who_it_affects: null,
  kind: 'list_item',
  status: 'open',
}, today), null);

const dentist = row({
  id: 'd',
  title: 'Dentist',
  occurs_at: '2026-09-05',
  body: 'Thursday 2:15pm at the practice',
  who_it_affects: 'Taya',
});
const form = row({
  id: 'f',
  title: 'School trip form',
  occurs_at: '2026-09-05',
  body: 'Due back to the office',
  who_it_affects: 'Taya',
});
const nursery = row({
  id: 'n',
  title: 'Nursery',
  occurs_at: '2026-09-05T08:30:00',
  who_it_affects: 'Arlo',
});
const later = row({
  id: 'l',
  title: 'Sleepover pack',
  occurs_at: '2026-09-15',
  who_it_affects: 'Arlo',
});
const oct1 = row({ id: 'o1', title: 'Inset day', occurs_at: '2026-10-12' });
const oct2 = row({ id: 'o2', title: 'MOT', occurs_at: '2026-10-20' });
const nov = row({ id: 'nv', title: 'Holiday booking', occurs_at: '2026-11-03' });

const todayItems = [form, dentist, nursery].sort(compareAgenda);
expect(
  'today sorts untimed then by clock',
  todayItems.map((item) => `${item.title}:${item.timeLabel || 'none'}`),
  ['School trip form:none', 'Nursery:8:30am', 'Dentist:2:15pm'],
);
expect('iso time label', nursery.timeLabel, '8:30am');
expect('who becomes subtitle when not in title', dentist.sub, 'Taya');
expect('later date label', later.dateLabel, 'Tue 15 Sep');

const buckets = bucketAgenda([form, dentist, nursery, later, oct1, oct2, nov], '2026-09-05', today);
expect(
  'later this month excludes today and future months',
  buckets.laterThisMonth.map((item) => item.title),
  ['Sleepover pack'],
);
expect(
  'no tomorrow bucket — 6 Sep would sit in later this month',
  bucketAgenda(
    [row({ id: 'tm', title: 'Football', occurs_at: '2026-09-06', who_it_affects: 'Arlo' })],
    '2026-09-05',
    today,
  ).laterThisMonth.map((item) => item.title),
  ['Football'],
);
expect(
  'further ahead groups by month with counts',
  buckets.furtherAhead.map((group) => `${group.label}:${group.count}`),
  ['October:2', 'November:1'],
);

const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 31 + i)); // Mon 31 Aug – Sun 6 Sep? wait Sep 5 is Sat
// Mon 31 Aug 2026 is wrong. Sat 5 Sep week is Mon 31 Aug? 2026-08-31 is Monday. Yes.
const weekMon = new Date(2026, 7, 31);
const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() + i));

expect(
  'busy day needs 2+ on one day',
  findBusyDay([nursery], weekDays, today),
  null,
);

const busy = findBusyDay([dentist, form, nursery, later], weekDays, today);
expect('busy day is Saturday with 3 items', busy?.ymd, '2026-09-05');
expect('busy weekday', busy?.weekday, 'Saturday');
expect('selector for today', formatSelectorLabel(today, today), 'Today, Sat 5 Sep');
expect(
  'fallback phrasing',
  fallbackDensityLine('Thursday', ['Dentist', 'School trip form']),
  'Thursday is tight — Dentist and School trip form',
);

expect('ymd', ymdLocal(today), '2026-09-05');
const thisWeek = weekDaysAtOffset(today, 0);
expect('this week starts Monday', ymdLocal(thisWeek[0]), '2026-08-31');
expect('next week starts Monday', ymdLocal(weekDaysAtOffset(today, 1)[0]), '2026-09-07');
expect('week after starts Monday', ymdLocal(weekDaysAtOffset(today, 2)[0]), '2026-09-14');
expect('this week label', weekSectionLabel(0), 'This week');
expect('next week label', weekSectionLabel(1), 'Next week');
expect('two weeks label', weekSectionLabel(2), 'In two weeks');

if (!process.exitCode) console.log('schedule self-test passed');
