import { daysUntil, humanizeEventDate, itemCountLabel, startOfWeek } from './human-date';
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

const HOUSEHOLD_WHO = new Set(['family', 'everyone', 'household', 'all', 'shared', 'both', 'us']);
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
  who_it_affects: string | null;
  delegated_to: string | null;
  status: string | null;
  source: string | null;
  collection_id: string | null;
  created_at?: string | null;
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
  if (item.source === 'calendar') return false;
  if (isListHubTitle(item.title)) return false;
  if (!item.collection_id) return true;
  return !isListCollection(collectionsById.get(item.collection_id));
}

export function assignItem(
  item: FamilySourceItem,
  people: FamilyPerson[],
): { kind: 'person'; key: string } | { kind: 'household' } {
  const matches = matchingPeople(item.who_it_affects, people);
  if (matches.length === 1) return { kind: 'person', key: matches[0].key };
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

export function compareFamilyItems(a: FamilySourceItem, b: FamilySourceItem, today = new Date()): number {
  const da = daysUntil(a.event_date, today);
  const db = daysUntil(b.event_date, today);
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
  const when = humanizeEventDate(item.event_date, today);
  if (when) return when;
  const extra = (item.body || '').replace(/\s+/g, ' ').trim();
  if (extra) {
    const words = extra.split(' ').slice(0, 6).join(' ');
    return words;
  }
  return 'On your radar';
}

function toPreview(item: FamilySourceItem, today: Date): FamilyPreviewItem {
  return {
    id: item.id,
    title: item.title || 'Untitled',
    context: itemContextLine(item, today),
    category: item.category,
    storedIcon: item.icon,
    event_date: item.event_date,
  };
}

export function casualTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .toLowerCase();
}

export function fallbackWeeklySummary(name: string, titles: string[]): string {
  const first = name.trim() || 'They';
  const cleaned = titles.map(casualTitle).filter(Boolean);
  if (!cleaned.length) return `${first}'s week looks quiet so far.`;
  if (cleaned.length === 1) return `${first}'s week is mostly ${cleaned[0]}.`;
  return `${first}'s week is mostly ${cleaned[0]} and ${cleaned[1]}.`;
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
      title: item.title || 'Untitled',
      status: itemContextLine(item, today),
      category: item.category,
      storedIcon: item.icon,
      itemId: item.id,
    });
  }
  return tiles;
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
  const attributable = items.filter((item) => isAttributableItem(item, collectionsById));

  const byPerson = new Map<string, FamilySourceItem[]>();
  for (const person of people) byPerson.set(person.key, []);
  const householdItems: FamilySourceItem[] = [];

  for (const item of attributable) {
    const assigned = assignItem(item, people);
    if (assigned.kind === 'person') byPerson.get(assigned.key)?.push(item);
    else householdItems.push(item);
  }

  const buckets: PersonBucket[] = people.map((person) => {
    const personItems = byPerson.get(person.key) ?? [];
    const weekItems = personItems.filter((item) => isInCurrentWeek(item.event_date, today));
    const previewSource = pickPreviewItems(personItems, today);
    return {
      person,
      items: personItems,
      weekItems,
      preview: previewSource.map((item) => toPreview(item, today)),
      weekTitles: weekItems.map((item) => item.title || 'Untitled'),
    };
  });

  return {
    people,
    buckets,
    householdItems,
    householdTiles: buildHouseholdTiles(collections, counts, householdItems, today),
  };
}

export const householdPerson: FamilyPerson = {
  key: HOUSEHOLD_KEY,
  name: 'Household',
  initial: 'H',
  wash: 'paleBlue',
  role: 'household',
};
