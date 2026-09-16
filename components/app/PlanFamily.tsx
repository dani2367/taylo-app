import { BrandIconDisc } from '@/components/app/BrandIcon';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import {
  GENERAL_TODO_TITLE,
  listActiveCollections,
  organizeStandaloneItems,
  type CollectionRow,
} from '@/lib/collections';
import { cachedFamilyWeek, localFamilyWeekSummaries, refreshFamilyWeek } from '@/lib/family-week';
import {
  buildFamilyPlan,
  HOUSEHOLD_KEY,
  YOURS_KEY,
  householdPerson,
  yoursPerson,
  weekFingerprint,
  weekStartYmd,
  type FamilyMemberSource,
  type FamilyPlan,
  type FamilySourceItem,
  type HouseholdTile,
  type PersonBucket,
} from '@/lib/plan-family';
import { resolvePlanIcon, washColor, type Wash } from '@/lib/plan-icon';
import { ITEM_COUNT_SELECT } from '@/lib/plan-item-map';
import { nestedListCount, isListHubTitle } from '@/lib/radar-organize';
import { viewerForUser, visibleFamilyMembersSelect, visibleItemsSelect } from '@/lib/item-visibility';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

type ItemCountRow = {
  id: string;
  title: string | null;
  collection_id: string | null;
  prep_children?: { status: string | null }[] | { status: string | null } | null;
};

const SELECT =
  'id, title, body, category, icon, event_date, due_at, occurs_at, kind, confidence, surface_from, surface_until, who_it_affects, source, collection_id, created_at, parent_id, status, parent:items!parent_id(id, title, occurs_at, event_date)';

function listCount(members: ItemCountRow[], collectionTitle: string): number {
  if (collectionTitle === GENERAL_TODO_TITLE) {
    return members.filter((row) => !isListHubTitle(row.title)).length;
  }
  let n = 0;
  for (const row of members) {
    const openPrep = nestedListCount(row.prep_children);
    n += openPrep;
  }
  return n;
}

function InitialsAvatar({
  name,
  initial,
  wash,
  size = 48,
  selected,
}: {
  name: string;
  initial: string;
  wash: string;
  size?: number;
  selected?: boolean;
}) {
  return (
    <View
      style={[
        s.familyAvatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: washColor[(wash as Wash) || 'blush'] },
        selected && s.familyAvatarOn,
      ]}
      accessibilityLabel={name}>
      <Text style={[s.familyAvatarText, { fontSize: Math.round(size * 0.38) }]}>{initial}</Text>
    </View>
  );
}

function PersonCard({
  bucket,
  summary,
  selected,
  onSelect,
}: {
  bucket: PersonBucket;
  summary: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { person } = bucket;
  return (
    <View style={s.familyCard}>
      <Pressable style={s.familyCardHead} onPress={onSelect}>
        <InitialsAvatar name={person.name} initial={person.initial} wash={person.wash} size={40} selected={selected} />
        <View style={s.familyCardHeadCopy}>
          <Text style={s.familyCardName}>{person.name}</Text>
          <Text style={s.familyCardSummary}>{summary}</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/plan/person/[personId]', params: { personId: person.key } })}
          hitSlop={8}>
          <Text style={s.homeSeeAll}>View all</Text>
        </Pressable>
      </Pressable>
      {selected ? (
        <View style={s.familyNested}>
          {bucket.preview.length ? (
            bucket.preview.map((item, index) => {
              const icon = resolvePlanIcon({ title: item.title, category: item.category, stored: item.storedIcon });
              return (
                <Pressable
                  key={item.id}
                  style={[s.familyItemRow, index === bucket.preview.length - 1 && s.familyItemRowLast]}
                  onPress={() => router.push({ pathname: '/plan/item/[itemId]', params: { itemId: item.id } })}>
                  {item.informational ? (
                    <View style={s.familyInfoDot} />
                  ) : (
                    <BrandIconDisc name={icon.name} wash={icon.wash} size={36} />
                  )}
                  <View style={s.ncopy}>
                    <Text
                      style={item.informational ? s.familyInfoTitle : s.homeItemTitle}
                      numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={s.homeItemSub} numberOfLines={1}>
                      {item.context}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={s.familyEmptyLine}>Nothing tagged to {person.name} just now.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function HouseholdCard({
  tiles,
  selected,
  onSelect,
  person,
  summary,
  empty,
}: {
  tiles: HouseholdTile[];
  selected: boolean;
  onSelect: () => void;
  person: typeof householdPerson;
  summary: string;
  empty: string;
}) {
  return (
    <View style={s.familyCard}>
      <Pressable style={s.familyCardHead} onPress={onSelect}>
        <InitialsAvatar name={person.name} initial={person.initial} wash={person.wash} size={40} selected={selected} />
        <View style={s.familyCardHeadCopy}>
          <Text style={s.familyCardName}>{person.name}</Text>
          <Text style={s.familyCardSummary}>{summary}</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/plan/person/[personId]', params: { personId: person.key } })}
          hitSlop={8}>
          <Text style={s.homeSeeAll}>View all</Text>
        </Pressable>
      </Pressable>
      {selected ? (
        <View style={s.familyNested}>
          {tiles.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.familyHouseholdRow}
              nestedScrollEnabled>
              {tiles.map((tile) => {
                const icon = resolvePlanIcon({
                  title: tile.title,
                  category: tile.category,
                  collectionType: tile.collectionType,
                  stored: tile.storedIcon,
                });
                return (
                  <Pressable
                    key={tile.key}
                    style={s.familyHouseholdTile}
                    onPress={() => {
                      if (tile.kind === 'collection' && tile.collectionId) {
                        router.push({
                          pathname: '/plan/list/[collectionId]',
                          params: { collectionId: tile.collectionId },
                        });
                        return;
                      }
                      if (tile.itemId) {
                        router.push({ pathname: '/plan/item/[itemId]', params: { itemId: tile.itemId } });
                      }
                    }}>
                    <BrandIconDisc name={icon.name} wash={icon.wash} size={36} />
                    <Text style={s.familyHouseholdTitle} numberOfLines={2}>
                      {tile.title}
                    </Text>
                    <Text style={s.familyHouseholdStatus} numberOfLines={1}>
                      {tile.status}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={s.familyEmptyLine}>{empty}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function PlanFamily({ focusPerson }: { focusPerson?: string | null } = {}) {
  const [plan, setPlan] = useState<FamilyPlan | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(focusPerson || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (focusPerson) setFocus(focusPerson);
  }, [focusPerson]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPlan(null);
      setLoading(false);
      return;
    }

    await organizeStandaloneItems(user.id);

    const viewer = await viewerForUser(user.id);
    const collections = await listActiveCollections(user.id);
    const ids = collections.map((row) => row.id);
    const [{ data: profile }, { data: members }, { data: itemData }, countRes] = await Promise.all([
      supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle(),
      visibleFamilyMembersSelect('id, role, first_name, last_name', viewer),
      visibleItemsSelect(SELECT, viewer).eq('status', 'open'),
      ids.length
        ? supabase
            .from('items')
            .select(ITEM_COUNT_SELECT)
            .eq('user_id', user.id)
            .eq('status', 'open')
            .is('parent_id', null)
            .in('collection_id', ids)
        : Promise.resolve({ data: [] as ItemCountRow[] }),
    ]);

    const countRows = (countRes.data as ItemCountRow[] | null) ?? [];
    const byCollection = new Map<string, ItemCountRow[]>();
    for (const row of countRows) {
      if (!row.collection_id) continue;
      const list = byCollection.get(row.collection_id) ?? [];
      list.push(row);
      byCollection.set(row.collection_id, list);
    }
    const counts = new Map<string, number>();
    for (const collection of collections as CollectionRow[]) {
      counts.set(collection.id, listCount(byCollection.get(collection.id) ?? [], collection.title));
    }

    const next = buildFamilyPlan(
      (members as FamilyMemberSource[] | null) ?? [],
      (profile as { first_name: string | null } | null) ?? null,
      (itemData as FamilySourceItem[] | null) ?? [],
      collections,
      counts,
    );
    setPlan(next);

    const weekStart = weekStartYmd();
    const people = next.buckets.map((bucket) => ({
      id: bucket.person.key,
      name: bucket.person.name,
      titles: bucket.weekTitles,
    }));
    const fingerprint = weekFingerprint(
      weekStart,
      people.map((person) => ({ id: person.id, titles: person.titles })),
    );
    setSummaries(cachedFamilyWeek(fingerprint) || localFamilyWeekSummaries(people));
    setLoading(false);

    const { summaries: fresh } = await refreshFamilyWeek(weekStart, people);
    setSummaries(fresh);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={s.emptyState}>
        <ActivityIndicator color={colors.rose} />
      </View>
    );
  }

  if (!plan || (!plan.people.length && !plan.householdTiles.length && !plan.yoursTiles.length)) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyStateText}>Add your family in More and I’ll sort who needs what.</Text>
      </View>
    );
  }

  const strip = [...plan.people, householdPerson, yoursPerson];
  function toggleFocus(key: string) {
    setFocus((prev) => (prev === key ? null : key));
  }

  const visibleBuckets = !focus
    ? plan.buckets
    : focus === HOUSEHOLD_KEY || focus === YOURS_KEY
      ? []
      : plan.buckets.filter((bucket) => bucket.person.key === focus);
  const showHousehold = !focus || focus === HOUSEHOLD_KEY;
  const showYours = !focus || focus === YOURS_KEY;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.familyStripScroll}
        contentContainerStyle={s.familyStrip}
        nestedScrollEnabled>
        {strip.map((person) => {
          const selected = focus === person.key;
          return (
            <Pressable
              key={person.key}
              style={s.familyStripItem}
              onPress={() => toggleFocus(person.key)}
              accessibilityRole="button"
              accessibilityLabel={person.name}>
              <InitialsAvatar
                name={person.name}
                initial={person.initial}
                wash={person.wash}
                selected={selected}
              />
              <Text style={[s.familyStripName, selected && s.familyStripNameOn]} numberOfLines={1}>
                {person.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {visibleBuckets.map((bucket) => (
        <PersonCard
          key={bucket.person.key}
          bucket={bucket}
          selected={focus === bucket.person.key}
          onSelect={() => toggleFocus(bucket.person.key)}
          summary={
            summaries[bucket.person.key] ||
            localFamilyWeekSummaries([
              { id: bucket.person.key, name: bucket.person.name, titles: bucket.weekTitles },
            ])[bucket.person.key]
          }
        />
      ))}
      {showHousehold ? (
        <HouseholdCard
          tiles={plan.householdTiles}
          selected={focus === HOUSEHOLD_KEY}
          onSelect={() => toggleFocus(HOUSEHOLD_KEY)}
          person={householdPerson}
          summary="Shared lists and things that are for everyone."
          empty="Nothing sitting with the family just now."
        />
      ) : null}
      {showYours ? (
        <HouseholdCard
          tiles={plan.yoursTiles}
          selected={focus === YOURS_KEY}
          onSelect={() => toggleFocus(YOURS_KEY)}
          person={yoursPerson}
          summary="Your jobs that aren't tagged to someone in the family."
          empty="Nothing sitting with you just now."
        />
      ) : null}
    </>
  );
}
