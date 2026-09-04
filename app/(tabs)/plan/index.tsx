import { BrandIconDisc } from '@/components/app/BrandIcon';
import { useChat } from '@/components/app/ChatProvider';
import { PlanItemCard, type PlanItemCardModel } from '@/components/app/PlanItemCard';
import { appStyles as s } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import { colors } from '@/constants/theme';
import { isActiveCollection, unwrapCollection } from '@/lib/collections';
import { itemCountLabel, planContextLine, thingsToSortLabel } from '@/lib/human-date';
import { resolvePlanIcon, type PlanIconSpec } from '@/lib/plan-icon';
import { looksLikeShoppingList } from '@/lib/shopping';
import {
  comparePlanItems,
  earliestDatesByCollection,
  horizonForItem,
  type Horizon,
} from '@/lib/plan-horizon';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

type NudgeStatus = 'open' | 'done' | 'delegated' | 'dismissed';

type NestedEntry = { id: string; text: string; done: boolean; sort_order: number };
type NestedList = { id: string; item_id: string; checklist_items: NestedEntry[] | null };
type CollectionJoin = {
  id: string;
  title: string | null;
  emoji: string | null;
  type: string | null;
  status: string | null;
};

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
  source: string | null;
  source_label: string | null;
  source_email_subject: string | null;
  collection_id: string | null;
  collections: CollectionJoin | CollectionJoin[] | null;
  checklists: NestedList[] | NestedList | null;
};

type FeedItem = PlanItemCardModel & {
  kind: 'item';
  horizon: Horizon;
  event_date: string | null;
};

type FeedCollection = {
  kind: 'collection';
  id: string;
  title: string;
  icon: PlanIconSpec;
  context: string;
  horizon: Horizon;
  event_date: string | null;
  count: number;
};

type FeedRow = FeedItem | FeedCollection;

const HORIZON_ORDER: Horizon[] = ['now', 'next', 'later'];

const SECTION: Record<Horizon, { kicker: string; hint: string; empty: string }> = {
    now: { kicker: 'Now', hint: 'Things on your plate', empty: 'Nothing you need to act on right now.' },
  next: { kicker: 'Next', hint: 'Coming up', empty: 'Nothing coming up yet.' },
  later: { kicker: 'Later', hint: "Taylo's keeping an eye on", empty: "Taylo's keeping an eye on things." },
};

const HORIZON_RANK: Record<Horizon, number> = { now: 0, next: 1, later: 2 };

function formatSuggestion(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim().replace(/^suggested:\s*/i, '');
  return trimmed || null;
}

function unwrapLists(raw: NestedList[] | NestedList | null): NestedList[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function mapItem(row: ItemRow, today: Date, collectionEarliest: string | null): FeedItem {
  const lists = unwrapLists(row.checklists);
  const list = lists[0];
  const entries = [...(list?.checklist_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => ({ id: entry.id, text: entry.text, done: entry.done }));
  const title = row.title || 'Untitled';
  const body = row.body || '';
  const detail = row.detail || row.action_description || '';
  const incomplete = entries.filter((entry) => !entry.done).length;
  const shopping = looksLikeShoppingList(title);
  return {
    kind: 'item',
    id: row.id,
    title,
    context: planContextLine(
      { event_date: row.event_date, body: shopping ? null : row.body, urgency_level: row.urgency_level },
      today,
    ),
    detail,
    suggestion: formatSuggestion(row.suggestion),
    opener: row.action_description || detail || body || title,
    src: row.source_label || row.source_email_subject || 'Plan',
    icon: resolvePlanIcon({ title, category: row.category, stored: row.icon, collectionType: shopping ? 'shopping' : null }),
    prepLabel: incomplete ? thingsToSortLabel(incomplete) : null,
    checklistId: list?.id ?? null,
    checklist: entries,
    checklistHeading: shopping ? 'To pick up' : undefined,
    horizon: horizonForItem({ ...row, status: 'open' }, today, collectionEarliest),
    event_date: row.event_date,
  };
}

function compareFeed(a: FeedRow, b: FeedRow, today: Date): number {
  const rank = HORIZON_RANK[a.horizon] - HORIZON_RANK[b.horizon];
  if (rank !== 0) return rank;
  return comparePlanItems(
    { event_date: a.event_date, urgency_level: null, title: a.title },
    { event_date: b.event_date, urgency_level: null, title: b.title },
    today,
  );
}

export default function PlanScreen() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { openItem } = useChat();

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('items')
      .select(
        'id, title, body, detail, suggestion, category, icon, action_description, event_date, urgency_level, source, source_label, source_email_subject, collection_id, collections(id, title, emoji, type, status), checklists(id, item_id, checklist_items(id, text, done, sort_order))',
      )
      .eq('user_id', user.id)
      .eq('status', 'open')
      .neq('source', 'calendar');

    if (error) {
      console.error('Failed to load plan:', error.message);
      setLoading(false);
      return;
    }

    const today = new Date();
    const openRows = ((data as ItemRow[] | null) ?? []).filter((row) => isActiveCollection(row.collections));
    const collectionIds = [...new Set(openRows.map((row) => row.collection_id).filter((id): id is string => !!id))];
    let datedSiblings: Array<{ collection_id?: string | null; event_date: string | null }> = [];
    if (collectionIds.length) {
      const { data: dated } = await supabase
        .from('items')
        .select('collection_id, event_date')
        .eq('user_id', user.id)
        .in('collection_id', collectionIds)
        .not('event_date', 'is', null);
      datedSiblings = (dated as Array<{ collection_id?: string | null; event_date: string | null }> | null) ?? [];
    }
    const earliest = earliestDatesByCollection(datedSiblings);

    const grouped = new Map<string, ItemRow[]>();
    const standalone: ItemRow[] = [];
    for (const row of openRows) {
      if (row.collection_id) {
        const list = grouped.get(row.collection_id) ?? [];
        list.push(row);
        grouped.set(row.collection_id, list);
      } else {
        standalone.push(row);
      }
    }

    const feed: FeedRow[] = standalone.map((row) =>
      mapItem(row, today, row.collection_id ? earliest.get(row.collection_id) ?? null : null),
    );

    for (const [collectionId, members] of grouped) {
      const meta = unwrapCollection(members[0]?.collections);
      if (meta?.type === 'shopping') {
        for (const member of members) {
          const card = mapItem(member, today, earliest.get(collectionId) ?? null);
          card.checklistHeading = 'To pick up';
          feed.push(card);
        }
        continue;
      }
      const collectionEarliest = earliest.get(collectionId) ?? null;
      let horizon: Horizon = 'later';
      let eventDate: string | null = collectionEarliest;
      for (const member of members) {
        const h = horizonForItem({ ...member, status: 'open' }, today, collectionEarliest);
        if (HORIZON_RANK[h] < HORIZON_RANK[horizon]) horizon = h;
        if (member.event_date && (!eventDate || member.event_date < eventDate)) eventDate = member.event_date;
      }
      const when = planContextLine({ event_date: eventDate, body: null }, today);
      const countLine = itemCountLabel(members.length);
      feed.push({
        kind: 'collection',
        id: collectionId,
        title: meta?.title || 'Collection',
        icon: resolvePlanIcon({
          title: meta?.title,
          collectionType: meta?.type,
          stored: meta?.emoji,
        }),
        context: when ? `${when} · ${countLine}` : countLine,
        horizon,
        event_date: eventDate,
        count: members.length,
      });
    }

    feed.sort((a, b) => compareFeed(a, b, today));
    setRows(feed);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function patchItem(itemId: string, update: (card: FeedItem) => FeedItem) {
    setRows((prev) =>
      prev.map((row) => (row.kind === 'item' && row.id === itemId ? update(row) : row)),
    );
  }

  async function setStatus(card: FeedItem, status: Exclude<NudgeStatus, 'open'>) {
    setRows((prev) => prev.filter((row) => !(row.kind === 'item' && row.id === card.id)));
    const { error } = await supabase.from('items').update({ status }).eq('id', card.id);
    if (error) setRows((prev) => [...prev, card].sort((a, b) => compareFeed(a, b, new Date())));
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

  async function commitChecklistText(entryId: string, text: string) {
    const { error } = await persistChecklistText(entryId, text);
    if (error) console.error('Failed to rename checklist item:', error.message);
  }

  async function addChecklistRow(card: FeedItem) {
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
    if ('error' in result) {
      console.error('Failed to add checklist item:', result.error);
      return;
    }
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
    const snapshot = rows.find((row) => row.kind === 'item' && row.id === itemId);
    const prevList = snapshot && snapshot.kind === 'item' ? snapshot.checklist : [];
    patchItem(itemId, (card) => {
      const checklist = card.checklist.filter((entry) => entry.id !== entryId);
      const incomplete = checklist.filter((entry) => !entry.done).length;
      return { ...card, checklist, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
    });
    const { error } = await persistChecklistDelete(entryId);
    if (error) {
      patchItem(itemId, (card) => {
        const incomplete = prevList.filter((entry) => !entry.done).length;
        return { ...card, checklist: prevList, prepLabel: incomplete ? thingsToSortLabel(incomplete) : null };
      });
    }
  }

  async function onChat(card: FeedItem) {
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

  function renderItem(card: FeedItem) {
    return (
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
        onCommitChecklistText={(id, text) => void commitChecklistText(id, text)}
        onAddChecklist={() => void addChecklistRow(card)}
        onDeleteChecklist={(id) => void removeChecklistRow(card.id, id)}
      />
    );
  }

  function renderCollection(card: FeedCollection) {
    return (
      <Pressable
        key={card.id}
        style={s.planCard}
        onPress={() => router.push(`/plan/${card.id}` as const)}>
        <View style={s.nrow}>
          <View style={{ flexShrink: 0 }}>
            <BrandIconDisc name={card.icon.name} wash={card.icon.wash} />
          </View>
          <View style={s.ncopy}>
            <View style={s.uheadRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.utitle}>{card.title}</Text>
                <Text style={s.usub}>{card.context}</Text>
              </View>
              <Text style={s.uchevron}>›</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : (
        HORIZON_ORDER.map((horizon) => {
          const items = rows.filter((row) => row.horizon === horizon);
          const section = SECTION[horizon];
          return (
            <View key={horizon}>
              <Text style={s.slabel}>
                {section.kicker} · {items.length}
              </Text>
              <Text style={s.planSectionHint}>
                {horizon === 'later' ? (
                  <>
                    <TayloMark />{' '}
                  </>
                ) : null}
                {section.hint}
              </Text>
              {items.length === 0 ? (
                <Text style={s.planEmptyLine}>
                  {horizon === 'later' ? (
                    <>
                      <TayloMark />{' '}
                    </>
                  ) : null}
                  {section.empty}
                </Text>
              ) : (
                items.map((row) => (row.kind === 'collection' ? renderCollection(row) : renderItem(row)))
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
