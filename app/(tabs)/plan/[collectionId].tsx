import { BrandIconDisc } from '@/components/app/BrandIcon';
import { useChat } from '@/components/app/ChatProvider';
import { PlanItemCard, type PlanItemCardModel } from '@/components/app/PlanItemCard';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { planContextLine, thingsToSortLabel } from '@/lib/human-date';
import { resolvePlanIcon } from '@/lib/plan-icon';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { helpfulSuggestion } from '@/lib/suggestion';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

type NestedEntry = { id: string; text: string; done: boolean; sort_order: number };
type NestedList = { id: string; item_id: string; checklist_items: NestedEntry[] | null };

type ItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  category: string | null;
  icon: string | null;
  action_description: string | null;
  event_date: string | null;
  urgency_level: string | null;
  source_label: string | null;
  source_email_subject: string | null;
  checklists: NestedList[] | NestedList | null;
};

type CollectionRow = {
  id: string;
  title: string | null;
  emoji: string | null;
  type: string | null;
};

function unwrapLists(raw: NestedList[] | NestedList | null): NestedList[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function mapItem(row: ItemRow, today: Date): PlanItemCardModel {
  const lists = unwrapLists(row.checklists);
  const list = lists[0];
  const entries = [...(list?.checklist_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => ({ id: entry.id, text: entry.text, done: entry.done }));
  const title = row.title || 'Untitled';
  const body = row.body || '';
  const detail = row.detail || row.action_description || '';
  const incomplete = entries.filter((entry) => !entry.done).length;
  return {
    id: row.id,
    title,
    context: planContextLine(
      { event_date: row.event_date, body: row.body, urgency_level: row.urgency_level },
      today,
    ),
    detail,
    suggestion: helpfulSuggestion(row),
    opener: row.action_description || detail || body || title,
    src: row.source_label || row.source_email_subject || 'Plan',
    icon: resolvePlanIcon({ title, category: row.category, stored: row.icon }),
    prepLabel: incomplete ? thingsToSortLabel(incomplete) : null,
    checklistId: list?.id ?? null,
    checklist: entries,
  };
}

export default function CollectionScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const [collection, setCollection] = useState<CollectionRow | null>(null);
  const [items, setItems] = useState<PlanItemCardModel[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { openItem } = useChat();

  const load = useCallback(async () => {
    if (!collectionId) return;
    const [{ data: col }, { data: rows, error }] = await Promise.all([
      supabase
        .from('collections')
        .select('id, title, emoji, type')
        .eq('id', collectionId)
        .maybeSingle(),
      supabase
        .from('items')
        .select(
          'id, title, body, detail, suggestion, category, icon, action_description, event_date, urgency_level, source_label, source_email_subject, checklists(id, item_id, checklist_items(id, text, done, sort_order))',
        )
        .eq('collection_id', collectionId)
        .eq('status', 'open')
        .order('created_at', { ascending: true }),
    ]);

    if (error) console.error('Failed to load collection:', error.message);
    setCollection((col as CollectionRow | null) ?? null);
    const today = new Date();
    setItems(((rows as ItemRow[] | null) ?? []).map((row) => mapItem(row, today)));
    setLoading(false);
  }, [collectionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function patchItem(itemId: string, update: (card: PlanItemCardModel) => PlanItemCardModel) {
    setItems((prev) => prev.map((card) => (card.id === itemId ? update(card) : card)));
  }

  async function setStatus(card: PlanItemCardModel, status: 'done' | 'delegated' | 'dismissed') {
    const remaining = items.filter((row) => row.id !== card.id);
    setItems(remaining);
    const { error } = await supabase.from('items').update({ status }).eq('id', card.id);
    if (error) {
      setItems((prev) => [...prev, card]);
      return;
    }
    if (remaining.length === 0) router.back();
  }

  async function toggleChecklist(itemId: string, entryId: string, done: boolean) {
    patchItem(itemId, (card) => {
      const checklist = card.checklist.map((entry) => (entry.id === entryId ? { ...entry, done } : entry));
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return { ...card, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
    });
    const { error } = await persistChecklistToggle(entryId, done);
    if (error) {
      patchItem(itemId, (card) => {
        const checklist = card.checklist.map((entry) => (entry.id === entryId ? { ...entry, done: !done } : entry));
        const incomplete = checklist.filter((entry) => !entry.done).length;
        return { ...card, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
      });
    }
  }

  function renameChecklist(itemId: string, entryId: string, text: string) {
    patchItem(itemId, (card) => ({
      ...card,
      checklist: card.checklist.map((entry) => (entry.id === entryId ? { ...entry, text } : entry)),
    }));
  }

  async function addChecklistRow(card: PlanItemCardModel) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const result = await persistChecklistAdd({
      userId: user.id,
      itemId: card.id,
      itemTitle: card.title,
      checklistId: card.checklistId,
      nextOrder: card.checklist.length,
    });
    if ('error' in result) return;
    patchItem(card.id, (row) => {
      const checklist = [...row.checklist, result.entry];
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return {
        ...row,
        checklistId: result.checklistId,
        checklist,
        prepLabel: incomplete ? thingsToSortLabel(incomplete) : null,
      };
    });
  }

  async function removeChecklistRow(itemId: string, entryId: string) {
    const snapshot = items.find((card) => card.id === itemId)?.checklist ?? [];
    patchItem(itemId, (card) => {
      const checklist = card.checklist.filter((entry) => entry.id !== entryId);
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return { ...card, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
    });
    const { error } = await persistChecklistDelete(entryId);
    if (error) {
      patchItem(itemId, (card) => {
        const incomplete = snapshot.filter((entry) => !entry.done).length;
        return { ...card, checklist: snapshot, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
      });
    }
  }

  async function onChat(card: PlanItemCardModel) {
    await openItem(card.id, {
      icon: card.icon.name,
      title: card.title,
      sub: card.src,
      opener: card.opener,
      chips: [],
      generateOpener: true,
    });
    router.push('/chat');
  }

  const icon = resolvePlanIcon({
    title: collection?.title,
    collectionType: collection?.type,
    stored: collection?.emoji,
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <Pressable style={s.planBack} onPress={() => router.back()}>
        <Text style={s.planBackText}>‹ Plan</Text>
      </Pressable>
      <View style={[s.planBack, { paddingTop: 4 }]}>
        <BrandIconDisc name={icon.name} wash={icon.wash} size={32} />
        <Text style={[s.planCollectionTitle, { paddingHorizontal: 0, paddingBottom: 0, flex: 1 }]}>
          {collection?.title || 'Collection'}
        </Text>
      </View>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : items.length === 0 ? (
        <Text style={s.planEmptyLine}>Nothing left on this list.</Text>
      ) : (
        items.map((card) => (
          <PlanItemCard
            key={card.id}
            card={card}
            expanded={!!expanded[card.id]}
            editingPrep={!!editingPrep[card.id]}
            onToggleExpand={() => setExpanded((p) => ({ ...p, [card.id]: !p[card.id] }))}
            onDismiss={() => void setStatus(card, 'dismissed')}
            onDone={() => void setStatus(card, 'done')}
            onDelegate={() => void setStatus(card, 'delegated')}
            onChat={() => void onChat(card)}
            onTogglePrepEditing={() => setEditingPrep((p) => ({ ...p, [card.id]: !p[card.id] }))}
            onToggleChecklist={(id, done) => void toggleChecklist(card.id, id, done)}
            onChangeChecklistText={(id, text) => renameChecklist(card.id, id, text)}
            onCommitChecklistText={(id, text) => void persistChecklistText(id, text)}
            onAddChecklist={() => void addChecklistRow(card)}
            onDeleteChecklist={(id) => void removeChecklistRow(card.id, id)}
          />
        ))
      )}
    </ScrollView>
  );
}
