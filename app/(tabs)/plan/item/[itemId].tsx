import { PlanItemFeed, PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { mapPlanItemRow, PLAN_ITEM_SELECT, type PlanItemRow } from '@/lib/plan-item-map';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

export default function PlanItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const [items, setItems] = useState<PlanItemCardModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!itemId) return;
    const { data, error } = await supabase.from('items').select(PLAN_ITEM_SELECT).eq('id', itemId).maybeSingle();
    if (error) console.error('Failed to load item:', error.message);
    const today = new Date();
    const row = data as PlanItemRow | null;
    setItems(row ? [mapPlanItemRow(row, today)] : []);
    setLoading(false);
  }, [itemId]);

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
          empty="This is no longer on your plan."
          onBecameEmpty={() => router.back()}
          startExpanded
          variant="hero"
        />
      )}
    </ScrollView>
  );
}
