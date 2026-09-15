import {
  asRadarWatchCards,
  childStandaloneTitle,
  compareRadarWatch,
  displayItemTitle,
  exceptHomeActions,
  isBarePrepChild,
  isBarePrepTitle,
  isChildOfClosedParent,
  isFamilyVisible,
  isHomeEligible,
  isHomeSpotlightItem,
  isInformationalOnSchedule,
  isOccurrenceOnSchedule,
  isRadarWatchItem,
  isScheduleItem,
  orderHomeSpotlightQueue,
  selectAllHomeActions,
  selectHomeActions,
  selectRadarWatch,
  shouldRegenerateSpotlight,
  shortEventTitle,
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
expect('plain meeting still on family', isFamilyVisible(meeting, today), true);
expect('list item is not a family person row', isFamilyVisible(item({ id: 'milk', kind: 'list_item' }), today), false);
expect('dated context_only parent is family-visible as context', isFamilyVisible(item({
  id: 'email-party',
  title: "Arlo's birthday party",
  kind: 'context_only',
  event_date: '2026-09-12',
}), today), true);
expect('undated context_only is not a family hiding place', isFamilyVisible(item({
  id: 'stray-note',
  title: 'Some note',
  kind: 'context_only',
}), today), false);

expect('party occurrence is schedule', isScheduleItem(party), true);
expect('party occurrence not home', isHomeEligible(party, today), false);
expect('party occurrence not radar', isRadarWatchItem(party, today), false);

expect('child obligation with open window is home', isHomeEligible(buyCardOpen, today), true);
expect('child obligation with open window not radar', isRadarWatchItem(buyCardOpen, today), false);
expect('child obligation is family', isFamilyVisible(buyCardOpen, today), true);
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
expect('home ranking excludes unclustered occurrences and low', ranked.every((card) => card.item.kind !== 'occurrence' || card.children.length > 0), true);
expect('home ranking includes medium', ranked.some((card) => card.item.id === 'med' || card.item.id === 'email-due'), true);
expect('this-week party folds its due child onto one home card', ranked.some((card) => card.item.id === 'party' && card.children.some((row) => row.id === 'card')), true);
expect('party child is not a second home card', ranked.some((card) => card.item.id === 'card'), false);
expect(
  'all near-term dated work lands on home when under the cap',
  ranked.map((card) => card.item.id).sort(),
  ['email-due', 'med', 'party'],
);
expect(
  'far-dated leftovers go to see-all not home',
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
expect('sooner due stays on home when capped', rotated[0]?.item.id, 'a');
expect('limit only affects how many home cards are visible', rotated.map((card) => card.item.id), ['a']);
const rotatedFull = selectHomeActions(
  [
    item({ id: 'a', title: 'A', kind: 'obligation', confidence: 'high', due_at: '2026-09-08', surface_from: '2026-09-01', surface_until: '2026-09-08' }),
    item({ id: 'b', title: 'B', kind: 'obligation', confidence: 'high', due_at: '2026-09-09', surface_from: '2026-09-01', surface_until: '2026-09-09' }),
  ],
  { today, previouslySurfaced: [{ id: 'a', at: new Date(2026, 8, 7, 8, 0, 0) }] },
);
expect('both near-term items still show on home under the cap', rotatedFull.map((card) => card.item.id), ['a', 'b']);

const pinA = item({
  id: 'pin-a',
  title: 'Pin A',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-10',
  surface_from: '2026-09-01',
  surface_until: '2026-09-10',
});
const pinB = item({
  id: 'pin-b',
  title: 'Pin B',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-11',
  surface_from: '2026-09-01',
  surface_until: '2026-09-11',
});
const pinC = item({
  id: 'pin-c',
  title: 'Pin C',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-12',
  surface_from: '2026-09-01',
  surface_until: '2026-09-12',
});
const pinsAt = new Date(2026, 8, 7, 8, 0, 0);
const pinHistory = [pinA, pinB, pinC].map((row) => ({ id: row.id, at: pinsAt }));
const bumper = item({
  id: 'new-soon',
  title: 'New soon',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-08',
  surface_from: '2026-09-07',
  surface_until: '2026-09-08',
});
const lateNew = item({
  id: 'new-late',
  title: 'New late',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-28',
  surface_from: '2026-09-07',
  surface_until: '2026-09-28',
});

const withBumper = selectHomeActions([pinA, pinB, pinC, bumper], { today, previouslySurfaced: pinHistory });
expect('high-confidence near-term bumper is included despite pins', withBumper.some((card) => card.item.id === 'new-soon'), true);
expect('home shows every near-term pin plus the bumper', withBumper.length, 4);
expect(
  'pins stay unless a weaker one is displaced',
  withBumper.filter((card) => card.item.id.startsWith('pin-')).length >= 3,
  true,
);

const withLate = selectHomeActions([pinA, pinB, pinC, lateNew], { today, previouslySurfaced: pinHistory });
expect('far-dated leftover is not a home spotlight', withLate.some((card) => card.item.id === 'new-late'), false);
expect('far-dated leftover does not bump near-term pins', withLate.map((card) => card.item.id), ['pin-a', 'pin-b', 'pin-c']);

const defaultCap = selectHomeActions(
  [
    item({ id: 'n1', kind: 'obligation', confidence: 'high', due_at: '2026-09-08', surface_from: '2026-09-01', surface_until: '2026-09-08' }),
    item({ id: 'n2', kind: 'obligation', confidence: 'high', due_at: '2026-09-09', surface_from: '2026-09-01', surface_until: '2026-09-09' }),
    item({ id: 'n3', kind: 'obligation', confidence: 'high', due_at: '2026-09-10', surface_from: '2026-09-01', surface_until: '2026-09-10' }),
    item({ id: 'n4', kind: 'obligation', confidence: 'high', due_at: '2026-09-11', surface_from: '2026-09-01', surface_until: '2026-09-11' }),
    item({ id: 'n5', kind: 'obligation', confidence: 'high', due_at: '2026-09-12', surface_from: '2026-09-01', surface_until: '2026-09-12' }),
    item({ id: 'n6', kind: 'obligation', confidence: 'high', due_at: '2026-09-13', surface_from: '2026-09-01', surface_until: '2026-09-13' }),
    item({ id: 'n7', kind: 'obligation', confidence: 'high', due_at: '2026-09-14', surface_from: '2026-09-01', surface_until: '2026-09-14' }),
  ],
  { today },
);
expect('home visibility cap is 5', defaultCap.map((card) => card.item.id), ['n1', 'n2', 'n3', 'n4', 'n5']);
const sevenQueued = orderHomeSpotlightQueue(
  ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'].map((id, index) =>
    item({
      id,
      kind: 'obligation',
      confidence: 'high',
      due_at: `2026-09-${String(8 + index).padStart(2, '0')}`,
      surface_from: '2026-09-01',
      surface_until: `2026-09-${String(8 + index).padStart(2, '0')}`,
    }),
  ),
  { today },
);
expect('sixth and seventh near-term items move to see all', sevenQueued.overflow.map((card) => card.item.id), ['n6', 'n7']);
const sevenItems = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'].map((id, index) =>
  item({
    id,
    kind: 'obligation',
    confidence: 'high',
    due_at: `2026-09-${String(8 + index).padStart(2, '0')}`,
    surface_from: '2026-09-01',
    surface_until: `2026-09-${String(8 + index).padStart(2, '0')}`,
  }),
);
const firstVisit = orderHomeSpotlightQueue(sevenItems, { today });
const secondVisit = orderHomeSpotlightQueue(sevenItems, {
  today,
  previouslySurfaced: firstVisit.home.map((card, index) => ({
    id: card.item.id,
    at: new Date(2026, 8, 6, 8 + index, 0, 0),
  })),
});
expect('later-due items stay in see all', firstVisit.overflow.map((card) => card.item.id), ['n6', 'n7']);
expect(
  'revisiting home does not swap see-all onto the bar',
  secondVisit.home.map((card) => card.item.id),
  firstVisit.home.map((card) => card.item.id),
);
expect(
  'see-all membership is stable across visits',
  secondVisit.overflow.map((card) => card.item.id),
  firstVisit.overflow.map((card) => card.item.id),
);
const withSooner = orderHomeSpotlightQueue(
  [
    item({
      id: 'n0',
      kind: 'obligation',
      confidence: 'high',
      due_at: '2026-09-07',
      surface_from: '2026-09-01',
      surface_until: '2026-09-07',
    }),
    ...sevenItems,
  ],
  { today },
);
expect('sooner-due bumper enters home', withSooner.home.map((card) => card.item.id), ['n0', 'n1', 'n2', 'n3', 'n4']);
expect('latest-due cards fall to see all', withSooner.overflow.map((card) => card.item.id), ['n5', 'n6', 'n7']);

const pool = [
  pinA,
  pinB,
  pinC,
  lateNew,
  hold,
  item({
    id: 'done-slip',
    title: 'Done slip',
    kind: 'obligation',
    status: 'done',
    confidence: 'high',
    due_at: '2026-09-08',
    surface_from: '2026-09-01',
    surface_until: '2026-09-08',
  }),
  item({
    id: 'low-task',
    title: 'Vague maybe',
    kind: 'obligation',
    confidence: 'low',
    due_at: '2026-09-08',
    surface_from: '2026-09-01',
    surface_until: '2026-09-08',
  }),
];
const allEligible = selectAllHomeActions(pool, { today, previouslySurfaced: pinHistory });
const queued = orderHomeSpotlightQueue(pool, { today, previouslySurfaced: pinHistory });
expect('uncapped pool uses isHomeEligible only', allEligible.every((card) => isHomeEligible(card.item, today)), true);
expect('uncapped pool excludes holds', allEligible.some((card) => card.item.id === 'hold'), false);
expect('uncapped pool excludes done', allEligible.some((card) => card.item.id === 'done-slip'), false);
expect('uncapped pool excludes low confidence', allEligible.some((card) => card.item.id === 'low-task'), false);
expect('see-all overflow is leftover home-spotlight only', queued.overflow.map((card) => card.item.id), []);
expect('see-all overflow is spotlight-eligible', queued.overflow.every((card) => isHomeSpotlightItem(card.item, today)), true);
expect('home queue does not include overflow ids', queued.home.some((card) => card.item.id === 'new-late'), false);
expect('far-dated leftover is not dumped into see all', queued.overflow.some((card) => card.item.id === 'new-late'), false);

expect(
  'stale cache regenerates',
  shouldRegenerateSpotlight({
    generatedAt: new Date(2026, 8, 7, 0, 0, 0),
    cachedIds: ['pin-a'],
    rankedIds: ['pin-a'],
    now: new Date(2026, 8, 7, 5, 0, 0),
  }),
  true,
);
expect(
  'fresh cache with a missing eligible item regenerates',
  shouldRegenerateSpotlight({
    generatedAt: new Date(2026, 8, 7, 10, 0, 0),
    cachedIds: ['pin-a', 'pin-b', 'pin-c'],
    rankedIds: ['new-soon', 'pin-a', 'pin-b', 'pin-c'],
    now: new Date(2026, 8, 7, 10, 30, 0),
  }),
  true,
);
expect(
  'fresh matching cache does not regenerate',
  shouldRegenerateSpotlight({
    generatedAt: new Date(2026, 8, 7, 10, 0, 0),
    cachedIds: ['pin-a', 'pin-b', 'pin-c'],
    rankedIds: ['pin-c', 'pin-a', 'pin-b'],
    now: new Date(2026, 8, 7, 10, 30, 0),
  }),
  false,
);
expect(
  'fresh home set still refreshes when overflow pool changes',
  shouldRegenerateSpotlight({
    generatedAt: new Date(2026, 8, 7, 10, 0, 0),
    cachedIds: ['pin-a', 'pin-b', 'pin-c'],
    rankedIds: ['pin-a', 'pin-b', 'pin-c'],
    cachedOverflowIds: [],
    overflowIds: ['new-late'],
    now: new Date(2026, 8, 7, 10, 30, 0),
  }),
  true,
);

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
expect('undated interview prep is not a home action', homeWithPrep.map((card) => card.item.id), []);
expect('birthday with no prep stays off home', homeWithPrep.some((card) => card.item.id === 'franks'), false);
expect('interview occurrence is never a home card', homeWithPrep.some((card) => card.item.id === 'primark'), false);
const prepRadar = selectRadarWatch([interview, prep, birthday], today);
expect(
  'undated interview prep hangs off the interview on radar',
  prepRadar.some((card) => card.item.id === 'primark' && card.children.some((row) => row.id === 'examples')),
  true,
);

const emailParty = item({
  id: 'email-party',
  title: "Arlo's birthday party",
  kind: 'context_only',
  occurs_at: null,
  event_date: '2026-09-12',
  confidence: 'high',
  surface_from: '2026-09-05',
  surface_until: '2026-09-12',
});
const emailCard = item({
  ...buyCardOpen,
  id: 'email-card',
  parent_id: 'email-party',
});
const emailHome = selectHomeActions([emailParty, emailCard], { today, limit: 4 });
expect('this-week email party is the home card', emailHome.map((card) => card.item.id), ['email-party']);
expect('email child folds under the party', emailHome[0]?.children.map((row) => row.id), ['email-card']);
expect('email party without occurs_at is not schedule', isScheduleItem(emailParty), false);

const nurseryNote = item({
  id: 'nursery-closed',
  title: 'Nursery closed',
  kind: 'context_only',
  occurs_at: '2026-09-19',
  confidence: 'high',
});
expect('stated-fact context_only is on schedule', isScheduleItem(nurseryNote), true);
expect('stated-fact context_only is informational schedule', isInformationalOnSchedule(nurseryNote), true);
expect('stated-fact context_only is not a real occurrence', isOccurrenceOnSchedule(nurseryNote), false);
expect('stated-fact context_only never home', isHomeEligible(nurseryNote, today), false);

expect(
  'medium-confidence context_only stays off schedule even with occurs_at',
  isScheduleItem(item({
    id: 'maybe-closed',
    kind: 'context_only',
    occurs_at: '2026-09-19',
    confidence: 'medium',
  })),
  false,
);
expect(
  'email child copy uses parent title from full table',
  displayItemTitle(emailHome[0]!.item, today).includes("Arlo's birthday party"),
  true,
);
const emailRadar = selectRadarWatch([party, emailParty, emailCard, buyCardPending], today);
expect('email party never on radar', emailRadar.some((card) => card.item.id === 'email-party'), false);
expect(
  'pending work hangs off the event on radar',
  emailRadar.some((card) => card.item.id === 'party' && card.children.some((row) => row.id === 'card-later')),
  true,
);

const giftPending = item({
  id: 'gift-later',
  title: 'Buy a present',
  kind: 'obligation',
  occurs_at: null,
  due_at: null,
  confidence: 'high',
  surface_from: '2026-09-10',
  parent_id: 'party',
  created_at: '2026-09-02T10:00:00Z',
});
const groupedRadar = selectRadarWatch([party, buyCardPending, giftPending], today);
expect('two pending children collapse to one parent radar card', groupedRadar.length, 1);
expect('grouped radar card is the parent occurrence', groupedRadar[0]?.item.id, 'party');
expect('grouped radar card holds both children', groupedRadar[0]?.children.map((row) => row.id).sort(), ['card-later', 'gift-later']);
expect(
  'this-week party with a due child is one home card',
  selectHomeActions([party, buyCardOpen, giftPending], { today }).some(
    (card) => card.item.id === 'party' && card.children.some((row) => row.id === 'card'),
  ),
  true,
);

const pastParty = item({
  id: 'past-party',
  title: "Frank's birthday",
  kind: 'occurrence',
  occurs_at: '2026-09-06T12:00:00',
  confidence: 'high',
});
const leftoverGift = item({
  id: 'leftover-gift',
  title: 'Buy a gift',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  surface_from: '2026-09-01',
  surface_until: '2026-09-06',
  parent_id: 'past-party',
  parent: { title: pastParty.title, kind: 'occurrence', occurs_at: pastParty.occurs_at, event_date: null },
  created_at: '2026-09-01T10:00:00Z',
});
expect('leftover child after parent date stays with siblings on radar', isHomeEligible(leftoverGift, today), false);
expect('leftover packing child is a radar watch item', isRadarWatchItem(leftoverGift, today), true);
expect(
  'leftover child does not take a home slot',
  selectHomeActions([pastParty, leftoverGift], { today }).map((card) => card.item.id),
  [],
);
expect(
  'leftover child stays on radar under the parent',
  selectRadarWatch([pastParty, leftoverGift], today).some((card) => card.item.id === 'leftover-gift' || card.children.some((row) => row.id === 'leftover-gift')),
  true,
);

const calendarHome = selectHomeActions([party, buyCardOpen], { today, limit: 4 });
expect('this-week calendar party is the home card', calendarHome.map((card) => card.item.id), ['party']);
expect('calendar child folds under the party', calendarHome[0]?.children.map((row) => row.id), ['card']);
expect(
  'calendar party copy names the party',
  (calendarHome[0]?.item.title || '').includes("Arlo's birthday party"),
  true,
);

const shop = item({ id: 'shop', title: 'Shopping', kind: 'list_item', confidence: 'high', collection_id: 'shop-col' });
const milk = item({ id: 'milk', title: 'Milk', kind: 'obligation', confidence: 'medium', parent_id: 'shop', due_at: null });
const watchCards = selectRadarWatch([shop, milk, hold], today);
expect('shopping children stay off radar watch', watchCards.some((card) => card.item.id === 'milk' || card.item.id === 'shop'), false);
expect('hold still on radar', watchCards.some((card) => card.item.id === 'hold'), true);

const slip = item({
  id: 'slip',
  title: 'Return the farm trip permission slip',
  kind: 'obligation',
  due_at: '2026-09-08',
  confidence: 'medium',
  surface_from: null,
  surface_until: null,
});
const coat = item({
  id: 'coat',
  title: 'Waterproof coat',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  parent_id: 'slip',
  created_at: '2026-09-01T10:00:00Z',
});
const bottle = item({
  id: 'bottle',
  title: 'Named water bottle',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  parent_id: 'slip',
  created_at: '2026-09-01T11:00:00Z',
});
const lunch = item({
  id: 'lunch',
  title: 'Packed lunch (nut-free)',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  parent_id: 'slip',
  created_at: '2026-09-01T12:00:00Z',
});
const farmRadar = asRadarWatchCards([slip, coat, bottle, lunch], [coat, bottle, lunch]);
expect('farm packing collapses under the permission-slip parent', farmRadar.length, 1);
expect('farm radar card is the parent obligation', farmRadar[0]?.item.id, 'slip');
expect('farm radar card holds the packing lines', farmRadar[0]?.children.map((row) => row.id).sort(), ['bottle', 'coat', 'lunch']);
const farmHome = selectHomeActions([slip, coat, bottle, lunch], { today });
expect('this-week farm slip is the home card', farmHome.map((card) => card.item.id), ['slip']);
expect(
  'farm packing folds onto the home slip',
  farmHome[0]?.children.map((row) => row.id).sort(),
  ['bottle', 'coat', 'lunch'],
);
expect('farm packing is not competing as home actions', farmHome.some((card) => ['coat', 'bottle', 'lunch'].includes(card.item.id)), false);
expect(
  'needed-now farm cluster is not also on radar',
  exceptHomeActions(selectRadarWatch([slip, coat, bottle, lunch], today), farmHome).map((card) => card.item.id),
  [],
);

const gala = item({
  id: 'gala',
  title: "Arlo's swimming gala Thursday",
  kind: 'context_only',
  event_date: '2026-09-11',
  confidence: 'high',
});
const galaForm = item({
  id: 'gala-form',
  title: 'Swimming gala — medical form',
  kind: 'obligation',
  due_at: '2026-09-10',
  confidence: 'high',
  parent_id: 'gala',
  parent: { title: gala.title, kind: 'context_only', event_date: '2026-09-11' },
});
const goggles = item({
  id: 'goggles',
  title: 'Goggles',
  kind: 'obligation',
  due_at: '2026-09-11',
  confidence: 'high',
  parent_id: 'gala',
  parent: { title: gala.title, kind: 'context_only', event_date: '2026-09-11' },
  created_at: '2026-09-01T10:00:00Z',
});
const costume = item({
  id: 'costume',
  title: 'One-piece costume',
  kind: 'obligation',
  due_at: '2026-09-11',
  confidence: 'high',
  parent_id: 'gala',
  parent: { title: gala.title, kind: 'context_only', event_date: '2026-09-11' },
  created_at: '2026-09-01T11:00:00Z',
});
const towel = item({
  id: 'towel',
  title: 'Named towel',
  kind: 'obligation',
  due_at: '2026-09-11',
  confidence: 'high',
  parent_id: 'gala',
  parent: { title: gala.title, kind: 'context_only', event_date: '2026-09-11' },
  created_at: '2026-09-01T12:00:00Z',
});
const galaHome = selectHomeActions([gala, galaForm, goggles, costume, towel], { today });
expect('this-week gala is the home card', galaHome.map((card) => card.item.id), ['gala']);
expect(
  'gala home card holds the form and kit',
  galaHome[0]?.children.map((row) => row.id).sort(),
  ['costume', 'gala-form', 'goggles', 'towel'],
);
expect('gala form is not a second home card', galaHome.some((card) => card.item.id === 'gala-form'), false);
expect(
  'gala kit is not competing as home actions',
  galaHome.some((card) => ['goggles', 'costume', 'towel'].includes(card.item.id)),
  false,
);
const galaRadar = exceptHomeActions(selectRadarWatch([gala, galaForm, goggles, costume, towel], today), galaHome);
expect('needed-now gala cluster is not also on radar', galaRadar, []);

const sessions = item({
  id: 'sessions',
  title: 'Group sessions start Thursday',
  kind: 'list_item',
  due_at: '2026-09-09',
  collection_id: null,
});
const kit = item({ id: 'kit', title: 'Kit', kind: 'obligation', due_at: null, parent_id: 'sessions' });
const sessionBottle = item({ id: 'session-bottle', title: 'Water bottle', kind: 'obligation', due_at: null, parent_id: 'sessions' });
const sessionRadar = selectRadarWatch([sessions, kit, sessionBottle, hold], today);
expect('orphaned list hub children regroup on radar', sessionRadar.some((card) => card.item.id === 'sessions' && card.children.length === 2), true);

const frankCard = item({
  id: 'frank-card',
  title: 'Card',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  parent_id: 'franks-gone',
  parent: { title: "Frank's birthday", kind: 'occurrence', status: 'dismissed', occurs_at: '2026-09-08T12:00:00', event_date: '2026-09-08' },
  created_at: '2026-09-01T10:00:00Z',
});
const frankPresent = item({
  id: 'frank-present',
  title: 'Present',
  kind: 'obligation',
  due_at: null,
  confidence: 'medium',
  parent_id: 'franks-gone',
  parent: { title: "Frank's birthday", kind: 'occurrence', status: 'dismissed', occurs_at: '2026-09-08T12:00:00', event_date: '2026-09-08' },
  created_at: '2026-09-01T11:00:00Z',
});
const frankRadar = selectRadarWatch([frankCard, frankPresent], today);
expect('dismissed-parent leftovers are not radar cards', frankRadar.length, 0);
expect(
  'dismissed-parent leftovers are not home cards',
  selectHomeActions([frankCard, frankPresent], { today }).length,
  0,
);
expect('named leftover is a closed-parent child', isChildOfClosedParent(frankCard), true);

const wedding = item({
  id: 'wedding-gone',
  title: 'Wedding',
  kind: 'occurrence',
  status: 'dismissed',
  occurs_at: '2026-09-10',
});
const shoes = item({
  id: 'arlo-shoes',
  title: "Buy Arlo's shoes for wedding",
  kind: 'obligation',
  due_at: '2026-09-10',
  confidence: 'medium',
  parent_id: 'wedding-gone',
  parent: { title: wedding.title, kind: 'occurrence', status: 'dismissed', occurs_at: wedding.occurs_at },
});
expect('named child of a dismissed parent is not a home card', isHomeEligible(shoes, today), false);
expect('named child of a dismissed parent is not on radar', isRadarWatchItem(shoes, today), false);
expect(
  'dismissed wedding does not leave shoes on home',
  selectHomeActions([wedding, shoes], { today }).some((card) => card.item.id === 'arlo-shoes'),
  false,
);
expect('bare card title is prep', isBarePrepTitle('Card'), true);
expect('bare present title is prep', isBarePrepTitle('Present'), true);
expect('named birthday card is not a bare prep title', isBarePrepTitle('Birthday card for Teddy'), false);

const teddyOpen = item({
  id: 'teddy-open',
  title: "Teddy's birthday party",
  kind: 'context_only',
  event_date: '2026-09-12',
  confidence: 'high',
});
const datedBareCard = item({
  id: 'bare-card',
  title: 'Card',
  kind: 'obligation',
  due_at: '2026-09-12',
  confidence: 'high',
  parent_id: 'teddy-open',
  parent: { title: teddyOpen.title, kind: 'context_only', event_date: '2026-09-12' },
});
const namedTeddyCard = item({
  id: 'named-card',
  title: 'Birthday card for Teddy',
  kind: 'obligation',
  due_at: '2026-09-12',
  confidence: 'medium',
  parent_id: 'teddy-open',
  parent: { title: teddyOpen.title, kind: 'context_only', event_date: '2026-09-12' },
});
expect('dated Card child is not a home action', isHomeEligible(datedBareCard, today), false);
expect('dated Card child is not a radar card', isRadarWatchItem(datedBareCard, today), false);
expect('named birthday card can still be a home action', isHomeEligible(namedTeddyCard, today), true);
expect(
  'bare Card never appears on home or radar',
  [...selectHomeActions([teddyOpen, datedBareCard, namedTeddyCard], { today }), ...selectRadarWatch([teddyOpen, datedBareCard, namedTeddyCard], today)]
    .some((card) => card.item.id === 'bare-card' || card.children.some((row) => row.id === 'bare-card')),
  false,
);

const teddyHub = item({
  id: 'teddy-hub',
  title: 'Get Teddy a party present',
  kind: 'list_item',
  collection_id: 'teddy-party-list',
});
const teddyCard = item({
  id: 'teddy-card-line',
  title: 'Card',
  kind: 'obligation',
  due_at: null,
  parent_id: 'teddy-hub',
  parent: { title: teddyHub.title, kind: 'list_item', collection_id: 'teddy-party-list' },
});
const teddyPresent = item({
  id: 'teddy-present-line',
  title: 'Present',
  kind: 'obligation',
  due_at: null,
  parent_id: 'teddy-hub',
  parent: { title: teddyHub.title, kind: 'list_item', collection_id: 'teddy-party-list' },
});
expect(
  'list packing lines stay off radar',
  selectRadarWatch([teddyHub, teddyCard, teddyPresent, hold], today).some(
    (card) => card.item.id === 'teddy-card-line' || card.item.id === 'teddy-present-line' || card.children.some((row) => row.id === 'teddy-card-line'),
  ),
  false,
);

const todoHub = item({
  id: 'teddy-todo',
  title: 'Get Teddy a party present',
  kind: 'obligation',
  collection_id: 'todo-col',
});
const wrap = item({
  id: 'wrap-line',
  title: 'Wrapping paper',
  kind: 'obligation',
  due_at: null,
  parent_id: 'teddy-todo',
  parent: { title: todoHub.title, kind: 'obligation', collection_id: 'todo-col' },
});
expect(
  'children of a general-to-do parent stay off radar',
  selectRadarWatch([todoHub, wrap, hold], today).some(
    (card) => card.item.id === 'wrap-line' || card.children.some((row) => row.id === 'wrap-line'),
  ),
  false,
);

const bumperA = item({ id: 'slip-now', title: 'Permission slip', kind: 'obligation', confidence: 'high', due_at: '2026-09-08', created_at: '2026-09-06T10:00:00Z' });
const bumperB = item({ id: 'invoice-now', title: 'Nursery invoice', kind: 'obligation', confidence: 'high', due_at: '2026-09-08', created_at: '2026-09-06T11:00:00Z' });
const bumperC = item({ id: 'bottle-now', title: 'Named water bottle', kind: 'obligation', confidence: 'high', due_at: '2026-09-09', created_at: '2026-09-06T12:00:00Z' });
const oriel = item({
  id: 'oriel',
  title: "RSVP for Oriel's Bar Mitzvah",
  kind: 'obligation',
  confidence: 'medium',
  due_at: '2026-10-16',
  created_at: '2026-09-01T10:00:00Z',
});
const crowded = [bumperA, bumperB, bumperC, oriel];
expect('far-dated RSVP is home-eligible', isHomeEligible(oriel, today), true);
expect('far-dated RSVP loses the home cap', selectHomeActions(crowded, { today }).some((card) => card.item.id === 'oriel'), false);
expect(
  'far-dated RSVP still lands on radar so it is not family-only',
  selectRadarWatch(crowded, today).some((card) => card.item.id === 'oriel'),
  true,
);
expect('far-dated RSVP stays on family because it is on plan', isFamilyVisible(oriel, today), true);

const tripDay = new Date(2026, 8, 9);
const farmSlipToday = item({
  id: 'farm-today',
  title: 'Return the farm trip permission slip',
  kind: 'obligation',
  confidence: 'medium',
  due_at: '2026-09-08T23:00:00.000Z',
  event_date: '2026-09-09',
  created_at: '2026-09-01T09:00:00Z',
});
const libSoon = item({
  id: 'lib-soon',
  title: "Taya's library visit permission slip",
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-10',
  created_at: '2026-09-08T10:00:00Z',
});
const bottleSoon = item({
  id: 'bottle-soon',
  title: 'Named water bottle',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-11',
  created_at: '2026-09-08T11:00:00Z',
});
const invoiceSoon = item({
  id: 'invoice-soon',
  title: 'Nursery invoice',
  kind: 'obligation',
  confidence: 'high',
  due_at: '2026-09-11',
  created_at: '2026-09-08T12:00:00Z',
});
const homeOnTripDay = selectHomeActions([farmSlipToday, libSoon, bottleSoon, invoiceSoon], { today: tripDay });
expect('farm slip due today is a home bumper even at medium confidence', homeOnTripDay[0]?.item.id, 'farm-today');
expect('farm slip is on home the day of the trip', homeOnTripDay.some((card) => card.item.id === 'farm-today'), true);

const bootcamp = item({
  id: 'bootcamp',
  title: 'Accommodation for bootcamp',
  kind: 'obligation',
  confidence: 'high',
  due_at: null,
  collection_id: 'todo-col',
});
expect(
  'todo-list members are not their own radar cards',
  selectRadarWatch([bootcamp, hold], today).some((card) => card.item.id === 'bootcamp'),
  false,
);
expect('holds still on radar beside lists', selectRadarWatch([bootcamp, hold], today).some((card) => card.item.id === 'hold'), true);

const helmetHold = item({
  id: 'helmet-hold',
  title: "Taya's bike helmet cracked",
  kind: 'hold',
  confidence: 'high',
});
const buyHelmet = item({
  id: 'buy-helmet',
  title: 'Buy new bike helmet for Taya',
  kind: 'obligation',
  due_at: null,
  confidence: 'high',
  parent_id: 'helmet-hold',
  parent: { title: helmetHold.title, kind: 'hold' },
});
const helmetRadar = selectRadarWatch([helmetHold, buyHelmet], today);
expect('cracked helmet is one radar hold', helmetRadar.length, 1);
expect('cracked helmet card is the hold', helmetRadar[0]?.item.id, 'helmet-hold');
expect('buy-helmet is not a second radar card', helmetRadar.some((card) => card.item.id === 'buy-helmet'), false);

const holdHub = item({
  id: 'trainers-hold',
  title: 'Trainers getting small',
  kind: 'hold',
  created_at: '2026-09-06T12:00:00Z',
});
const measure = item({ id: 'measure', title: 'Measure feet', kind: 'obligation', due_at: null, parent_id: 'trainers-hold', created_at: '2026-09-06T13:00:00Z' });
const order = item({ id: 'order-pair', title: 'Order a pair', kind: 'obligation', due_at: null, parent_id: 'trainers-hold', created_at: '2026-09-06T14:00:00Z' });
const holdCluster = selectRadarWatch([holdHub, measure, order], today);
expect('hold plus two children is one radar card', holdCluster.length, 1);
expect('hold cluster uses the parent once', holdCluster[0]?.item.id, 'trainers-hold');
expect(
  'hold is not also a second card with the same id',
  holdCluster.filter((card) => card.item.id === 'trainers-hold').length,
  1,
);

const primarkEvt = item({
  id: 'primark-evt',
  title: 'Your Primark interview Confirmation! @ Sep 8, 2026, 1:30:00 PM - 2:00:00 PM (GMT+1)',
  kind: 'occurrence',
  occurs_at: '2026-09-08T13:30:00',
  status: 'dismissed',
});
const research = item({
  id: 'research',
  title: 'Research Primark',
  kind: 'obligation',
  due_at: null,
  parent_id: 'primark-evt',
  parent: { title: primarkEvt.title, kind: 'occurrence', occurs_at: primarkEvt.occurs_at },
  created_at: '2026-09-01T10:00:00Z',
});
const examples = item({
  id: 'examples-prep',
  title: 'Prepare examples',
  kind: 'obligation',
  due_at: null,
  parent_id: 'primark-evt',
  parent: { title: primarkEvt.title, kind: 'occurrence', occurs_at: primarkEvt.occurs_at },
  created_at: '2026-09-01T11:00:00Z',
});
const jd = item({
  id: 'jd',
  title: 'Review job description',
  kind: 'obligation',
  due_at: null,
  parent_id: 'primark-evt',
  parent: { title: primarkEvt.title, kind: 'occurrence', occurs_at: primarkEvt.occurs_at },
  created_at: '2026-09-01T12:00:00Z',
});
const primarkRadar = selectRadarWatch([research, examples, jd], today);
expect('named interview leftovers are off radar when the parent is gone', primarkRadar.length, 0);
expect(
  'calendar leftover title drops confirmation junk',
  shortEventTitle(primarkEvt.title),
  'Your Primark interview',
);
expect(
  'dismissed interview plus children is still empty',
  selectRadarWatch([primarkEvt, research, examples, jd], today).length,
  0,
);

const museumDone = item({
  id: 'museum-form',
  title: 'Sign the museum trip form',
  kind: 'hold',
  status: 'done',
});
const junkNew = item({
  id: 'new-line',
  title: 'New',
  kind: 'obligation',
  due_at: null,
  parent_id: 'museum-form',
  parent: { title: museumDone.title, kind: 'hold', status: 'done' },
});
expect('junk child of a done parent is not a radar card', selectRadarWatch([junkNew], today).length, 0);
expect(
  'done parent loaded still hides the leftover child',
  selectRadarWatch([museumDone, junkNew, hold], today).some((card) => card.item.id === 'new-line'),
  false,
);

const watch = [hold, buyCardPending, item({
  id: 'older-hold',
  title: 'Passport',
  kind: 'hold',
  created_at: '2026-08-01T00:00:00Z',
})].sort(compareRadarWatch);
expect('radar watch sorts newest created first', watch.map((row) => row.id), ['hold', 'card-later', 'older-hold']);

if (!process.exitCode) console.log('placement self-test passed');
