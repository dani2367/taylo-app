import { useChat } from '@/components/app/ChatProvider';
import { PlanItemCard, type PlanItemCardModel } from '@/components/app/PlanItemCard';
import { appStyles as s } from '@/components/app/styles';
import { thingsToSortLabel } from '@/lib/human-date';
import { closeItems } from '@/lib/item-status';
import { retireEmptyCollections } from '@/lib/collections';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { isHouseholdList, persistItemVisibility, persistListVisibility } from '@/lib/item-visibility';
import { extraEventContext } from '@/lib/suggestion';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function PlanItemFeed({
  items,
  setItems,
  empty,
  onBecameEmpty,
  startExpanded = false,
  variant = 'card',
  maxVisible,
  header,
}: {
  items: PlanItemCardModel[];
  setItems: (update: (prev: PlanItemCardModel[]) => PlanItemCardModel[]) => void;
  empty: string;
  onBecameEmpty?: () => void;
  startExpanded?: boolean;
  variant?: 'card' | 'hero';
  maxVisible?: number;
  header?: ReactNode;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const { openItem } = useChat();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

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
    const extraIds = card.checklist.map((entry) => entry.id);
    const { error } = await closeItems([card.id, ...extraIds], status);
    if (error) {
      setItems((prev) => [...prev, card]);
      return;
    }
    await retireListIfEmpty(card, []);
    if (!card.listMode && remaining.length === 0) onBecameEmpty?.();
  }

  async function toggleShare(card: PlanItemCardModel) {
    const next = card.visibility === 'shared' ? 'private' : 'shared';
    const patchFeed = (visibility: 'private' | 'shared') => {
      if (card.listMode && card.collectionId) {
        setItems((prev) =>
          prev.map((row) => (row.collectionId === card.collectionId ? { ...row, visibility } : row)),
        );
        return;
      }
      patchItem(card.id, (row) => ({ ...row, visibility }));
    };
    patchFeed(next);
    const { error } =
      card.listMode && card.collectionId
        ? await persistListVisibility(
            card.collectionId,
            next,
            !isHouseholdList(card.collectionType, card.title),
          )
        : await persistItemVisibility(card.id, next);
    if (error) patchFeed(card.visibility === 'shared' ? 'shared' : 'private');
  }

  async function retireListIfEmpty(card: PlanItemCardModel, remainingChecklist: { id: string }[]) {
    if (!card.listMode || remainingChecklist.length > 0) return;
    const isSynthetic = !!card.collectionId && card.id === card.collectionId;
    if (!isSynthetic) {
      await closeItems([card.id], 'done');
    }
    setItems((prev) => prev.filter((row) => row.id !== card.id));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await retireEmptyCollections(user.id);
    onBecameEmpty?.();
  }

  async function toggleChecklist(itemId: string, entryId: string, done: boolean) {
    const card = items.find((row) => row.id === itemId);
    if (card?.checklistRowsAreItems) {
      const remaining = card.checklist.filter((entry) => (entry.id === entryId ? !done : !entry.done));
      patchItem(itemId, (row) => ({
        ...row,
        checklist: row.checklist.filter((entry) => entry.id !== entryId || !done),
        prepLabel: remaining.length ? thingsToSortLabel(remaining.length) : null,
        context: remaining.length ? thingsToSortLabel(remaining.length) : row.context,
      }));
      let error: { message: string } | null = null;
      if (done) {
        ({ error } = await closeItems([entryId], 'done'));
      } else {
        error = (await supabase.from('items').update({ status: 'open' }).eq('id', entryId)).error;
      }
      if (error) {
        patchItem(itemId, () => card);
        return;
      }
      if (done) await retireListIfEmpty(card, remaining);
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
    if (done) {
      const remaining = card?.checklist.filter((entry) => (entry.id === entryId ? false : !entry.done)) ?? [];
      if (card) await retireListIfEmpty(card, remaining);
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
    if (card.checklistRowsAreItems && !card.collectionId) return;
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
      nextOrder: card.checklist.length,
    });
    if ('error' in result) return;
    patchItem(card.id, (row) => {
      const checklist = [...row.checklist, result.entry];
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return {
        ...row,
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
      const leftover = snapshot.filter((entry) => entry.id !== entryId);
      const { error } = await closeItems([entryId], 'dismissed');
      if (error) {
        patchItem(itemId, () => ({ ...card, checklist: snapshot }));
      } else {
        await retireListIfEmpty(card, leftover);
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
      sub: card.askSub || extraEventContext(card.title, card.detail) || card.context || card.src,
      opener: card.opener,
      chips: [],
      generateOpener: true,
    });
    router.push('/chat');
  }

  const shown = maxVisible ? items.slice(0, maxVisible) : items;
  const list = shown.map((card, index) => (
    <PlanItemCard
      key={card.rowKey || `${card.id}:${index}`}
      card={card}
      variant={variant}
      last={index === shown.length - 1}
      expanded={!!expanded[card.id]}
      editingPrep={!!editingPrep[card.id]}
      onToggleExpand={() => setExpanded((p) => ({ ...p, [card.id]: !p[card.id] }))}
      onDismiss={() => void setStatus(card, 'dismissed')}
      onDone={() => void setStatus(card, 'done')}
      onShare={
        viewerId &&
        (!card.createdBy ||
          card.createdBy === viewerId ||
          (card.listMode && isHouseholdList(card.collectionType, card.title)))
          ? () => void toggleShare(card)
          : undefined
      }
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

  const rows =
    items.length === 0 ? (
      <View style={[s.homeHeroRow, s.homeHeroRowLast]}>
        <Text style={s.emptyStateText}>{empty}</Text>
      </View>
    ) : (
      list
    );

  if (variant === 'hero') {
    return (
      <View style={s.homeHero}>
        {header}
        {rows}
      </View>
    );
  }

  if (items.length === 0) {
    return <Text style={s.planEmptyLine}>{empty}</Text>;
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
