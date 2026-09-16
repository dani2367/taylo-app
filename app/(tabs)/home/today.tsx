import { PlanItemFeed, PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { isActiveCollection } from '@/lib/collections';
import { PLAN_ITEM_SELECT, mapPlanItemRow, type PlanItemRow } from '@/lib/plan-item-map';
import { viewerForUser, visibleItemsSelect } from '@/lib/item-visibility';
import {
  HOME_OVERFLOW_RANK_BASE,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  orderHomeSpotlightQueue,
  type HomeSurfaced,
} from '@/lib/placement';
import { latestSpotlightRows, refreshSpotlight } from '@/lib/spotlight';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

type SpotlightRow = {
  item_id: string | null;
  reason_text: string | null;
  rank: number | null;
  generated_at?: string | null;
};

export default function TodaysActionsScreen() {
  const [items, setItems] = useState<PlanItemCardModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    await refreshSpotlight();

    const today = new Date();
    const viewer = await viewerForUser(user.id);
    const [{ data: spotlightData }, { data: itemData }] = await Promise.all([
      supabase
        .from('home_spotlight')
        .select('item_id, reason_text, rank, generated_at')
        .eq('user_id', user.id)
        .order('rank', { ascending: true }),
      visibleItemsSelect(`${PLAN_ITEM_SELECT}, collection_id, created_at, source, parent_id, collections(status)`, viewer)
        .eq('status', 'open')
        .in('kind', [...HOME_RADAR_LOAD_KINDS]),
    ]);

    const spotlightRows = latestSpotlightRows((spotlightData as SpotlightRow[] | null) ?? []);
    const generatedAt = spotlightRows[0]?.generated_at ? new Date(spotlightRows[0].generated_at) : null;
    const previouslySurfaced: HomeSurfaced[] =
      generatedAt && today.getTime() - generatedAt.getTime() < HOME_SURFACED_COOLDOWN_MS
        ? spotlightRows
            .filter((row): row is SpotlightRow & { item_id: string } => !!row.item_id && (row.rank ?? 0) < HOME_OVERFLOW_RANK_BASE)
            .map((row) => ({ id: row.item_id, at: generatedAt }))
        : [];
    const reasonById = new Map(spotlightRows.map((row) => [row.item_id || '', row.reason_text || '']));

    const openItems = (
      (itemData as (PlanItemRow & {
        collections?: { status?: string | null } | { status?: string | null }[] | null;
      })[] | null) ?? []
    ).filter((item) => isActiveCollection(item.collections));

    const { overflow } = orderHomeSpotlightQueue(openItems, { today, previouslySurfaced });
    const rows = overflow.map((card) => {
      const mapped = mapPlanItemRow(card.item, today);
      const reason = (reasonById.get(card.item.id) || '').trim();
      return reason ? { ...mapped, context: reason } : mapped;
    });
    setItems(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <PlanStackHeader backLabel="Home" />
      <View style={s.homeSectionHead}>
        <Text style={s.homeSectionLabel}>Today's actions</Text>
      </View>
      <Text style={s.homeSectionHint}>
        {items.length ? `${items.length} more that would be helpful to do.` : 'Nothing else waiting on Home.'}
      </Text>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <PlanItemFeed
          items={items}
          setItems={setItems}
          empty="Everything that belongs on Home is already on the list."
          variant="hero"
        />
      )}
    </ScrollView>
  );
}
