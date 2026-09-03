import {
  earliestDatesByCollection,
  horizonForItem,
  type Horizon,
  type PlanHorizonItem,
} from './plan-horizon.ts';

const today = new Date(2026, 8, 3); // 3 Sep 2026

function ymd(offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expect(name: string, got: Horizon, want: Horizon) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

function item(partial: Partial<PlanHorizonItem>): PlanHorizonItem {
  return { event_date: null, urgency_level: null, status: 'open', ...partial };
}

expect('date within 3 days → now', horizonForItem(item({ event_date: ymd(2) }), today), 'now');
expect('today → now', horizonForItem(item({ event_date: ymd(0) }), today), 'now');
expect('overdue open → now', horizonForItem(item({ event_date: ymd(-1) }), today), 'now');
expect('urgency today → now', horizonForItem(item({ urgency_level: 'today' }), today), 'now');
expect('urgency this_week → now', horizonForItem(item({ urgency_level: 'this_week', event_date: ymd(30) }), today), 'now');
expect('date 10 days → next', horizonForItem(item({ event_date: ymd(10) }), today), 'next');
expect('urgency upcoming → next', horizonForItem(item({ urgency_level: 'upcoming' }), today), 'next');
expect('date 30 days → later', horizonForItem(item({ event_date: ymd(30) }), today), 'later');
expect('no date no urgency → later', horizonForItem(item({}), today), 'later');
expect(
  'undated collection item inherits earliest',
  horizonForItem(item({ collection_id: 'c1' }), today, ymd(10)),
  'next',
);
expect(
  'undated collection with no dated siblings → later',
  horizonForItem(item({ collection_id: 'c1' }), today, null),
  'later',
);
expect(
  'upcoming date beyond 21 still next via urgency',
  horizonForItem(item({ event_date: ymd(30), urgency_level: 'upcoming' }), today),
  'next',
);

const earliest = earliestDatesByCollection([
  { collection_id: 'c1', event_date: ymd(21) },
  { collection_id: 'c1', event_date: ymd(4) },
]);
if (earliest.get('c1') !== ymd(4)) {
  console.error('FAIL earliest date should be the soonest sibling');
  process.exitCode = 1;
} else {
  console.log('ok collection earliest date');
}

if (process.exitCode) {
  console.error('horizon self-test failed');
} else {
  console.log('horizon self-test passed');
}
