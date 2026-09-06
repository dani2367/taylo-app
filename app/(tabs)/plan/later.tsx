import { PlanItemFeed, PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { mapPlanItemRow, PLAN_ITEM_SELECT, type PlanItemRow } from '@/lib/plan-item-map';
import { isRadarEligible } from '@/lib/radar-organize';
import { compareRadarItems, radarStatusLine, type RadarItem } from '@/lib/radar';
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

    const { data, error } = await supabase
      .from('items')
      .select(`${PLAN_ITEM_SELECT}, collection_id, created_at, source`)
      .eq('user_id', user.id)
      .eq('status', 'open');

    if (error) {
      console.error('Failed to load radar items:', error.message);
      setLoading(false);
      return;
    }

    const today = new Date();
    const rows = ((data as (PlanItemRow & RadarItem & { source: string | null })[] | null) ?? [])
      .filter((row) => isRadarEligible(row))
      .sort((a, b) => compareRadarItems(a, b, today));
    setItems(
      rows.map((row) => ({
        ...mapPlanItemRow(row, today),
        context: radarStatusLine(row, today),
      })),
    );
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
      <View style={s.homeSectionHead}>
        <Text style={s.homeSectionLabel}>Keeping an eye on</Text>
      </View>
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
        />
      )}
    </ScrollView>
  );
}
