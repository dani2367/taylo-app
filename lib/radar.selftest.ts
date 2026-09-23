import { compareRadarItems, radarGroupedContext, radarStatusLine, type RadarItem } from './radar';

const today = new Date(2026, 8, 5); // 5 Sep 2026

function ymd(offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function item(partial: Partial<RadarItem>): RadarItem {
  return { id: 'x', title: 'Thing', event_date: null, urgency_level: null, status: 'open', ...partial };
}

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect('no date copy', radarStatusLine(item({}), today), 'No date yet');
expect(
  'worth sorting',
  radarStatusLine(item({ title: 'Pack school bags', body: 'still need labels' }), today),
  'Worth sorting soon',
);
expect(
  'older dateless',
  radarStatusLine(item({ created_at: '2026-08-01T10:00:00Z' }), today),
  "No rush — I'll keep this on your radar",
);
expect('next month', radarStatusLine(item({ event_date: '2026-10-12' }), today), '12 October');
expect(
  'far dated',
  radarStatusLine(item({ event_date: ymd(80) }), today),
  '24 November',
);
expect(
  'undated child uses parent timing, not no-date',
  radarStatusLine(
    item({
      kind: 'obligation',
      due_at: null,
      parent_id: 'party',
      parent: { title: "Arlo's party", occurs_at: '2026-09-12', event_date: null },
    }),
    today,
  ),
  "I'll bring this up closer to 12 September",
);
expect(
  'past parent is still-to-sort, not no-date or yesterday',
  radarStatusLine(
    item({
      kind: 'obligation',
      due_at: null,
      parent_id: 'bday',
      parent: { title: "Frank's birthday", occurs_at: '2026-09-04', event_date: null },
    }),
    today,
  ),
  'Still to sort — this has already happened',
);
expect(
  'grouped summary does not truncate',
  radarGroupedContext(2, '2026-09-12', today),
  '12 September · 2 things to sort',
);
expect(
  'grouped long titles stay on the count line',
  radarGroupedContext(2, ymd(42), today, [
    'Check passports and visas for israel trip',
    'Arrange travel documents and insurance for the family',
  ]),
  '17 October · 2 things to sort',
);

const ordered = [
  item({ id: 'b', title: 'B', event_date: null, created_at: '2026-09-01T00:00:00Z' }),
  item({ id: 'a', title: 'A', event_date: ymd(40) }),
  item({ id: 'c', title: 'C', event_date: null, created_at: '2026-09-04T00:00:00Z' }),
].sort((a, b) => compareRadarItems(a, b));
expect('dated item before a newer undated capture', ordered.map((row) => row.id).join(','), 'a,c,b');

if (!process.exitCode) console.log('radar self-test passed');
