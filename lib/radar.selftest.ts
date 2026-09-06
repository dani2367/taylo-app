import { compareRadarItems, radarStatusLine, type RadarItem } from './radar';

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
expect('next month', radarStatusLine(item({ event_date: '2026-10-12' }), today), 'Due next month');
expect(
  'far dated',
  radarStatusLine(item({ event_date: ymd(80) }), today),
  "No rush — I'll keep this on your radar",
);

const ordered = [
  item({ id: 'b', title: 'B', event_date: null, created_at: '2026-09-01T00:00:00Z' }),
  item({ id: 'a', title: 'A', event_date: ymd(40) }),
  item({ id: 'c', title: 'C', event_date: null, created_at: '2026-09-04T00:00:00Z' }),
].sort((a, b) => compareRadarItems(a, b, today));
expect('dated first', ordered[0].id, 'a');
expect('newer dateless next', ordered[1].id, 'c');

if (!process.exitCode) console.log('radar self-test passed');
