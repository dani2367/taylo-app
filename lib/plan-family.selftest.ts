import { displayItemTitle } from './placement.ts';
import {
  assignItem,
  buildFamilyPlan,
  familyMemberBlurb,
  fallbackWeeklySummary,
  householdPerson,
  isAttributableItem,
  isInformationalFamilyItem,
  matchingPeople,
  peopleFromSources,
  pickHouseholdSurfaceItems,
  pickSurfacePreviewItem,
  whoMatchesPerson,
  type FamilyCollection,
  type FamilyMemberSource,
  type FamilySourceItem,
} from './plan-family.ts';

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

const members: FamilyMemberSource[] = [
  { id: 'arlo', role: 'child', first_name: 'Arlo', last_name: null },
  { id: 'taya', role: 'child', first_name: 'Taya', last_name: null },
  { id: 'sophie', role: 'self', first_name: 'Sophie', last_name: 'Dennison' },
];

const people = peopleFromSources(members, { first_name: 'Sophie' });
expect(
  'profile not duplicated when self exists',
  people.map((p) => p.key),
  ['arlo', 'taya', 'sophie'],
);

const withProfile = peopleFromSources(
  [
    { id: 'arlo', role: 'child', first_name: 'Arlo', last_name: null },
    { id: 'taya', role: 'child', first_name: 'Taya', last_name: null },
  ],
  { first_name: 'Dani' },
);
expect(
  'profile added when missing from family_members',
  withProfile.map((p) => p.name),
  ['Dani', 'Arlo', 'Taya'],
);

expect('case-insensitive name', whoMatchesPerson('  ARLO ', people[0]), true);
expect('possessive name', whoMatchesPerson("Arlo's", people[0]), true);
expect('full name self', whoMatchesPerson('Sophie Dennison', people[2]), true);
expect('you matches self', whoMatchesPerson('you', people[2]), true);
expect('you does not match child', whoMatchesPerson('you', people[0]), false);
expect('family matches nobody', matchingPeople('family', people).map((p) => p.key), []);
expect('empty who matches nobody', matchingPeople(null, people).map((p) => p.key), []);
expect(
  'shared names match both',
  matchingPeople('Arlo and Taya', people).map((p) => p.key),
  ['arlo', 'taya'],
);

function item(partial: Partial<FamilySourceItem> & { id: string; title: string }): FamilySourceItem {
  return {
    body: null,
    category: null,
    icon: null,
    event_date: null,
    due_at: null,
    occurs_at: null,
    kind: 'hold',
    confidence: 'high',
    surface_from: '2026-09-01',
    surface_until: '2026-12-01',
    who_it_affects: null,
    delegated_to: null,
    status: 'open',
    source: 'email',
    collection_id: null,
    ...partial,
  };
}

expect(
  'arlo assignment',
  assignItem(item({ id: '1', title: 'Football', who_it_affects: 'Arlo' }), people),
  { kind: 'person', key: 'arlo' },
);
expect(
  'trimmed name assignment',
  assignItem(item({ id: '1', title: 'Football', who_it_affects: ' arlo ' }), people),
  { kind: 'person', key: 'arlo' },
);
expect(
  'family → household',
  assignItem(item({ id: '2', title: 'Picnic', who_it_affects: 'family' }), people),
  { kind: 'household' },
);
expect(
  'null → household',
  assignItem(item({ id: '3', title: 'Parcel', who_it_affects: null }), people),
  { kind: 'household' },
);
expect(
  'unknown name → household',
  assignItem(item({ id: '4', title: 'Visit', who_it_affects: 'Grandma' }), people),
  { kind: 'household' },
);
expect(
  'two names → household',
  assignItem(item({ id: '5', title: 'Party', who_it_affects: 'Arlo and Taya' }), people),
  { kind: 'household' },
);
expect(
  'you → self',
  assignItem(item({ id: '6', title: 'Checkup', who_it_affects: 'you' }), people),
  { kind: 'person', key: 'sophie' },
);
expect(
  'chairman speech → self',
  assignItem(item({ id: '7', title: 'Chairman speech', who_it_affects: null, kind: 'obligation' }), people),
  { kind: 'person', key: 'sophie' },
);
expect(
  'outsider wedding speech child → self',
  assignItem(
    item({
      id: '8',
      title: 'Chairman speech',
      who_it_affects: null,
      kind: 'obligation',
      parent_id: 'wedding',
      parent: { title: "Oliver's wedding", occurs_at: '2026-12-05' },
    }),
    people,
  ),
  { kind: 'person', key: 'sophie' },
);
expect(
  'household label is household not family',
  householdPerson.name,
  'Household',
);

const daniMembers: FamilyMemberSource[] = [
  { id: 'arlo', role: 'child', first_name: 'Arlo', last_name: null },
  { id: 'taya', role: 'child', first_name: 'Taya', last_name: null },
  { id: 'dani', role: 'self', first_name: 'Dani', last_name: null },
  { id: 'sophie-partner', role: 'partner', first_name: 'Sophie', last_name: 'Dennison' },
];
const daniPeople = peopleFromSources(daniMembers, { first_name: 'Dani' });
expect(
  'dani login: null → household not dani',
  assignItem(item({ id: '3', title: 'Parcel', who_it_affects: null }), daniPeople),
  { kind: 'household' },
);
expect(
  'dani login: unknown name → household not dani',
  assignItem(item({ id: '4', title: 'Visit', who_it_affects: 'Grandma' }), daniPeople),
  { kind: 'household' },
);

const shopping: FamilyCollection = {
  id: 'shop',
  title: 'Shopping',
  emoji: '🛒',
  type: 'shopping',
};
const todo: FamilyCollection = {
  id: 'todo',
  title: 'General to do',
  emoji: '📝',
  type: 'todo',
};

expect(
  'shopping hub not attributable',
  isAttributableItem(item({ id: 'hub', title: 'Shopping', collection_id: 'shop' }), new Map([['shop', shopping]])),
  false,
);
expect(
  'shopping line not attributable',
  isAttributableItem(item({ id: 'milk', title: 'Milk', collection_id: 'shop' }), new Map([['shop', shopping]])),
  false,
);
expect(
  'todo item is attributable',
  isAttributableItem(item({ id: 'form', title: 'Trip form', collection_id: 'todo', who_it_affects: 'Taya' }), new Map([['todo', todo]])),
  true,
);

const plan = buildFamilyPlan(
  members,
  { first_name: 'Sophie' },
  [
    item({ id: 'fb', title: 'Football', who_it_affects: 'Arlo', kind: 'occurrence', occurs_at: '2026-09-06', category: 'activity' }),
    item({ id: 'kit', title: 'Wash kit', who_it_affects: 'Arlo', kind: 'obligation', due_at: '2026-09-06' }),
    item({ id: 'sleep', title: 'Pack for sleepover', who_it_affects: '  Arlo', kind: 'obligation', due_at: '2026-09-05' }),
    item({
      id: 'card',
      title: 'Buy card',
      who_it_affects: 'Arlo',
      kind: 'obligation',
      due_at: null,
      parent_id: 'party',
      parent: { title: "Arlo's birthday party", occurs_at: '2026-09-12' },
    }),
    item({ id: 'dent', title: 'Dentist', who_it_affects: 'Taya', kind: 'occurrence', occurs_at: '2026-09-04' }),
    item({ id: 'parcel', title: 'Pick up parcel', who_it_affects: null, kind: 'obligation', due_at: '2026-09-08' }),
    item({ id: 'radar', title: 'Renew passport', who_it_affects: 'family', kind: 'hold' }),
    item({ id: 'milk', title: 'Milk', collection_id: 'shop', kind: 'list_item' }),
    item({ id: 'form', title: 'Trip form', collection_id: 'todo', who_it_affects: 'Taya', kind: 'obligation', due_at: '2026-09-05' }),
    item({ id: 'party', title: 'Joint party', who_it_affects: 'Arlo and Taya', kind: 'occurrence', occurs_at: '2026-09-12' }),
    item({ id: 'you', title: 'Book GP checkup', who_it_affects: 'you', kind: 'obligation', due_at: '2026-09-11' }),
    item({ id: 'speech', title: "Oliver's speech", who_it_affects: null, kind: 'obligation', due_at: '2026-09-09' }),
  ],
  [shopping, todo],
  new Map([['shop', 4]]),
  today,
);

const arlo = plan.buckets.find((b) => b.person.key === 'arlo')!;
const taya = plan.buckets.find((b) => b.person.key === 'taya')!;
const sophie = plan.buckets.find((b) => b.person.key === 'sophie')!;

expect(
  'arlo items include calendar occurrence and obligations',
  arlo.items.map((i) => i.id).sort(),
  ['card', 'fb', 'kit', 'sleep'],
);
expect(
  'child obligation title includes parent context',
  displayItemTitle(arlo.items.find((i) => i.id === 'card')!, today).includes("Arlo's birthday party"),
  true,
);
expect(
  'taya items include appointment and open to-do',
  taya.items.map((i) => i.id).sort(),
  ['dent', 'form'],
);
expect(
  'sophie items include own admin and untagged speech',
  sophie.items.map((i) => i.id).sort(),
  ['speech', 'you'],
);
expect(
  'unclear and shared items stay on household',
  plan.householdItems.map((i) => i.id).sort(),
  ['parcel', 'party', 'radar'],
);
expect(
  'shopping is a household collection tile',
  plan.householdTiles.some((t) => t.kind === 'collection' && t.title === 'Shopping' && t.status === '4 items'),
  true,
);
expect(
  'untagged speech sits on self not household',
  sophie.items.some((i) => i.id === 'speech') && !plan.householdItems.some((i) => i.id === 'speech'),
  true,
);

const daniPlan = buildFamilyPlan(
  daniMembers,
  { first_name: 'Dani' },
  [
    item({ id: 'parcel', title: 'Pick up parcel', who_it_affects: null, kind: 'obligation', due_at: '2026-09-08' }),
    item({ id: 'speech', title: "Oliver's speech", who_it_affects: null, kind: 'obligation', due_at: '2026-09-09' }),
    item({ id: 'you', title: 'Book GP checkup', who_it_affects: 'you', kind: 'obligation', due_at: '2026-09-11' }),
    item({ id: 'party', title: 'Joint party', who_it_affects: 'Arlo and Taya', kind: 'occurrence', occurs_at: '2026-09-12' }),
  ],
  [shopping, todo],
  new Map([['shop', 4]]),
  today,
);
const dani = daniPlan.buckets.find((b) => b.person.key === 'dani')!;
const sophieAsPartner = daniPlan.buckets.find((b) => b.person.key === 'sophie-partner')!;
expect(
  'dani login: own admin and speech land on dani',
  dani.items.map((i) => i.id).sort(),
  ['speech', 'you'],
);
expect(
  'dani login: unclear items land on household not dani',
  daniPlan.householdItems.map((i) => i.id).sort(),
  ['parcel', 'party'],
);
expect(
  'dani login: sophie partner bucket stays empty',
  sophieAsPartner.items.map((i) => i.id),
  [],
);
expect(
  'undated family hold uses on your radar',
  plan.householdTiles.some((t) => t.itemId === 'radar' && t.status === 'On your radar'),
  true,
);
expect(
  'todo list is not a household collection tile',
  plan.householdTiles.some((t) => t.collectionId === 'todo'),
  false,
);
expect(
  'milk not attributed as a person item',
  plan.buckets.every((b) => !b.items.some((i) => i.id === 'milk')),
  true,
);

expect(
  'arlo blurb is top parent this week',
  familyMemberBlurb(arlo.headline, today),
  'Pack for sleepover · Today',
);
expect(
  'arlo blurb does not fold children',
  familyMemberBlurb(arlo.headline, today).includes('card') || arlo.weekTitles.some((t) => t.includes('card')),
  false,
);
expect(
  'taya blurb is top parent',
  familyMemberBlurb(taya.headline, today),
  'Trip form · Today',
);
expect(
  'empty week copy',
  familyMemberBlurb(null, today),
  'Nothing coming up this week.',
);

const appointmentOnly = buildFamilyPlan(
  members,
  { first_name: 'Sophie' },
  [item({ id: 'taya-dent', title: 'Dentist', who_it_affects: 'Taya', kind: 'occurrence', occurs_at: '2026-09-10' })],
  [],
  new Map(),
  today,
);
const tayaOnly = appointmentOnly.buckets.find((b) => b.person.key === 'taya')!;
expect('appointment-only person is not empty', tayaOnly.items.map((i) => i.id), ['taya-dent']);
expect('appointment-only preview shows the event', tayaOnly.preview.map((i) => i.id), ['taya-dent']);
expect(
  'appointment-only siblings stay empty',
  appointmentOnly.buckets.filter((b) => b.person.key !== 'taya').every((b) => b.items.length === 0),
  true,
);

const withTeddy = buildFamilyPlan(
  [...members, { id: 'teddy', role: 'child', first_name: 'Teddy', last_name: null }],
  { first_name: 'Sophie' },
  [
    item({
      id: 'teddy-party',
      title: "Teddy's birthday party",
      who_it_affects: 'whole family',
      kind: 'context_only',
      event_date: '2026-09-12',
      due_at: '2026-09-12',
    }),
    item({
      id: 'teddy-card',
      title: 'Birthday card for Teddy',
      who_it_affects: 'whole family',
      kind: 'obligation',
      due_at: '2026-09-12',
      parent_id: 'teddy-party',
      parent: { title: "Teddy's birthday party", event_date: '2026-09-12' },
    }),
  ],
  [],
  new Map(),
  today,
);
const teddy = withTeddy.buckets.find((b) => b.person.key === 'teddy')!;
expect(
  'email party lands on teddy not household',
  teddy.items.map((i) => i.id).sort(),
  ['teddy-party'],
);
expect('email party is informational on family', isInformationalFamilyItem(teddy.items.find((i) => i.id === 'teddy-party')!), true);
expect(
  'teddy preview is the party parent',
  teddy.preview.map((i) => i.id),
  ['teddy-party'],
);
expect(
  'teddy party preview is informational not an action line',
  teddy.preview.find((i) => i.id === 'teddy-party')?.informational,
  true,
);
expect(
  'teddy party stays off household',
  withTeddy.householdItems.some((i) => i.id === 'teddy-party' || i.id === 'teddy-card'),
  false,
);

const dietitianPlan = buildFamilyPlan(
  members,
  { first_name: 'Sophie' },
  [
    item({
      id: 'dietitian',
      title: 'Dietitian availability delayed',
      who_it_affects: 'Taya',
      kind: 'context_only',
    }),
    item({
      id: 'compleat',
      title: 'Compleat Paediatric 500ml supply swap',
      who_it_affects: 'Taya',
      kind: 'hold',
      parent_id: 'dietitian',
      parent: { title: 'Dietitian availability delayed', kind: 'context_only' },
    }),
  ],
  [],
  new Map(),
  today,
);
const tayaDiet = dietitianPlan.buckets.find((b) => b.person.key === 'taya')!;
expect(
  'dietitian cluster stays the parent on family',
  tayaDiet.items.map((i) => i.id),
  ['dietitian'],
);
expect(
  'compleat is not a second family row',
  tayaDiet.items.some((i) => i.id === 'compleat'),
  false,
);
expect(
  'stray undated context without children stays off family',
  buildFamilyPlan(
    members,
    { first_name: 'Sophie' },
    [item({ id: 'note', title: 'Some note', who_it_affects: 'Taya', kind: 'context_only' })],
    [],
    new Map(),
    today,
  ).buckets.find((b) => b.person.key === 'taya')!.items.map((i) => i.id),
  [],
);

expect(
  'fallback is first title only',
  fallbackWeeklySummary('Arlo', ['Year 2 London trip', 'packed lunch']),
  'Year 2 London trip',
);

const arloPerson = people[0];
expect(
  'preview prefers home-eligible over radar and context',
  pickSurfacePreviewItem(
    [
      item({ id: 'inset', title: 'INSET day', who_it_affects: 'Arlo', kind: 'context_only', occurs_at: '2026-09-20' }),
      item({ id: 'hold', title: 'Helmet too small', who_it_affects: 'Arlo', kind: 'hold' }),
      item({
        id: 'form',
        title: 'Trip form',
        who_it_affects: 'Arlo',
        kind: 'obligation',
        due_at: '2026-09-06',
        confidence: 'high',
        surface_from: '2026-09-01',
      }),
    ],
    arloPerson,
    people,
    today,
  )?.id,
  'form',
);
expect(
  'preview falls back to radar hold',
  pickSurfacePreviewItem(
    [
      item({ id: 'inset', title: 'INSET day', who_it_affects: 'Arlo', kind: 'context_only', occurs_at: '2026-09-20' }),
      item({ id: 'hold', title: 'Helmet too small', who_it_affects: 'Arlo', kind: 'hold' }),
    ],
    arloPerson,
    people,
    today,
  )?.id,
  'hold',
);
expect(
  'schedule-only dentist is not a family preview',
  pickSurfacePreviewItem(
    [item({ id: 'dent', title: 'Dentist', who_it_affects: 'Arlo', kind: 'occurrence', occurs_at: '2026-09-10' })],
    arloPerson,
    people,
    today,
  ),
  null,
);
expect(
  'shared household hold is a household preview',
  pickHouseholdSurfaceItems(
    [item({ id: 'pass', title: 'Renew passport', who_it_affects: 'family', kind: 'hold', visibility: 'shared' })],
    people,
    today,
  ).map((row) => row.id),
  ['pass'],
);
expect(
  'private family item is not a household preview',
  pickHouseholdSurfaceItems(
    [item({ id: 'pass', title: 'Renew passport', who_it_affects: 'family', kind: 'hold', visibility: 'private' })],
    people,
    today,
  ).length,
  0,
);

const historic = buildFamilyPlan(
  members,
  { first_name: 'Sophie' },
  [
    item({
      id: 'old-form',
      title: 'Old trip form',
      who_it_affects: 'Taya',
      kind: 'obligation',
      due_at: '2026-08-01',
      surface_from: '2026-07-01',
      surface_until: '2026-08-08',
    }),
  ],
  [],
  new Map(),
  today,
);
expect(
  'historic obligation still has an owner',
  historic.buckets.find((b) => b.person.key === 'taya')!.items.map((i) => i.id),
  ['old-form'],
);

const weddingPlan = buildFamilyPlan(
  daniMembers,
  { first_name: 'Dani' },
  [
    item({
      id: 'wedding',
      title: "Oliver's wedding",
      kind: 'occurrence',
      occurs_at: '2026-12-05',
      who_it_affects: null,
    }),
    item({
      id: 'chair',
      title: 'Chairman speech',
      kind: 'obligation',
      due_at: '2026-12-05',
      parent_id: 'wedding',
      parent: { title: "Oliver's wedding", occurs_at: '2026-12-05', kind: 'occurrence' },
      who_it_affects: null,
    }),
  ],
  [],
  new Map(),
  today,
);
expect(
  'chairman speech is on dani',
  weddingPlan.buckets.find((b) => b.person.key === 'dani')!.items.map((i) => i.id),
  ['chair'],
);
expect(
  'wedding occurrence stays on household without swallowing the speech',
  weddingPlan.householdItems.map((i) => i.id),
  ['wedding'],
);

if (!process.exitCode) console.log('plan-family self-test passed');
