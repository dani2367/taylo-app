import { BrandIconDisc } from '@/components/app/BrandIcon';
import { useChat } from '@/components/app/ChatProvider';
import { ItemPrepChecklist, type PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { appStyles as s, iconBg } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import { colors } from '@/constants/theme';
import { addProductsToShoppingList, isActiveCollection } from '@/lib/collections';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { resolvePlanIcon, type PlanIconSpec } from '@/lib/plan-icon';
import { groceryLabelsFromText, isGroceryCapture } from '@/lib/shopping';
import { refreshSpotlight } from '@/lib/spotlight';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

const MANUAL_HELP = 'Need a hand? Chat and Taylo can help you get this done.';

type NudgeStatus = 'open' | 'done' | 'delegated' | 'dismissed';

type ItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  category: string | null;
  action_description: string | null;
  event_date: string | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  status: NudgeStatus | null;
  source_email_subject: string | null;
  source: 'email' | 'chat' | 'manual' | 'calendar' | null;
  suggestion: string | null;
  collections: { status: string | null } | { status: string | null }[] | null;
};

type SpotlightJoin = {
  id: string;
  item_id: string | null;
  reason_text: string;
  rank: number;
  is_watching: boolean;
  items: ItemRow | ItemRow[] | null;
};

type NudgeCard = {
  id: string;
  spotlightId: string;
  title: string;
  body: string;
  detail: string;
  reason: string;
  watching: boolean;
  category: string;
  categoryLabel: string;
  urgent: boolean;
  icon: PlanIconSpec;
  cls: keyof typeof iconBg;
  opener: string;
  src: string;
  suggestion: string | null;
  addedByUser: boolean;
  checklistId: string | null;
  checklist: PrepCheckItem[];
};

function formatSuggestion(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim().replace(/^suggested:\s*/i, '');
  return trimmed || null;
}

const categoryMeta: Record<string, { icon: PlanIconSpec; cls: keyof typeof iconBg; label: string }> = {
  school: { icon: resolvePlanIcon({ category: 'school' }), cls: 'teal', label: 'School' },
  medical: { icon: resolvePlanIcon({ category: 'medical' }), cls: 'amber', label: 'Medical' },
  activity: { icon: resolvePlanIcon({ category: 'activity' }), cls: 'purple', label: 'Activity' },
  delivery: { icon: resolvePlanIcon({ category: 'delivery' }), cls: 'amber', label: 'Delivery' },
  returns: { icon: resolvePlanIcon({ category: 'returns' }), cls: 'amber', label: 'Returns' },
  financial: { icon: resolvePlanIcon({ category: 'financial' }), cls: 'green', label: 'Financial' },
  errand: { icon: resolvePlanIcon({ category: 'errand' }), cls: 'amber', label: 'Errand' },
  home: { icon: resolvePlanIcon({ category: 'home' }), cls: 'rose', label: 'Home' },
};

function formatCategory(category: string | null) {
  const key = (category || '').toLowerCase();
  if (categoryMeta[key]) return categoryMeta[key];
  if (!category) return { icon: resolvePlanIcon({}), cls: 'rose' as const, label: 'Nudge' };
  return {
    icon: resolvePlanIcon({ category }),
    cls: 'rose' as const,
    label: category.charAt(0).toUpperCase() + category.slice(1),
  };
}

function inferCategory(title: string, note: string): string {
  const t = `${title} ${note}`.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(return|refund|exchange)\b/)) return 'returns';
  if (has(/\b(school|teacher|homework|permission|nursery|reception|uniform|pe kit|packed lunch|parents.?evening|ofsted|year [0-9])\b/)) {
    return 'school';
  }
  if (has(/\b(gp|nhs|doctor|dentist|hospital|prescription|vaccine|jab|check-?up|pharmacy|optician|midwife)\b/)) {
    return 'medical';
  }
  if (has(/\b(bill|invoice|council tax|insurance|rent|mortgage|direct debit|pay the)\b/)) return 'financial';
  if (has(/\b(club|football|swimming|ballet|brownies|scouts|party|playdate|match|training|piano|lesson)\b/)) {
    return 'activity';
  }
  if (has(/\b(parcel|delivery|amazon|yodel|evri|royal mail|collect|pick ?up|post office)\b/)) return 'delivery';
  if (has(/\b(buy|shop|tesco|sainsbury|waitrose|asda|aldi|lidl|grocer|present|gift|card|dry clean)\b/)) {
    return 'errand';
  }
  if (has(/\b(laundry|bins|dishwasher|garden|plumber|boiler|clean|hoover)\b/)) return 'home';
  return 'errand';
}

function unwrapItem(raw: ItemRow | ItemRow[] | null): ItemRow | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function mapSpotlight(row: SpotlightJoin): NudgeCard | null {
  const item = unwrapItem(row.items);
  if (!item || item.status !== 'open' || item.source === 'calendar') return null;
  if (!isActiveCollection(item.collections)) return null;
  const addedByUser = item.source === 'manual' || item.source === 'chat';
  const meta = formatCategory(item.category);
  const title = item.title || 'Nudge';
  const body = item.body || '';
  const detail = item.detail || item.action_description || body;
  return {
    id: item.id,
    spotlightId: row.id,
    title,
    body,
    detail,
    reason: row.reason_text.trim(),
    watching: row.is_watching,
    category: item.category || '',
    categoryLabel: meta.label,
    urgent: !row.is_watching && item.urgency_level === 'today',
    icon: meta.icon,
    cls: meta.cls,
    opener: item.action_description || body || title,
    src: addedByUser ? meta.label : item.source_email_subject || meta.label,
    suggestion: formatSuggestion(item.suggestion) || (addedByUser ? MANUAL_HELP : null),
    addedByUser,
    checklistId: null,
    checklist: [],
  };
}

async function attachChecklists(cards: NudgeCard[]) {
  const ids = cards.map((card) => card.id);
  if (!ids.length) return;
  const { data: lists } = await supabase
    .from('checklists')
    .select('id, item_id, checklist_items(id, text, done, sort_order)')
    .in('item_id', ids);

  type NestedItem = { id: string; text: string; done: boolean; sort_order: number };
  type NestedList = { id: string; item_id: string; checklist_items: NestedItem[] | null };
  const byItem = new Map<string, { checklistId: string; items: PrepCheckItem[] }>();
  for (const list of (lists as NestedList[] | null) ?? []) {
    const entries = [...(list.checklist_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((entry) => ({ id: entry.id, text: entry.text, done: entry.done }));
    byItem.set(list.item_id, { checklistId: list.id, items: entries });
  }
  for (const card of cards) {
    const found = byItem.get(card.id);
    card.checklistId = found?.checklistId ?? null;
    card.checklist = found?.items ?? [];
  }
}

async function addGroceryItems(userId: string, labels: string[]): Promise<string | null> {
  return addProductsToShoppingList(userId, labels);
}

export default function HomeScreen() {
  const [spotlight, setSpotlight] = useState<NudgeCard[]>([]);
  const [watching, setWatching] = useState<NudgeCard[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { openItem } = useChat();

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSpotlight([]);
      setWatching([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('home_spotlight')
      .select(
        'id, item_id, reason_text, rank, is_watching, items(id, title, body, detail, suggestion, category, action_description, event_date, who_it_affects, urgency_level, status, source_email_subject, source, collections(status))',
      )
      .eq('user_id', user.id)
      .order('rank', { ascending: true });

    const cards = ((data as SpotlightJoin[] | null) ?? [])
      .map(mapSpotlight)
      .filter((card): card is NudgeCard => !!card);
    await attachChecklists(cards);
    setSpotlight(cards.filter((card) => !card.watching));
    setWatching(cards.filter((card) => card.watching));
    setLoading(false);
  }, []);

  const loadAndMaybeRefresh = useCallback(
    async (force = false) => {
      await load();
      const { regenerated } = await refreshSpotlight({ force });
      if (regenerated) await load();
    },
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      void loadAndMaybeRefresh();
    }, [loadAndMaybeRefresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadAndMaybeRefresh();
    });
    return () => sub.remove();
  }, [loadAndMaybeRefresh]);

  function removeCard(card: NudgeCard) {
    if (card.watching) setWatching((prev) => prev.filter((n) => n.id !== card.id));
    else setSpotlight((prev) => prev.filter((n) => n.id !== card.id));
  }

  function restoreCard(card: NudgeCard) {
    if (card.watching) setWatching((prev) => [...prev, card]);
    else setSpotlight((prev) => [...prev, card]);
  }

  async function setStatus(nudge: NudgeCard, status: Exclude<NudgeStatus, 'open'>) {
    removeCard(nudge);
    const { error } = await supabase.from('items').update({ status }).eq('id', nudge.id);
    if (error) restoreCard(nudge);
  }

  function patchCard(itemId: string, update: (nudge: NudgeCard) => NudgeCard) {
    const patch = (list: NudgeCard[]) => list.map((nudge) => (nudge.id === itemId ? update(nudge) : nudge));
    setSpotlight(patch);
    setWatching(patch);
  }

  async function toggleChecklist(nudgeId: string, entryId: string, done: boolean) {
    patchCard(nudgeId, (nudge) => ({
      ...nudge,
      checklist: nudge.checklist.map((entry) => (entry.id === entryId ? { ...entry, done } : entry)),
    }));
    const { error } = await persistChecklistToggle(entryId, done);
    if (error) {
      patchCard(nudgeId, (nudge) => ({
        ...nudge,
        checklist: nudge.checklist.map((entry) => (entry.id === entryId ? { ...entry, done: !done } : entry)),
      }));
    }
  }

  function renameChecklist(nudgeId: string, entryId: string, text: string) {
    patchCard(nudgeId, (nudge) => ({
      ...nudge,
      checklist: nudge.checklist.map((entry) => (entry.id === entryId ? { ...entry, text } : entry)),
    }));
  }

  async function commitChecklistText(entryId: string, text: string) {
    const { error } = await persistChecklistText(entryId, text);
    if (error) console.error('Failed to rename checklist item:', error.message);
  }

  async function addChecklistRow(nudge: NudgeCard) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const result = await persistChecklistAdd({
      userId: user.id,
      itemId: nudge.id,
      itemTitle: nudge.title,
      checklistId: nudge.checklistId,
      nextOrder: nudge.checklist.length,
    });
    if ('error' in result) {
      console.error('Failed to add checklist item:', result.error);
      return;
    }
    patchCard(nudge.id, (card) => ({
      ...card,
      checklistId: result.checklistId,
      checklist: [...card.checklist, result.entry],
    }));
  }

  async function removeChecklistRow(nudgeId: string, entryId: string) {
    const snapshot = [...spotlight, ...watching].find((card) => card.id === nudgeId)?.checklist ?? [];
    patchCard(nudgeId, (nudge) => ({
      ...nudge,
      checklist: nudge.checklist.filter((entry) => entry.id !== entryId),
    }));
    const { error } = await persistChecklistDelete(entryId);
    if (error) {
      patchCard(nudgeId, (nudge) => ({ ...nudge, checklist: snapshot }));
    }
  }

  async function addTodo() {
    const title = newTitle.trim();
    if (!title || saving) return;
    const note = newNote.trim();
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const capture = `${title} ${note}`.trim();
    if (isGroceryCapture(capture)) {
      const labels = groceryLabelsFromText(capture);
      if (labels.length) {
        const error = await addGroceryItems(user.id, labels);
        setSaving(false);
        if (error) {
          console.error('Failed to add to-do:', error);
          return;
        }
        setNewTitle('');
        setNewNote('');
        setAdding(false);
        await loadAndMaybeRefresh(true);
        return;
      }
    }

    const category = inferCategory(title, note);
    const meta = formatCategory(category);

    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      title,
      body: note || null,
      detail: note || null,
      suggestion: MANUAL_HELP,
      category,
      icon: meta.icon.name,
      colour_class: meta.cls,
      source: 'manual',
      source_label: 'Added by you',
      status: 'open',
    });

    setSaving(false);
    if (error) {
      console.error('Failed to add to-do:', error.message);
      return;
    }

    setNewTitle('');
    setNewNote('');
    setAdding(false);
    await loadAndMaybeRefresh(true);
  }

  async function onChat(nudge: NudgeCard) {
    await openItem(nudge.id, {
      icon: nudge.icon.name,
      title: nudge.title,
      sub: nudge.src,
      opener: nudge.opener,
      chips: [],
      generateOpener: true,
    });
    router.push('/chat');
  }

  function renderCard(n: NudgeCard) {
    const isOpen = !!expanded[n.id];
    return (
      <Swipeable
        key={n.spotlightId}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable style={s.nudgeSwipeDelete} onPress={() => void setStatus(n, 'dismissed')}>
            <Text style={s.nudgeSwipeDeleteText}>Delete</Text>
          </Pressable>
        )}>
        <Pressable
          style={[s.nudge, n.urgent && s.nudgeUrgent, n.watching && s.nudgeWatch]}
          onPress={() => setExpanded((p) => ({ ...p, [n.id]: !p[n.id] }))}>
          <View style={s.nrow}>
            <View style={{ flexShrink: 0 }}>
              <BrandIconDisc name={n.icon.name} wash={n.icon.wash} />
            </View>
            <View style={s.ncopy}>
              <View style={s.uheadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ntitle}>{n.title}</Text>
                  {n.reason ? (
                    <Text style={[s.nreason, n.watching && s.nreasonWatch]}>
                      <TayloMark /> {n.reason}
                    </Text>
                  ) : n.body ? (
                    <Text style={s.nbody}>{n.body}</Text>
                  ) : null}
                </View>
                <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
              </View>
            </View>
          </View>
          {isOpen ? (
            <>
              {n.detail && n.detail !== n.body && n.detail !== n.reason ? (
                <Text style={s.udetail}>{n.detail}</Text>
              ) : null}
              <ItemPrepChecklist
                heading="Getting ready"
                items={n.checklist}
                editing={!!editingPrep[n.id]}
                onToggleEditing={() => setEditingPrep((p) => ({ ...p, [n.id]: !p[n.id] }))}
                onToggle={(id, done) => void toggleChecklist(n.id, id, done)}
                onChangeText={(id, text) => renameChecklist(n.id, id, text)}
                onCommitText={(id, text) => void commitChecklistText(id, text)}
                onAdd={() => void addChecklistRow(n)}
                onDelete={(id) => void removeChecklistRow(n.id, id)}
              />
              {n.suggestion ? (
                <View style={s.nsuggestRow}>
                  <TayloMark />
                  <Text style={s.nsuggest}>{n.suggestion}</Text>
                </View>
              ) : null}
              <View style={s.nactions}>
                <Pressable
                  style={[s.pill, s.pillTeal]}
                  onPress={(e) => {
                    e.stopPropagation();
                    void setStatus(n, 'done');
                  }}>
                  <Text style={[s.pillText, s.pillTextTeal]}>Done</Text>
                </Pressable>
                <Pressable
                  style={[s.pill, s.pillDelegate]}
                  onPress={(e) => {
                    e.stopPropagation();
                    void setStatus(n, 'delegated');
                  }}>
                  <Text style={[s.pillText, s.pillTextBlue]}>Delegate</Text>
                </Pressable>
                <Pressable
                  style={[s.pill, s.pillChat]}
                  onPress={(e) => {
                    e.stopPropagation();
                    void onChat(n);
                  }}>
                  <Text style={[s.pillText, s.pillTextChat]}>Ask</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Swipeable>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.screen, adding && { paddingBottom: 220 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        {adding ? (
          <View style={s.addForm}>
            <TextInput
              style={s.addInput}
              placeholder="What do you need to do?"
              placeholderTextColor={colors.textHint}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              returnKeyType="next"
              onFocus={() => scrollRef.current?.scrollTo({ y: 80, animated: true })}
            />
            <TextInput
              style={s.addInput}
              placeholder="Optional note"
              placeholderTextColor={colors.textHint}
              value={newNote}
              onChangeText={setNewNote}
              onFocus={() => scrollRef.current?.scrollTo({ y: 80, animated: true })}
            />
            <View style={s.addFormActions}>
              <Pressable
                style={[s.pill, s.pillGray]}
                onPress={() => {
                  setAdding(false);
                  setNewTitle('');
                  setNewNote('');
                }}>
                <Text style={[s.pillText, s.pillTextMuted]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.pill, s.pillTeal, (!newTitle.trim() || saving) && { opacity: 0.5 }]}
                disabled={!newTitle.trim() || saving}
                onPress={() => void addTodo()}>
                <Text style={[s.pillText, s.pillTextTeal]}>{saving ? 'Adding…' : 'Add'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={s.newClBtn} onPress={() => setAdding(true)}>
            <View style={s.newClIcon}>
              <Text style={s.newClIconText}>+</Text>
            </View>
            <View>
              <Text style={s.newClText}>Add to Home</Text>
              <Text style={s.newClSub}>Whatever you need to get done</Text>
            </View>
          </Pressable>
        )}
        {loading ? (
          <View style={s.emptyState}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <>
            {spotlight.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyStateText}>Nothing needs your attention right now</Text>
              </View>
            ) : (
              spotlight.map(renderCard)
            )}
            {watching.length ? (
              <>
                <View style={s.slabelRow}>
                  <TayloMark />
                  <Text style={s.slabelInline}>Taylo is keeping an eye on…</Text>
                </View>
                {watching.map(renderCard)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
