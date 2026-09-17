import { BrandIconDisc } from '@/components/app/BrandIcon';
import { PlanItemFeed } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { GENERAL_TODO_TITLE } from '@/lib/collections';
import { isHouseholdList } from '@/lib/item-visibility';
import { mapPlanItemRow, PLAN_ITEM_SELECT, type PlanItemRow } from '@/lib/plan-item-map';
import { resolvePlanIcon } from '@/lib/plan-icon';
import { isListHubTitle } from '@/lib/radar-organize';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

function sameTitle(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function CollectionScreen() {
  const raw = useLocalSearchParams<{ collectionId: string | string[] }>().collectionId;
  const collectionId = Array.isArray(raw) ? raw[0] : raw;
  const [title, setTitle] = useState('List');
  const [iconName, setIconName] = useState(resolvePlanIcon({}));
  const [items, setItems] = useState<PlanItemCardModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!collectionId) return;
    const [{ data: col }, { data: rows, error }] = await Promise.all([
      supabase.from('collections').select('id, title, emoji, type, visibility, user_id').eq('id', collectionId).maybeSingle(),
      supabase
        .from('items')
        .select(PLAN_ITEM_SELECT)
        .eq('collection_id', collectionId)
        .eq('status', 'open')
        .is('parent_id', null)
        .order('created_at', { ascending: true }),
    ]);

    if (error) console.error('Failed to load list:', error.message);
    const meta = col as {
      title: string | null;
      emoji: string | null;
      type: string | null;
      visibility?: string | null;
      user_id?: string | null;
    } | null;
    const listTitle = meta?.title || 'List';
    const listVisibility = meta?.visibility === 'shared' || isHouseholdList(meta?.type, listTitle) ? 'shared' : 'private';
    setTitle(listTitle);
    setIconName(resolvePlanIcon({ title: meta?.title, collectionType: meta?.type, stored: meta?.emoji }));
    const today = new Date();
    const mapped = ((rows as PlanItemRow[] | null) ?? []).map((row) => mapPlanItemRow(row, today));
    const members = mapped.filter((card) => !isListHubTitle(card.title));
    const isTodoList = listTitle === GENERAL_TODO_TITLE || meta?.type === 'todo';

    if (isTodoList) {
      setItems([
        {
          id: collectionId,
          collectionId,
          collectionType: meta?.type,
          title: listTitle,
          context: null,
          detail: '',
          suggestion: null,
          opener: listTitle,
          src: 'Plan',
          icon: resolvePlanIcon({ title: listTitle, collectionType: meta?.type, stored: meta?.emoji }),
          prepLabel: null,
          checklistId: null,
          checklist: members.map((card) => ({ id: card.id, text: card.title, done: false })),
          listMode: true,
          hideTitle: true,
          checklistRowsAreItems: true,
          createdBy: meta?.user_id ?? null,
          visibility: listVisibility,
        },
      ]);
    } else {
      const hideEveryTitle = meta?.type === 'shopping' || mapped.length === 1;
      setItems(
        mapped.map((card) => ({
          ...card,
          collectionId,
          collectionType: meta?.type,
          listMode: true,
          context: null,
          detail: '',
          suggestion: null,
          hideTitle: hideEveryTitle || sameTitle(card.title, listTitle),
          checklistHeading: meta?.type === 'shopping' ? 'To pick up' : undefined,
          checklistRowsAreItems: meta?.type === 'shopping',
          visibility: listVisibility,
          createdBy: card.createdBy || meta?.user_id || null,
        })),
      );
    }
    setLoading(false);
  }, [collectionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <Pressable style={s.planBack} onPress={() => router.back()}>
        <Text style={s.planBackText}>‹ Plan</Text>
      </Pressable>
      <View style={[s.planBack, { paddingTop: 4 }]}>
        <BrandIconDisc name={iconName.name} wash={iconName.wash} size={32} />
        <Text style={[s.planCollectionTitle, { paddingHorizontal: 0, paddingBottom: 0, flex: 1 }]}>{title}</Text>
      </View>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        <PlanItemFeed
          items={items}
          setItems={setItems}
          empty="Nothing left on this list."
          onBecameEmpty={() => router.back()}
          startExpanded
        />
      )}
    </ScrollView>
  );
}
