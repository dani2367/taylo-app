import { happenCountLabel, happenTimeLabel, isHappeningToday } from './happening.ts';
import type { PlacementItem } from '../supabase/functions/_shared/placement.ts';

const today = new Date(2026, 8, 15); // Tuesday 15 Sep 2026

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

function item(partial: Partial<PlacementItem> & { id: string }): PlacementItem {
  return { status: 'open', ...partial };
}

const coffee = item({
  id: 'coffee',
  title: 'Coffee with Lucy',
  kind: 'occurrence',
  occurs_at: '2026-09-15T10:00:00',
});
const inset = item({
  id: 'inset',
  title: 'School closed for inset',
  kind: 'context_only',
  occurs_at: '2026-09-15',
  confidence: 'high',
});
const laterNote = item({
  id: 'later',
  title: 'Nursery closed',
  kind: 'context_only',
  occurs_at: '2026-09-19',
  confidence: 'high',
});
const fuzzy = item({
  id: 'maybe',
  title: 'Maybe closed',
  kind: 'context_only',
  occurs_at: '2026-09-15',
  confidence: 'medium',
});

expect('coffee is happening today', isHappeningToday(coffee, today), true);
expect('inset note is happening today', isHappeningToday(inset, today), true);
expect('later note is not today', isHappeningToday(laterNote, today), false);
expect('medium-confidence note stays off today', isHappeningToday(fuzzy, today), false);
expect('inset time label is Note', happenTimeLabel(inset, '10am'), 'Note');
expect('coffee keeps clock', happenTimeLabel(coffee, '10am'), '10am');
expect('two things happening', happenCountLabel(2), '2 things happening');
expect('one thing happening', happenCountLabel(1), '1 thing happening');

if (!process.exitCode) console.log('happening self-test passed');
