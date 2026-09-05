import { AgendaItemRow } from '@/components/app/PlanSchedule';
import { PlanStackHeader } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { bucketAgenda, mapAgendaRow, type AgendaRow, type ScheduleSourceItem } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

export default function ScheduleMonthScreen() {
  const { selected } = useLocalSearchParams<{ selected?: string }>();
  const [items, setItems] = useState<AgendaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = new Date();
    const selectedYmd =
      typeof selected === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(selected)
        ? selected
        : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
      .select('id, title, body, category, icon, event_date, who_it_affects, source')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .neq('source', 'calendar')
      .not('event_date', 'is', null);

    if (error) console.error('Failed to load month items:', error.message);
    const rows = ((data as ScheduleSourceItem[] | null) ?? [])
      .map((item) => mapAgendaRow(item, today))
      .filter((item): item is AgendaRow => !!item);
    setItems(bucketAgenda(rows, selectedYmd, today).laterThisMonth);
    setLoading(false);
  }, [selected]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <PlanStackHeader backLabel="Plan" />
      <View style={s.homeSectionHead}>
        <Text style={s.homeSectionLabel}>Later this month</Text>
      </View>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <View style={s.homeHero}>
          {items.length ? (
            items.map((item, index) => (
              <AgendaItemRow key={item.id} item={item} when="date" last={index === items.length - 1} />
            ))
          ) : (
            <View style={[s.homeHeroRow, s.homeHeroRowLast]}>
              <Text style={s.emptyStateText}>Nothing else this month.</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
