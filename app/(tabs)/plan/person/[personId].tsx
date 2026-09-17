import { BrandIconDisc } from '@/components/app/BrandIcon';
import { PlanItemFeed, PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import {
  GENERAL_TODO_TITLE,
  listActiveCollections,
  organizeStandaloneItems,
  type CollectionRow,
} from '@/lib/collections';
import {
  buildFamilyPlan,
  HOUSEHOLD_KEY,
  YOURS_KEY,
  type FamilyMemberSource,
  type FamilySourceItem,
} from '@/lib/plan-family';
import { ITEM_COUNT_SELECT, mapPlanItemRow, PLAN_ITEM_SELECT, type PlanItemRow } from '@/lib/plan-item-map';
import { nestedListCount, isListHubTitle } from '@/lib/radar-organize';
import { compareRadarItems, radarStatusLine, type RadarItem } from '@/lib/radar';
import { resolvePlanIcon } from '@/lib/plan-icon';
import { viewerForUser, visibleFamilyMembersSelect, visibleItemsSelect } from '@/lib/item-visibility';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

type ItemCountRow = {
  id: string;
  title: string | null;
  collection_id: string | null;
  prep_children?: { status: string | null }[] | { status: string | null } | null;
};

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

export default function FamilyPersonScreen() {
  const { personId } = useLocalSearchParams<{ personId?: string }>();
  const key = Array.isArray(personId) ? personId[0] : personId;
  const [title, setTitle] = useState('Family');
  const [items, setItems] = useState<PlanItemCardModel[]>([]);
  const [householdTiles, setHouseholdTiles] = useState<ReturnType<typeof buildFamilyPlan>['householdTiles']>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !key) {
      setItems([]);
      setLoading(false);
      return;
    }

    await organizeStandaloneItems(user.id);
    const collections = await listActiveCollections(user.id);
    const ids = collections.map((row) => row.id);

    const viewer = await viewerForUser(user.id);
    const [{ data: profile }, { data: members }, { data: itemData }, countRes] = await Promise.all([
      supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle(),
      visibleFamilyMembersSelect('id, role, first_name, last_name', viewer),
      visibleItemsSelect(`${PLAN_ITEM_SELECT}, who_it_affects, source, collection_id, created_at, parent_id`, viewer).eq(
        'status',
        'open',
      ),
      ids.length
        ? visibleItemsSelect(ITEM_COUNT_SELECT, viewer)
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

    const today = new Date();
    const plan = buildFamilyPlan(
      (members as FamilyMemberSource[] | null) ?? [],
      (profile as { first_name: string | null } | null) ?? null,
      (itemData as FamilySourceItem[] | null) ?? [],
      collections,
      counts,
      today,
    );

    const rows = (itemData as (PlanItemRow & FamilySourceItem & RadarItem)[] | null) ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    if (key === HOUSEHOLD_KEY) {
      setTitle('Family');
      setHouseholdTiles(plan.householdTiles);
      const mapped = plan.householdItems
        .map((item) => byId.get(item.id))
        .filter((row): row is PlanItemRow & RadarItem => !!row)
        .sort((a, b) => compareRadarItems(a, b))
        .map((row) => ({
          ...mapPlanItemRow(row, today),
          context: radarStatusLine(row, today),
        }));
      setItems(mapped);
    } else if (key === YOURS_KEY) {
      setTitle('Yours');
      setHouseholdTiles([]);
      const mapped = plan.yoursItems
        .map((item) => byId.get(item.id))
        .filter((row): row is PlanItemRow & RadarItem => !!row)
        .sort((a, b) => compareRadarItems(a, b))
        .map((row) => ({
          ...mapPlanItemRow(row, today),
          context: radarStatusLine(row, today),
        }));
      setItems(mapped);
    } else {
      const bucket = plan.buckets.find((entry) => entry.person.key === key);
      setTitle(bucket?.person.name || 'Family');
      setHouseholdTiles([]);
      const mapped = (bucket?.items ?? [])
        .map((item) => byId.get(item.id))
        .filter((row): row is PlanItemRow & RadarItem => !!row)
        .sort((a, b) => compareRadarItems(a, b))
        .map((row) => ({
          ...mapPlanItemRow(row, today),
          context: radarStatusLine(row, today),
        }));
      setItems(mapped);
    }
    setLoading(false);
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <PlanStackHeader backLabel="Plan" />
      <View style={s.homeSectionHead}>
        <Text style={s.homeSectionLabel}>{title}</Text>
      </View>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <>
          {key === HOUSEHOLD_KEY && householdTiles.some((tile) => tile.collectionId) ? (
            <View style={s.homeHero}>
              {householdTiles
                .filter((tile) => tile.collectionId)
                .map((tile, index, list) => {
                  const icon = resolvePlanIcon({
                    title: tile.title,
                    category: tile.category,
                    collectionType: tile.collectionType,
                    stored: tile.storedIcon,
                  });
                  return (
                    <Pressable
                      key={tile.key}
                      style={[s.homeHeroRow, index === list.length - 1 && !items.length ? s.homeHeroRowLast : null]}
                      onPress={() =>
                        router.push({
                          pathname: '/plan/list/[collectionId]',
                          params: { collectionId: tile.collectionId as string },
                        })
                      }>
                      <View style={s.nrow}>
                        <BrandIconDisc name={icon.name} wash={icon.wash} size={36} />
                        <View style={s.ncopy}>
                          <Text style={s.homeItemTitle}>{tile.title}</Text>
                          <Text style={s.homeItemSub}>{tile.status}</Text>
                        </View>
                        <Text style={s.uchevron}>›</Text>
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          ) : null}
          <PlanItemFeed
            items={items}
            setItems={setItems}
            empty={
              key === HOUSEHOLD_KEY
                ? 'Nothing sitting with the family.'
                : key === YOURS_KEY
                  ? 'Nothing sitting with you just now.'
                  : `Nothing tagged to ${title} just now.`
            }
            variant="hero"
          />
        </>
      )}
    </ScrollView>
  );
}
