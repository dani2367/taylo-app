import {
  defaultVisibilityForWho,
  defaultShoppingVisibility,
  defaultListVisibility,
  ITEM_VISIBILITY,
  completeItem,
  defaultItemVisibility,
  isVisibleToMember,
  itemsVisibleToMember,
  newItemVisibilityFields,
  shareItem,
  visibilityPatch,
  type ViewerContext,
  type VisibilityFields,
} from '../supabase/functions/_shared/item-visibility.ts';
import {
  isFamilyVisible,
  isScheduleItem,
  selectHomeActions,
  selectRadarWatch,
  type PlacementItem,
} from './placement.ts';
import { buildFamilyPlan, type FamilyMemberSource, type FamilySourceItem } from './plan-family.ts';
import { mapAgendaRow, type ScheduleSourceItem } from './schedule.ts';

const today = new Date(2026, 8, 7); // Monday 7 Sep 2026
const householdId = 'hh-dani-sophie';
const dani: ViewerContext = { userId: 'dani', householdId };
const sophie: ViewerContext = { userId: 'sophie', householdId };

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

function row(
  partial: Partial<VisibilityFields> & { id: string; created_by: string },
): VisibilityFields {
  return {
    household_id: householdId,
    visibility: defaultItemVisibility(),
    who_it_affects: 'Arlo',
    status: 'open',
    ...newItemVisibilityFields(partial.created_by, householdId),
    ...partial,
  };
}

const created = row({ id: 'form', created_by: dani.userId, who_it_affects: 'Arlo' });
expect('new item defaults to private', created.visibility, ITEM_VISIBILITY.private);

const whoHousehold = { userName: 'Dani', children: ['Taya', 'Arlo'], partner: 'Sophie' };
expect('child who is shared', defaultVisibilityForWho('Arlo', whoHousehold), ITEM_VISIBILITY.shared);
expect('family who is shared', defaultVisibilityForWho('family', whoHousehold), ITEM_VISIBILITY.shared);
expect('partner who is shared', defaultVisibilityForWho('Sophie', whoHousehold), ITEM_VISIBILITY.shared);
expect('self who stays private', defaultVisibilityForWho('you', whoHousehold), ITEM_VISIBILITY.private);
expect('own name stays private', defaultVisibilityForWho('Dani', whoHousehold), ITEM_VISIBILITY.private);
expect('unknown who stays private', defaultVisibilityForWho('Oliver', whoHousehold), ITEM_VISIBILITY.private);
expect('null who stays private', defaultVisibilityForWho(null, whoHousehold), ITEM_VISIBILITY.private);
expect('shopping list is shared by default', defaultShoppingVisibility(), ITEM_VISIBILITY.shared);
expect('general to do is a household list', defaultListVisibility('todo', 'General to do'), ITEM_VISIBILITY.shared);
expect('named list stays private until shared', defaultListVisibility('custom', 'Holiday packing'), ITEM_VISIBILITY.private);
expect(
  'partner can see a household shopping hub',
  isVisibleToMember(
    row({
      id: 'shop',
      created_by: sophie.userId,
      who_it_affects: 'family',
      visibility: defaultShoppingVisibility(),
    }),
    dani,
  ),
  true,
);
expect(
  'new child item can insert already shared',
  newItemVisibilityFields(dani.userId, householdId, defaultVisibilityForWho('Taya', whoHousehold)).visibility,
  ITEM_VISIBILITY.shared,
);
expect('private item is visible to creator', isVisibleToMember(created, dani), true);
expect('private item is invisible to the other household member', isVisibleToMember(created, sophie), false);

const shared = shareItem(created);
expect('share keeps the same row id', shared.id, created.id);
expect('share does not copy who_it_affects', shared.who_it_affects, created.who_it_affects);
expect('share patch does not include who_it_affects', Object.keys(visibilityPatch(ITEM_VISIBILITY.shared)).sort(), [
  'visibility',
]);
expect('shared item is visible to creator', isVisibleToMember(shared, dani), true);
expect('shared item is visible to the other household member', isVisibleToMember(shared, sophie), true);

const store = new Map<string, VisibilityFields>([['form', { ...created }]]);
store.set('form', shareItem(store.get('form')!));
const sophieView = itemsVisibleToMember([...store.values()], sophie)[0];
expect('both partners read the same shared row', sophieView.id, 'form');
store.set('form', completeItem(store.get('form')!));
expect('completing a shared item updates the same row', store.get('form')?.status, 'done');
expect('the other partner sees that completion on the same id', itemsVisibleToMember([...store.values()], sophie)[0], {
  ...shared,
  status: 'done',
});

function homeItem(id: string, created_by: string, visibility = defaultItemVisibility()): PlacementItem & VisibilityFields {
  return {
    id,
    title: 'Return the trip form',
    kind: 'obligation',
    occurs_at: null,
    due_at: '2026-09-07',
    confidence: 'high',
    surface_from: '2026-09-07',
    surface_until: '2026-09-07',
    status: 'open',
    parent_id: null,
    created_at: '2026-09-01T10:00:00Z',
    created_by,
    household_id: householdId,
    visibility,
    who_it_affects: 'Arlo',
  };
}

function radarHold(id: string, created_by: string, visibility = defaultItemVisibility()): PlacementItem & VisibilityFields {
  return {
    id,
    title: 'Helmet is cracked',
    kind: 'hold',
    occurs_at: null,
    due_at: null,
    confidence: 'high',
    surface_from: null,
    surface_until: null,
    status: 'open',
    created_at: '2026-09-01T10:00:00Z',
    created_by,
    household_id: householdId,
    visibility,
    who_it_affects: 'Arlo',
  };
}

function scheduleOcc(id: string, created_by: string, visibility = defaultItemVisibility()): ScheduleSourceItem & VisibilityFields {
  return {
    id,
    title: 'Nursery',
    body: null,
    category: null,
    icon: null,
    occurs_at: '2026-09-07T09:00:00',
    who_it_affects: 'Arlo',
    kind: 'occurrence',
    status: 'open',
    confidence: 'high',
    created_by,
    household_id: householdId,
    visibility,
  };
}

function familyHold(id: string, created_by: string, visibility = defaultItemVisibility()): FamilySourceItem & VisibilityFields {
  return {
    id,
    title: 'Helmet is cracked',
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
    who_it_affects: 'Arlo',
    delegated_to: null,
    status: 'open',
    source: 'email',
    collection_id: null,
    created_by,
    household_id: householdId,
    visibility,
  };
}

const members: FamilyMemberSource[] = [{ id: 'arlo', role: 'child', first_name: 'Arlo', last_name: null }];

const privatePool = [homeItem('dani-form', dani.userId), homeItem('sophie-form', sophie.userId)];
expect(
  'Home query hides the other partner private item',
  selectHomeActions(itemsVisibleToMember(privatePool, dani), { today }).map((card) => card.item.id),
  ['dani-form'],
);
expect(
  'Home query still shows the creator private item',
  selectHomeActions(itemsVisibleToMember(privatePool, sophie), { today }).map((card) => card.item.id),
  ['sophie-form'],
);

const radarPool = [radarHold('dani-hold', dani.userId), radarHold('sophie-hold', sophie.userId)];
expect(
  'Radar query hides the other partner private item',
  selectRadarWatch(itemsVisibleToMember(radarPool, dani), today).map((card) => card.item.id),
  ['dani-hold'],
);

const schedulePool = [scheduleOcc('dani-day', dani.userId), scheduleOcc('sophie-day', sophie.userId)];
const daniSchedule = itemsVisibleToMember(schedulePool, dani)
  .map((item) => mapAgendaRow(item, today))
  .filter(Boolean)
  .map((item) => item!.id);
expect('Schedule query hides the other partner private item', daniSchedule, ['dani-day']);
expect(
  'Schedule placement still accepts the creator private occurrence',
  isScheduleItem(itemsVisibleToMember(schedulePool, dani)[0]),
  true,
);

const familyPool = [familyHold('dani-hold', dani.userId), familyHold('sophie-hold', sophie.userId)];
expect('Family filter keeps only visible rows', itemsVisibleToMember(familyPool, dani).map((item) => item.id), [
  'dani-hold',
]);
expect('Family placement still shows the creator private hold', isFamilyVisible(familyHold('dani-hold', dani.userId), today), true);
const daniFamily = buildFamilyPlan(
  members,
  { first_name: 'Dani' },
  itemsVisibleToMember(familyPool, dani),
  [],
  new Map(),
  today,
);
expect(
  'Family plan does not include the other partner private item',
  daniFamily.buckets.some((bucket) => bucket.items.some((item) => item.id === 'sophie-hold')),
  false,
);

const mixed = [
  homeItem('own-private', dani.userId),
  shareItem(homeItem('shared-form', sophie.userId, ITEM_VISIBILITY.shared)),
];
expect(
  'shared Home item is the same row for both partners',
  selectHomeActions(itemsVisibleToMember(mixed, dani), { today }).map((card) => card.item.id).sort(),
  ['own-private', 'shared-form'],
);
expect(
  'partner Home reads the shared row id',
  selectHomeActions(itemsVisibleToMember(mixed, sophie), { today }).map((card) => card.item.id),
  ['shared-form'],
);
