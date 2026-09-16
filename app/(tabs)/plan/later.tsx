import { PlanItemFeed, PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { PLAN_ITEM_SELECT, mapRadarWatchCard, type PlanItemRow } from '@/lib/plan-item-map';
import { exceptHomeActions, HOME_RADAR_LOAD_KINDS, selectHomeActions, selectRadarWatch } from '@/lib/placement';
import { viewerForUser, visibleItemsSelect } from '@/lib/item-visibility';
import type { RadarItem } from '@/lib/radar';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

export default function LaterRadarScreen() {
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

    const viewer = await viewerForUser(user.id);
    const { data, error } = await visibleItemsSelect(
      `${PLAN_ITEM_SELECT}, collection_id, created_at, source, parent_id`,
      viewer,
    )
      .eq('status', 'open')
      .in('kind', [...HOME_RADAR_LOAD_KINDS]);

    if (error) {
      console.error('Failed to load radar items:', error.message);
      setLoading(false);
      return;
    }

    const today = new Date();
    const all = (data as (PlanItemRow & RadarItem)[] | null) ?? [];
    const home = selectHomeActions(all, { today });
    const rows = exceptHomeActions(selectRadarWatch(all, today), home);
    setItems(rows.map((card) => mapRadarWatchCard(card, today)));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <PlanStackHeader backLabel="Plan" />
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <PlanItemFeed
          items={items}
          setItems={setItems}
          empty="Nothing waiting on the radar."
          variant="hero"
          header={
            <View style={s.homeCardHead}>
              <Text style={s.homeSectionLabel}>Keeping an eye on</Text>
            </View>
          }
        />
      )}
    </ScrollView>
  );
}
