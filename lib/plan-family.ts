import { daysUntil, humanizeEventDate, itemCountLabel, startOfWeek, weekdayShort } from './human-date';
import {
  displayItemTitle,
  isFamilyVisible,
  isHomeEligible,
  isOpenForSurfacing,
  isRadarWatchItem,
  unwrapParent,
  type PlacementParent,
} from './placement';
import { isListHubTitle } from './radar-organize';

const TODO_LIST_TITLE = 'General to do';
const PASTELS = ['blush', 'sage', 'paleBlue'] as const;

export type FamilyCollection = {
  id: string;
  title: string;
  emoji: string | null;
  type: string;
};

export const HOUSEHOLD_KEY = 'household';
export const PREVIEW_ITEM_COUNT = 3;

const HOUSEHOLD_WHO = new Set(['family', 'whole family', 'everyone', 'household', 'all', 'shared', 'both', 'us']);
const SELF_WHO = new Set(['you', 'me', 'mum', 'mom', 'dad', 'parent']);

export type FamilyMemberSource = {
  id: string;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type FamilySourceItem = {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  icon: string | null;
  event_date: string | null;
  due_at?: string | null;
  occurs_at?: string | null;
  kind?: string | null;
  confidence?: string | null;
  surface_from?: string | null;
  surface_until?: string | null;
  parent_id?: string | null;
  who_it_affects: string | null;
  delegated_to: string | null;
  status: string | null;
  source: string | null;
  collection_id: string | null;
  created_at?: string | null;
  visibility?: string | null;
  parent?: PlacementParent | PlacementParent[] | null;
};

export type FamilyPerson = {
  key: string;
  name: string;
  initial: string;
  wash: string;
  role: string;
};

export type FamilyPreviewItem = {
  id: string;
  title: string;
  context: string;
  category: string | null;
  storedIcon: string | null;
  event_date: string | null;
  informational: boolean;
};

export type HouseholdTile = {
  key: string;
  kind: 'collection' | 'item';
  title: string;
  status: string;
  category: string | null;
  storedIcon: string | null;
  collectionType?: string;
  collectionId?: string;
  itemId?: string;
};

export type PersonBucket = {
  person: FamilyPerson;
  items: FamilySourceItem[];
  weekItems: FamilySourceItem[];
  preview: FamilyPreviewItem[];
  headline: FamilyPreviewItem | null;
  weekTitles: string[];
};

export type FamilyPlan = {
  people: FamilyPerson[];
  buckets: PersonBucket[];
  householdItems: FamilySourceItem[];
  householdTiles: HouseholdTile[];
};

export function normalizeWho(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/['’]s\b/g, '').replace(/\s+/g, ' ');
}

export function displayMemberName(member: FamilyMemberSource): string {
  const first = member.first_name?.trim();
  if (first) return first;
  const last = member.last_name?.trim();
  if (last) return last;
  const role = (member.role || '').toLowerCase();
  if (role === 'self' || role === 'you') return 'You';
  return 'Family member';
}

export function peopleFromSources(
  members: FamilyMemberSource[],
  profile: { first_name: string | null } | null,
): FamilyPerson[] {
  const people: FamilyPerson[] = [];
  const seenNames = new Set<string>();

  members.forEach((member, index) => {
    const name = displayMemberName(member);
    people.push({
      key: member.id,
      name,
      initial: (name[0] || '?').toUpperCase(),
      wash: PASTELS[index % PASTELS.length],
      role: (member.role || '').toLowerCase(),
    });
    const first = member.first_name?.trim().toLowerCase();
    if (first) seenNames.add(first);
    seenNames.add(name.toLowerCase());
  });

  const profileName = profile?.first_name?.trim() || null;
  const hasSelf = people.some((person) => person.role === 'self' || person.role === 'you');
  if (profileName && !hasSelf && !seenNames.has(profileName.toLowerCase())) {
    people.unshift({
      key: 'profile',
      name: profileName,
      initial: profileName[0].toUpperCase(),
      wash: PASTELS[people.length % PASTELS.length],
      role: 'self',
    });
  }

  return people;
}

function nameNeedles(person: FamilyPerson): string[] {
  const name = normalizeWho(person.name);
  if (!name) return [];
  const parts = name.split(' ').filter(Boolean);
  return [...new Set([name, ...parts])];
}

export function whoMatchesPerson(who: string | null | undefined, person: FamilyPerson): boolean {
  const value = normalizeWho(who);
  if (!value || HOUSEHOLD_WHO.has(value)) return false;

  const tokens = value.split(/[\s,/&+]+/).map((token) => token.replace(/[^a-z]/g, '')).filter(Boolean);
  const needles = nameNeedles(person);

  for (const needle of needles) {
    if (value === needle) return true;
    if (tokens.includes(needle.replace(/[^a-z]/g, ''))) return true;
  }

  const isSelf = person.role === 'self' || person.role === 'you';
  if (isSelf && SELF_WHO.has(value)) return true;

  return false;
}

export function matchingPeople(who: string | null | undefined, people: FamilyPerson[]): FamilyPerson[] {
  return people.filter((person) => whoMatchesPerson(who, person));
}

export function itemMentionsPerson(
  item: { who_it_affects?: string | null; title?: string | null },
  person: FamilyPerson,
): boolean {
  if (whoMatchesPerson(item.who_it_affects, person)) return true;
  return whoMatchesPerson(item.title, person);
}

function hasOutsiderPossessive(raw: string | null | undefined, people: FamilyPerson[]): boolean {
  if (!raw) return false;
  const matches = raw.match(/\b([A-Za-z]{2,})['’]s\b/g) ?? [];
  for (const match of matches) {
    if (matchingPeople(match, people).length) continue;
    const name = normalizeWho(match);
    if (!name || HOUSEHOLD_WHO.has(name) || SELF_WHO.has(name)) continue;
    return true;
  }
  return false;
}

function isFirstPersonAdmin(raw: string): boolean {
  return /\b(my|i|i'm|i’m|i am|i need|i have to|i've|i’ve)\b/i.test(raw);
}

/** Parent's own work: first-person, a speech, or an obligation about someone outside the household. */
export function isViewerOwnAdmin(
  item: FamilySourceItem,
  people: FamilyPerson[],
): boolean {
  const parent = unwrapParent(item.parent);
  const combined = [item.title, item.body, parent?.title].filter(Boolean).join(' ');
  if (isFirstPersonAdmin(combined)) return true;
  if (/\bspeech\b/i.test(combined)) return true;
  if (item.kind !== 'obligation') return false;
  const who = normalizeWho(item.who_it_affects);
  if (who && !HOUSEHOLD_WHO.has(who) && !SELF_WHO.has(who) && matchingPeople(item.who_it_affects, people).length === 0) {
    return true;
  }
  return hasOutsiderPossessive(item.title, people) || hasOutsiderPossessive(parent?.title, people);
}

function surfacePreviewRank(
  item: FamilySourceItem,
  today: Date,
  byId: Map<string, FamilySourceItem>,
): number {
  if (isHomeEligible(item, today, byId)) return 0;
  if (isRadarWatchItem(item, today, byId)) return 1;
  if (item.kind === 'context_only') return 2;
  return 9;
}

/** Home-eligible first, else Radar, else context_only. Nothing else. */
export function pickSurfacePreviewItem<T extends FamilySourceItem>(
  items: T[],
  person: FamilyPerson,
  people: FamilyPerson[],
  today = new Date(),
): T | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const matches = items.filter((item) => {
    const assigned = assignItem(item, people);
    return assigned.kind === 'person' && assigned.key === person.key;
  });
  const ranked = matches
    .map((item) => ({ item, rank: surfacePreviewRank(item, today, byId) }))
    .filter((row) => row.rank < 9)
    .sort((a, b) => a.rank - b.rank || compareFamilyItems(a.item, b.item, today));
  return ranked[0]?.item ?? null;
}

export function pickHouseholdSurfaceItems<T extends FamilySourceItem>(
  items: T[],
  people: FamilyPerson[],
  today = new Date(),
  limit = 5,
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => item.status === 'open')
    .filter((item) => item.visibility === 'shared')
    .filter((item) => assignItem(item, people).kind === 'household')
    .map((item) => ({ item, rank: surfacePreviewRank(item, today, byId) }))
    .filter((row) => row.rank < 9)
    .sort((a, b) => a.rank - b.rank || compareFamilyItems(a.item, b.item, today))
    .slice(0, limit)
    .map((row) => row.item);
}

export function isListCollection(
  collection: { type?: string | null; title?: string | null } | null | undefined,
): boolean {
  if (!collection) return false;
  if (collection.type === 'todo' || collection.title === TODO_LIST_TITLE) return false;
  return true;
}

export function isAttributableItem(
  item: FamilySourceItem,
  collectionsById: Map<string, { type?: string | null; title?: string | null }>,
): boolean {
  if (isListHubTitle(item.title)) return false;
  if (!item.collection_id) return true;
  return !isListCollection(collectionsById.get(item.collection_id));
}

function namedPeopleInText(raw: string | null | undefined, people: FamilyPerson[]): FamilyPerson[] {
  return matchingPeople(raw, people);
}

function viewingSelf(people: FamilyPerson[]): FamilyPerson | undefined {
  return people.find((person) => person.role === 'self' || person.role === 'you');
}

/** Prefer an explicit who tag; otherwise a unique name in the title or parent title.
 *  The viewer's own admin (speech, first-person, outsider obligation) lands on self.
 *  Everything still unclear falls to household — never left unowned. */
export function assignItem(
  item: FamilySourceItem,
  people: FamilyPerson[],
): { kind: 'person'; key: string } | { kind: 'household' } {
  const whoMatches = namedPeopleInText(item.who_it_affects, people);
  if (whoMatches.length === 1) return { kind: 'person', key: whoMatches[0].key };
  const parent = unwrapParent(item.parent);
  const titleMatches = namedPeopleInText([item.title, parent?.title].filter(Boolean).join(' '), people);
  if (titleMatches.length === 1) return { kind: 'person', key: titleMatches[0].key };
  if (whoMatches.length > 1 || titleMatches.length > 1) return { kind: 'household' };
  const who = normalizeWho(item.who_it_affects);
  if (who && HOUSEHOLD_WHO.has(who)) return { kind: 'household' };
  if (who && SELF_WHO.has(who)) {
    const self = viewingSelf(people);
    if (self) return { kind: 'person', key: self.key };
  }
  if (isViewerOwnAdmin(item, people)) {
    const self = viewingSelf(people);
    if (self) return { kind: 'person', key: self.key };
  }
  return { kind: 'household' };
}

export function isInCurrentWeek(eventDate: string | null | undefined, today = new Date()): boolean {
  const days = daysUntil(eventDate, today);
  if (days == null) return false;
  const start = startOfWeek(today);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function familyAnchorDate(item: FamilySourceItem): string | null {
  return item.occurs_at || item.due_at || item.event_date || null;
}

export function compareFamilyItems(a: FamilySourceItem, b: FamilySourceItem, today = new Date()): number {
  const da = daysUntil(familyAnchorDate(a), today);
  const db = daysUntil(familyAnchorDate(b), today);
  const score = (days: number | null) => {
    if (days == null) return 1000;
    if (days < 0) return 400 + Math.abs(days);
    return days;
  };
  const byDate = score(da) - score(db);
  if (byDate !== 0) return byDate;
  return (a.title || '').localeCompare(b.title || '');
}

export function pickPreviewItems(items: FamilySourceItem[], today = new Date(), limit = PREVIEW_ITEM_COUNT): FamilySourceItem[] {
  return [...items].sort((a, b) => compareFamilyItems(a, b, today)).slice(0, limit);
}

export function itemContextLine(item: FamilySourceItem, today = new Date()): string {
  const when = humanizeEventDate(familyAnchorDate(item), today);
  if (when) return when;
  const extra = (item.body || '').replace(/\s+/g, ' ').trim();
  if (extra) {
    const words = extra.split(' ').slice(0, 6).join(' ');
    return words;
  }
  return 'On your radar';
}

export function isInformationalFamilyItem(item: { kind?: string | null }): boolean {
  return item.kind === 'context_only';
}

function toPreview(item: FamilySourceItem, today: Date): FamilyPreviewItem {
  const informational = isInformationalFamilyItem(item);
  return {
    id: item.id,
    title: informational ? (item.title || '').trim() || 'Untitled' : displayItemTitle(item, today),
    context: itemContextLine(item, today),
    category: item.category,
    storedIcon: item.icon,
    event_date: familyAnchorDate(item),
    informational,
  };
}

export function pickHeadlineItem(items: FamilySourceItem[], today = new Date()): FamilySourceItem | null {
  const parents = items.filter((item) => !item.parent_id);
  if (!parents.length) return null;
  const week = parents.filter((item) => isInCurrentWeek(familyAnchorDate(item), today));
  return pickPreviewItems(week.length ? week : parents, today, 1)[0] ?? null;
}

export function familyMemberBlurb(item: FamilyPreviewItem | null, today = new Date()): string {
  if (!item) return 'Nothing coming up this week.';
  const when = weekdayShort(item.event_date, today);
  return when ? `${item.title} · ${when}` : item.title;
}

export function casualTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .toLowerCase();
}

export function fallbackWeeklySummary(name: string, titles: string[]): string {
  const title = titles.map((value) => value.replace(/\s+/g, ' ').trim()).find(Boolean);
  if (!title) return 'Nothing coming up this week.';
  return title;
}

export function weekFingerprint(weekStart: string, people: { id: string; titles: string[] }[]): string {
  return `${weekStart}|${people.map((person) => `${person.id}:${person.titles.join(',')}`).join(';')}`;
}

export function weekStartYmd(today = new Date()): string {
  const start = startOfWeek(today);
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${m}-${d}`;
}

export function buildHouseholdTiles(
  collections: FamilyCollection[],
  counts: Map<string, number>,
  unmatchedItems: FamilySourceItem[],
  today = new Date(),
): HouseholdTile[] {
  const tiles: HouseholdTile[] = [];
  for (const collection of collections) {
    if (!isListCollection(collection)) continue;
    const count = counts.get(collection.id) ?? 0;
    if (count <= 0) continue;
    tiles.push({
      key: `collection:${collection.id}`,
      kind: 'collection',
      title: collection.title,
      status: itemCountLabel(count),
      category: null,
      storedIcon: collection.emoji,
      collectionType: collection.type,
      collectionId: collection.id,
    });
  }

  const items = [...unmatchedItems].sort((a, b) => compareFamilyItems(a, b, today));
  for (const item of items) {
    tiles.push({
      key: `item:${item.id}`,
      kind: 'item',
      title: displayItemTitle(item, today) || 'Untitled',
      status: itemContextLine(item, today),
      category: item.category,
      storedIcon: item.icon,
      itemId: item.id,
    });
  }
  return tiles;
}

function hasOpenChild(item: FamilySourceItem, items: FamilySourceItem[]): boolean {
  return items.some((child) => child.parent_id === item.id && isOpenForSurfacing(child.status));
}

/** People lens over Plan: every open attributable item has an owner, including historic ones. */
function isFamilyTabVisible(item: FamilySourceItem, today: Date, items: FamilySourceItem[]): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind === 'list_item') return false;
  if (isFamilyVisible(item, today)) return true;
  if (item.kind === 'hold') return true;
  if (item.kind === 'obligation') return true;
  if (item.kind === 'occurrence' && (item.occurs_at || item.event_date)) return true;
  if (item.kind === 'context_only' && (item.occurs_at || item.event_date || item.due_at)) return true;
  // Undated context is a stray note unless open work still hangs off it.
  if (item.kind === 'context_only' && hasOpenChild(item, items)) return true;
  return false;
}

export function buildFamilyPlan(
  members: FamilyMemberSource[],
  profile: { first_name: string | null } | null,
  items: FamilySourceItem[],
  collections: FamilyCollection[],
  counts: Map<string, number>,
  today = new Date(),
): FamilyPlan {
  const people = peopleFromSources(members, profile);
  const collectionsById = new Map(collections.map((row) => [row.id, row]));
  const listIds = new Set(items.filter((item) => item.kind === 'list_item').map((item) => item.id));
  const attributable = items.filter((item) => {
    if (!isFamilyTabVisible(item, today, items) || !isAttributableItem(item, collectionsById)) return false;
    if (item.parent_id && listIds.has(item.parent_id)) return false;
    return true;
  });

  const byPerson = new Map<string, FamilySourceItem[]>();
  for (const person of people) byPerson.set(person.key, []);
  const householdItems: FamilySourceItem[] = [];

  for (const item of attributable) {
    const assigned = assignItem(item, people);
    if (assigned.kind === 'person') byPerson.get(assigned.key)?.push(item);
    else householdItems.push(item);
  }

  // Same-bucket children of an occurrence or context_only parent already render as that
  // card's checklist. Do not also list them as their own family rows.
  function stripNestedEventChildren(bucketItems: FamilySourceItem[]): FamilySourceItem[] {
    const byItemId = new Map(bucketItems.map((i) => [i.id, i]));
    return bucketItems.filter((i) => {
      if (!i.parent_id) return true;
      const parent = byItemId.get(i.parent_id);
      if (!parent) return true;
      return parent.kind !== 'occurrence' && parent.kind !== 'context_only';
    });
  }
  for (const [key, personItems] of byPerson) {
    byPerson.set(key, stripNestedEventChildren(personItems));
  }
  const topLevelHouseholdItems = stripNestedEventChildren(householdItems);

  const buckets: PersonBucket[] = people.map((person) => {
    const personItems = byPerson.get(person.key) ?? [];
    const weekItems = personItems.filter(
      (item) => !item.parent_id && isInCurrentWeek(familyAnchorDate(item), today),
    );
    const headlineSource = pickHeadlineItem(personItems, today);
    const previewSource = pickPreviewItems(personItems, today);
    return {
      person,
      items: personItems,
      weekItems,
      preview: previewSource.map((item) => toPreview(item, today)),
      headline: headlineSource ? toPreview(headlineSource, today) : null,
      weekTitles: weekItems.map((item) => displayItemTitle(item, today)),
    };
  });

  return {
    people,
    buckets,
    householdItems: topLevelHouseholdItems,
    householdTiles: buildHouseholdTiles(collections, counts, topLevelHouseholdItems, today),
  };
}

export const householdPerson: FamilyPerson = {
  key: HOUSEHOLD_KEY,
  name: 'Household',
  initial: 'H',
  wash: 'paleBlue',
  role: 'household',
};
