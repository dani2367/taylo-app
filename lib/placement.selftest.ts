import {
  childStandaloneTitle,
  compareRadarWatch,
  isFamilyVisible,
  isHomeEligible,
  isRadarWatchItem,
  isScheduleItem,
  selectHomeActions,
  selectRadarWatch,
  type PlacementItem,
} from './placement.ts';

const today = new Date(2026, 8, 7); // Monday 7 Sep 2026

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
  return {
    title: 'Item',
    status: 'open',
    ...partial,
  };
}

const meeting = item({
  id: 'meeting',
  title: 'Standup',
  kind: 'occurrence',
  occurs_at: '2026-09-07T09:00:00',
  due_at: null,
  confidence: 'high',
  surface_from: null,
  surface_until: null,
});

const party = item({
  id: 'party',
  title: "Arlo's birthday party",
  kind: 'occurrence',
  occurs_at: '2026-09-12T14:00:00',
  due_at: null,
  confidence: 'high',
  surface_from: '2026-09-05',
  surface_until: '2026-09-12',
});

const buyCardOpen = item({
  id: 'card',
  title: "Pick up Arlo's birthday card",
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-09-12',
  confidence: 'high',
  surface_from: '2026-09-07',
  surface_until: '2026-09-12',
  parent_id: 'party',
  created_at: '2026-09-01T10:00:00Z',
});

const buyCardPending = item({
  ...buyCardOpen,
  id: 'card-later',
  surface_from: '2026-09-10',
});

const emailDeadline = item({
  id: 'email-due',
  title: 'Return the trip form',
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-09-08',
  confidence: 'high',
  surface_from: '2026-09-01',
  surface_until: '2026-09-08',
});

const lowChild = item({
  id: 'low-child',
  title: 'Maybe buy a gift',
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-09-12',
  confidence: 'low',
  surface_from: '2026-09-01',
  surface_until: '2026-09-12',
  parent_id: 'party',
});

const lowParent = item({
  id: 'low-parent',
  title: 'Sort something',
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-09-08',
  confidence: 'low',
  surface_from: '2026-09-01',
  surface_until: '2026-09-08',
});

const hold = item({
  id: 'hold',
  title: 'Trainers getting small',
  kind: 'hold',
  occurs_at: null,
  due_at: null,
  confidence: 'medium',
  created_at: '2026-09-06T12:00:00Z',
});

expect('plain meeting is schedule', isScheduleItem(meeting), true);
expect('plain meeting not radar', isRadarWatchItem(meeting, today), false);
expect('plain meeting not home', isHomeEligible(meeting, today), false);
expect('plain meeting still on family', isFamilyVisible(meeting), true);
expect('list item is not a family person row', isFamilyVisible(item({ id: 'milk', kind: 'list_item' })), false);

expect('party occurrence is schedule', isScheduleItem(party), true);
expect('party occurrence not home', isHomeEligible(party, today), false);
expect('party occurrence not radar', isRadarWatchItem(party, today), false);

expect('child obligation with open window is home', isHomeEligible(buyCardOpen, today), true);
expect('child obligation with open window not radar', isRadarWatchItem(buyCardOpen, today), false);
expect('child obligation is family', isFamilyVisible(buyCardOpen), true);
expect('child obligation is not schedule', isScheduleItem(buyCardOpen), false);
expect('party still not home when child qualifies', isHomeEligible(party, today), false);

expect('child before window is radar not home', isRadarWatchItem(buyCardPending, today), true);
expect('child before window not home', isHomeEligible(buyCardPending, today), false);

expect(
  'child card has parent context',
  childStandaloneTitle(buyCardOpen.title, { title: party.title, when: 'Saturday' }),
  "Pick up Arlo's birthday card — Arlo's birthday party is Saturday",
);

expect('email deadline never schedule', isScheduleItem(emailDeadline), false);
expect('email deadline can be home', isHomeEligible(emailDeadline, today), true);

expect('medium-confidence obligation can be home', isHomeEligible(item({
  id: 'med-home',
  kind: 'obligation',
  confidence: 'medium',
  due_at: '2026-09-08',
  surface_from: '2026-09-01',
  surface_until: '2026-09-08',
}), today), true);

expect('low-confidence child never home', isHomeEligible(lowChild, today), false);
expect('low-confidence parent never home', isHomeEligible(lowParent, today), false);
expect('hold is radar', isRadarWatchItem(hold, today), true);
expect('hold is not home', isHomeEligible(hold, today), false);

const ranked = selectHomeActions(
  [meeting, party, buyCardOpen, emailDeadline, lowChild, lowParent, hold, item({
    id: 'med',
    kind: 'obligation',
    confidence: 'medium',
    due_at: '2026-09-08',
    surface_from: '2026-09-01',
    surface_until: '2026-09-08',
  }), item({
    id: 'extra-1',
    title: 'A later due',
    kind: 'obligation',
    confidence: 'high',
    due_at: '2026-09-20',
    surface_from: '2026-09-01',
    surface_until: '2026-09-20',
  }), item({
    id: 'extra-2',
    title: 'Also due later',
    kind: 'obligation',
    confidence: 'high',
    due_at: '2026-09-22',
    surface_from: '2026-09-01',
    surface_until: '2026-09-22',
  }), item({
    id: 'extra-3',
    title: 'Even later',
    kind: 'obligation',
    confidence: 'high',
    due_at: '2026-09-25',
    surface_from: '2026-09-01',
    surface_until: '2026-09-25',
  })],
  { today, limit: 3 },
);
expect('home ranking excludes occurrence and low', ranked.every((card) => card.item.kind !== 'occurrence' || card.children.length > 0), true);
expect('home ranking includes medium', ranked.some((card) => card.item.id === 'med' || card.item.id === 'email-due'), true);
expect('child folds into parent occurrence', ranked.some((card) => card.item.id === 'party' && card.children.some((child) => child.id === 'card')), true);
expect('home ranking cap is 3', ranked.length, 3);
expect(
  'home ranking does not include the fourth leftover',
  ranked.some((card) => card.item.id === 'extra-3'),
  false,
);

const rotated = selectHomeActions(
  [
    item({ id: 'a', title: 'A', kind: 'obligation', confidence: 'high', due_at: '2026-09-08', surface_from: '2026-09-01', surface_until: '2026-09-08' }),
    item({ id: 'b', title: 'B', kind: 'obligation', confidence: 'high', due_at: '2026-09-09', surface_from: '2026-09-01', surface_until: '2026-09-09' }),
  ],
  { today, previouslySurfaced: [{ id: 'a', at: new Date(2026, 8, 7, 8, 0, 0) }], limit: 1 },
);
expect('recently surfaced is deprioritized when others exist', rotated[0]?.item.id, 'b');

const interview = item({
  id: 'primark',
  title: 'Primark interview',
  kind: 'occurrence',
  occurs_at: '2026-09-08T13:30:00',
  confidence: 'high',
});
const prep = item({
  id: 'examples',
  title: 'Prepare examples',
  kind: 'obligation',
  confidence: 'medium',
  parent_id: 'primark',
  due_at: null,
  surface_from: null,
});
const birthday = item({
  id: 'franks',
  title: 'Franks birthday',
  kind: 'occurrence',
  occurs_at: '2026-09-08',
  confidence: 'high',
});
const homeWithPrep = selectHomeActions([interview, prep, birthday], { today, limit: 4 });
expect('interview with prep is one home card', homeWithPrep.map((card) => card.item.id), ['primark']);
expect('birthday with no prep stays off home', homeWithPrep.some((card) => card.item.id === 'franks'), false);
expect('prep is nested not its own card', homeWithPrep[0]?.children.map((child) => child.id), ['examples']);

const shop = item({ id: 'shop', title: 'Shopping', kind: 'list_item', confidence: 'high' });
const milk = item({ id: 'milk', title: 'Milk', kind: 'obligation', confidence: 'medium', parent_id: 'shop', due_at: null });
const watchCards = selectRadarWatch([shop, milk, hold], today);
expect('shopping children stay off radar watch', watchCards.some((card) => card.item.id === 'milk' || card.item.id === 'shop'), false);
expect('hold still on radar', watchCards.some((card) => card.item.id === 'hold'), true);

const watch = [hold, buyCardPending, item({
  id: 'older-hold',
  title: 'Passport',
  kind: 'hold',
  created_at: '2026-08-01T00:00:00Z',
})].sort(compareRadarWatch);
expect('radar watch sorts newest created first', watch.map((row) => row.id), ['hold', 'card-later', 'older-hold']);

if (!process.exitCode) console.log('placement self-test passed');
