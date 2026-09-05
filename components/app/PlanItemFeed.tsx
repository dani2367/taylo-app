import { useChat } from '@/components/app/ChatProvider';
import { PlanItemCard, type PlanItemCardModel } from '@/components/app/PlanItemCard';
import { appStyles as s } from '@/components/app/styles';
import { thingsToSortLabel } from '@/lib/human-date';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export function PlanItemFeed({
  items,
  setItems,
  empty,
  onBecameEmpty,
  startExpanded = false,
  variant = 'card',
  maxVisible,
}: {
  items: PlanItemCardModel[];
  setItems: (update: (prev: PlanItemCardModel[]) => PlanItemCardModel[]) => void;
  empty: string;
  onBecameEmpty?: () => void;
  startExpanded?: boolean;
  variant?: 'card' | 'hero';
  maxVisible?: number;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const { openItem } = useChat();

  useEffect(() => {
    if (!startExpanded) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const card of items) {
        if (next[card.id] == null) next[card.id] = true;
      }
      return next;
    });
  }, [items, startExpanded]);

  function patchItem(itemId: string, update: (card: PlanItemCardModel) => PlanItemCardModel) {
    setItems((prev) => prev.map((card) => (card.id === itemId ? update(card) : card)));
  }

  async function setStatus(card: PlanItemCardModel, status: 'done' | 'delegated' | 'dismissed') {
    const remaining = items.filter((row) => row.id !== card.id);
    setItems(() => remaining);
    const { error } = await supabase.from('items').update({ status }).eq('id', card.id);
    if (error) {
      setItems((prev) => [...prev, card]);
      return;
    }
    if (remaining.length === 0) onBecameEmpty?.();
  }

  async function toggleChecklist(itemId: string, entryId: string, done: boolean) {
    const card = items.find((row) => row.id === itemId);
    if (card?.checklistRowsAreItems) {
      const remaining = card.checklist.filter((entry) => (entry.id === entryId ? !done : !entry.done));
      patchItem(itemId, (row) => ({
        ...row,
        checklist: row.checklist.filter((entry) => entry.id !== entryId || !done),
        prepLabel: remaining.length ? thingsToSortLabel(remaining.length) : null,
      }));
      const { error } = await supabase
        .from('items')
        .update({ status: done ? 'done' : 'open' })
        .eq('id', entryId);
      if (error) {
        patchItem(itemId, () => card);
        return;
      }
      if (remaining.length === 0) onBecameEmpty?.();
      return;
    }

    patchItem(itemId, (row) => {
      const checklist = row.checklist.map((entry) => (entry.id === entryId ? { ...entry, done } : entry));
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return { ...row, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
    });
    const { error } = await persistChecklistToggle(entryId, done);
    if (error) {
      patchItem(itemId, (row) => {
        const checklist = row.checklist.map((entry) => (entry.id === entryId ? { ...entry, done: !done } : entry));
        const incomplete = checklist.filter((entry) => !entry.done).length;
        return { ...row, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
      });
      return;
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
    if (card.checklistRowsAreItems && card.collectionId) {
      const { data: created, error } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          collection_id: card.collectionId,
          title: 'New',
          body: null,
          detail: null,
          category: 'errand',
          source: 'manual',
          source_label: 'Added by you',
          status: 'open',
          urgency_level: 'none',
          action_description: 'New',
        })
        .select('id, title')
        .single();
      if (error || !created) return;
      patchItem(card.id, (row) => ({
        ...row,
        checklist: [...row.checklist, { id: created.id as string, text: (created.title as string) || 'New', done: false }],
      }));
      return;
    }
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
    const card = items.find((row) => row.id === itemId);
    const snapshot = card?.checklist ?? [];
    patchItem(itemId, (row) => {
      const checklist = row.checklist.filter((entry) => entry.id !== entryId);
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return { ...row, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
    });
    if (card?.checklistRowsAreItems) {
      const { error } = await supabase.from('items').update({ status: 'dismissed' }).eq('id', entryId);
      if (error) {
        patchItem(itemId, () => ({ ...card, checklist: snapshot }));
      } else if (snapshot.length <= 1) {
        onBecameEmpty?.();
      }
      return;
    }
    const { error } = await persistChecklistDelete(entryId);
    if (error) {
      patchItem(itemId, (row) => {
        const incomplete = snapshot.filter((entry) => !entry.done).length;
        return { ...row, checklist: snapshot, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
      });
    }
  }

  async function commitChecklistText(card: PlanItemCardModel, entryId: string, text: string) {
    if (card.checklistRowsAreItems) {
      await supabase.from('items').update({ title: text }).eq('id', entryId);
      return;
    }
    await persistChecklistText(entryId, text);
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

  if (items.length === 0) {
    if (variant === 'hero') {
      return (
        <View style={s.homeHero}>
          <View style={[s.homeHeroRow, s.homeHeroRowLast]}>
            <Text style={s.emptyStateText}>{empty}</Text>
          </View>
        </View>
      );
    }
    return <Text style={s.planEmptyLine}>{empty}</Text>;
  }

  const shown = maxVisible ? items.slice(0, maxVisible) : items;

  const list = shown.map((card, index) => (
    <PlanItemCard
      key={card.id}
      card={card}
      variant={variant}
      last={index === shown.length - 1}
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
      onCommitChecklistText={(id, text) => void commitChecklistText(card, id, text)}
      onAddChecklist={() => void addChecklistRow(card)}
      onDeleteChecklist={(id) => void removeChecklistRow(card.id, id)}
    />
  ));

  if (variant === 'hero') {
    return <View style={s.homeHero}>{list}</View>;
  }

  return <View>{list}</View>;
}

export function PlanStackHeader({ title, backLabel }: { title?: string; backLabel: string }) {
  return (
    <>
      <Pressable style={s.planBack} onPress={() => router.back()}>
        <Text style={s.planBackText}>‹ {backLabel}</Text>
      </Pressable>
      {title ? <Text style={s.planCollectionTitle}>{title}</Text> : null}
    </>
  );
}
