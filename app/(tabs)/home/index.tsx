import { BrandGlyph, BrandIconDisc } from '@/components/app/BrandIcon';
import { useChat } from '@/components/app/ChatProvider';
import { DayTimelineCard } from '@/components/app/DayTimelineCard';
import { ItemPrepChecklist, type PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { appStyles as s, iconBg } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import { colors } from '@/constants/theme';
import { subscribeAppleCalendarSync } from '@/lib/apple-calendar';
import { isActiveCollection, organizeStandaloneItems } from '@/lib/collections';
import { memberPalette } from '@/lib/demo-data';
import { happenSortKey, type HappenItem } from '@/lib/happening';
import { daysUntil, humanizeEventDate } from '@/lib/human-date';
import { closeItems } from '@/lib/item-status';
import {
  displayItemTitle,
  HOME_OVERFLOW_RANK_BASE,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  isFamilyVisible,
  isOccurrenceOnSchedule,
  selectHomeActions,
  type HomeSurfaced,
  type PlacementParent,
} from '@/lib/placement';
import { isUsableInsight, insightRepeatsCaptured, looksLikeMentalLoad, refreshNoticed } from '@/lib/noticed';
import {
  persistChecklistAdd,
  persistChecklistDelete,
  persistChecklistText,
  persistChecklistToggle,
} from '@/lib/prep-checklists';
import { resolvePlanIcon, type PlanIconSpec } from '@/lib/plan-icon';
import { actionSupportLine, extraEventContext, firstCompleteSentence, helpfulSuggestion } from '@/lib/suggestion';
import { latestSpotlightRows, refreshSpotlight } from '@/lib/spotlight';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

type FamilyCard = {
  key: string;
  name: string;
  initial: string;
  wash: string;
  photo: string | null;
  itemTitle: string | null;
  itemWhen: string | null;
  itemIcon: PlanIconSpec | null;
};

/** Temporary visual placeholders for Your Family — Unsplash face crops. */
const STOCK_PHOTO = {
  you: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces&q=80',
  sophie: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces&q=80',
  arlo: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=400&h=400&fit=crop&crop=faces&q=80',
  taya: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400&h=400&fit=crop&crop=faces&q=80',
};

const PREVIEW_FAMILY_EMAIL = 'd.dennison23@hotmail.com';
const PREVIEW_FAMILY: FamilyCard[] = [
  {
    key: 'preview-sophie',
    name: 'Sophie',
    initial: 'S',
    wash: colors.blush,
    photo: STOCK_PHOTO.sophie,
    itemTitle: 'Birthday party',
    itemWhen: 'Saturday',
    itemIcon: resolvePlanIcon({ title: 'birthday', category: 'activity' }),
  },
  {
    key: 'preview-arlo',
    name: 'Arlo',
    initial: 'A',
    wash: colors.paleBlue,
    photo: STOCK_PHOTO.arlo,
    itemTitle: 'Football training',
    itemWhen: 'Tomorrow',
    itemIcon: resolvePlanIcon({ title: 'football', category: 'activity' }),
  },
  {
    key: 'preview-taya',
    name: 'Taya',
    initial: 'T',
    wash: colors.sage,
    photo: STOCK_PHOTO.taya,
    itemTitle: 'Dentist',
    itemWhen: 'Thursday',
    itemIcon: resolvePlanIcon({ title: 'dentist', category: 'medical' }),
  },
];

type NudgeStatus = 'open' | 'done' | 'delegated' | 'dismissed';

type ItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  category: string | null;
  action_description: string | null;
  event_date: string | null;
  due_at: string | null;
  occurs_at: string | null;
  kind: string | null;
  confidence: string | null;
  surface_from: string | null;
  surface_until: string | null;
  parent_id: string | null;
  created_at: string | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  status: NudgeStatus | null;
  source_email_subject: string | null;
  source_label: string | null;
  source: 'email' | 'chat' | 'manual' | 'calendar' | null;
  suggestion: string | null;
  parent?: PlacementParent | PlacementParent[] | null;
  collections: { status: string | null } | { status: string | null }[] | null;
};

type SpotlightJoin = {
  id: string;
  item_id: string | null;
  reason_text: string;
  rank: number;
  generated_at?: string | null;
  items: ItemRow | ItemRow[] | null;
};

type NudgeCard = {
  id: string;
  spotlightId: string;
  title: string;
  body: string;
  detail: string;
  reason: string;
  eventDate: string | null;
  category: string;
  categoryLabel: string;
  icon: PlanIconSpec;
  cls: keyof typeof iconBg;
  opener: string;
  src: string;
  suggestion: string | null;
  addedByUser: boolean;
  checklistId: string | null;
  checklist: PrepCheckItem[];
};

const colorMap = {
  roseLight: colors.roseLight,
  roseDark: colors.roseDark,
  blueLight: colors.blueLight,
  blue: colors.blue,
  amberLight: colors.amberLight,
  amber: colors.amber,
  tealLight: colors.tealLight,
  teal: colors.teal,
};

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

function mapActionCard(item: ItemRow, children: ItemRow[], reason: string, spotlightId: string): NudgeCard | null {
  if (item.status !== 'open') return null;
  if (!isActiveCollection(item.collections)) return null;
  const addedByUser = item.source === 'manual' || item.source === 'chat';
  const meta = formatCategory(item.category);
  const title = displayItemTitle(item);
  const body = item.body || '';
  const detail = item.detail || item.action_description || body;
  return {
    id: item.id,
    spotlightId,
    title,
    body,
    detail,
    reason: reason.trim(),
    eventDate: item.due_at || item.event_date,
    category: item.category || '',
    categoryLabel: meta.label,
    icon: meta.icon,
    cls: meta.cls,
    opener: item.action_description || body || title,
    src: addedByUser ? meta.label : item.source_label || item.source_email_subject || meta.label,
    suggestion: helpfulSuggestion(item),
    addedByUser,
    checklistId: null,
    checklist: children
      .filter((row) => row.status !== 'dismissed')
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .map((row) => ({ id: row.id, text: row.title || '', done: row.status === 'done' })),
  };
}

function timeFromEventDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /(?:T| )(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour === 0 && minute === '00') return null;
  const h12 = hour % 12 || 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return minute === '00' ? `${h12}${suffix}` : `${h12}:${minute}${suffix}`;
}

function fewWords(raw: string | null | undefined, max = 7): string | null {
  const words = (raw || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  return words.slice(0, max).join(' ');
}

function collapsedActionLine(card: NudgeCard): string | null {
  const when = humanizeEventDate(card.eventDate);
  const pastWhen = !when || when === 'Today' || /ago|yesterday/i.test(when);
  const support = actionSupportLine({
    title: card.title,
    body: card.body,
    reason: card.reason,
    category: card.category,
  });
  if (support) return support;
  if (!pastWhen && when) return `Coming up ${when.toLowerCase()}.`;
  return null;
}

function happenTime(item: ItemRow): string {
  const time = timeFromEventDate(item.occurs_at || item.event_date);
  if (time) return time.replace(/(am|pm)$/i, '');
  const blob = `${item.title || ''} ${item.body || ''}`.toLowerCase();
  if (/\b(birthday|bday|anniversary)\b/.test(blob)) return 'All day';
  return 'All day';
}

function happenSub(item: ItemRow): string | null {
  const extra = firstCompleteSentence(item.body);
  if (extra) return extra;
  const who = (item.who_it_affects || '').trim();
  if (who && !['you', 'me', 'family'].includes(who.toLowerCase())) {
    return who;
  }
  return null;
}

function isHappeningOccasion(item: ItemRow): boolean {
  if (!isOccurrenceOnSchedule(item)) return false;
  return daysUntil(item.occurs_at) === 0;
}

function greetingLine(name: string) {
  const hr = new Date().getHours();
  const timeGreet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${timeGreet}, ${name}` : `Good ${timeGreet}`;
}

function actionsSummary(count: number) {
  if (count <= 0) return 'Nothing that needs you right now.';
  if (count === 1) return '1 thing to keep life moving.';
  return `${count} things to keep life moving.`;
}

function mentionsPerson(item: ItemRow, name: string, role: string): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  const who = (item.who_it_affects || '').trim().toLowerCase();
  const title = (item.title || '').toLowerCase();
  if (who.includes(needle) || title.includes(needle)) return true;
  const isYou = role === 'self' || role === 'you';
  if (isYou && (who === 'you' || who === 'me' || who === 'mum' || who === 'mom' || who === 'parent')) return true;
  return false;
}

function pickItemForPerson(items: ItemRow[], name: string, role: string): ItemRow | null {
  const matches = items.filter((item) => mentionsPerson(item, name, role) && isFamilyVisible(item));
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const da = daysUntil(a.occurs_at || a.due_at || a.event_date);
    const db = daysUntil(b.occurs_at || b.due_at || b.event_date);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
  return matches[0];
}

export default function HomeScreen() {
  const [spotlight, setSpotlight] = useState<NudgeCard[]>([]);
  const [happening, setHappening] = useState<HappenItem[]>([]);
  const [family, setFamily] = useState<FamilyCard[]>([]);
  const [noticed, setNoticed] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPrep, setEditingPrep] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { openItem } = useChat();

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSpotlight([]);
      setHappening([]);
      setFamily([]);
      setNoticed(null);
      setLoading(false);
      return;
    }

    await organizeStandaloneItems(user.id);

    const [{ data: profile }, { data: spotlightData }, { data: itemData }, { data: members }, { data: noticedRow }] =
      await Promise.all([
        supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('home_spotlight')
          .select('id, item_id, reason_text, rank, generated_at')
          .eq('user_id', user.id)
          .order('rank', { ascending: true }),
        supabase
          .from('items')
          .select(
            'id, title, body, detail, suggestion, category, action_description, event_date, due_at, occurs_at, kind, confidence, surface_from, surface_until, parent_id, created_at, who_it_affects, urgency_level, status, source_email_subject, source_label, source, parent:items!parent_id(id, title, kind, status, collection_id, occurs_at, event_date, due_at), collections(status)',
          )
          .eq('user_id', user.id)
          .eq('status', 'open')
          .in('kind', [...HOME_RADAR_LOAD_KINDS]),
        supabase.from('family_members').select('id, role, first_name, last_name').eq('user_id', user.id),
        supabase.from('home_noticed').select('insight_text').eq('user_id', user.id).maybeSingle(),
      ]);

    if (profile?.first_name) setFirstName(profile.first_name);

    const today = new Date();
    const spotlightRows = latestSpotlightRows((spotlightData as SpotlightJoin[] | null) ?? []);
    const generatedAt = spotlightRows[0]?.generated_at ? new Date(spotlightRows[0].generated_at) : null;
    const previouslySurfaced: HomeSurfaced[] =
      generatedAt && today.getTime() - generatedAt.getTime() < HOME_SURFACED_COOLDOWN_MS
        ? spotlightRows
            .filter((row): row is SpotlightJoin & { item_id: string } => !!row.item_id && (row.rank ?? 0) < HOME_OVERFLOW_RANK_BASE)
            .map((row) => ({ id: row.item_id, at: generatedAt }))
        : [];
    const reasonById = new Map(spotlightRows.map((row) => [row.item_id || '', row.reason_text || '']));
    const spotlightIdByItem = new Map(spotlightRows.map((row) => [row.item_id || '', row.id]));

    const openItems = ((itemData as ItemRow[] | null) ?? []).filter((item) => isActiveCollection(item.collections));
    const selected = selectHomeActions(openItems, {
      today,
      previouslySurfaced,
    });
    const actionCards = selected
      .map((card) =>
        mapActionCard(
          card.item,
          card.children,
          reasonById.get(card.item.id) || card.item.action_description || card.item.body || '',
          spotlightIdByItem.get(card.item.id) || card.item.id,
        ),
      )
      .filter((card): card is NudgeCard => !!card);
    setSpotlight(actionCards);
    const actionIds = new Set(actionCards.map((card) => card.id));
    const realHappening = openItems
      .filter((item) => !actionIds.has(item.id) && isHappeningOccasion(item))
      .map((item) => ({
        id: item.id,
        title: item.title || 'Untitled',
        time: happenTime(item),
        sub: happenSub(item),
        icon: resolvePlanIcon({ title: item.title, category: item.category }),
      }));
    setHappening(realHappening.sort((a, b) => happenSortKey(a) - happenSortKey(b)));

    const memberRows = (members as { id: string; role: string; first_name: string | null; last_name: string | null }[] | null) ?? [];
    const cardsOut: FamilyCard[] = [];
    memberRows.forEach((member, index) => {
      const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Family';
      const first = member.first_name?.trim() || name;
      const pal = memberPalette[index % memberPalette.length];
      const match = pickItemForPerson(openItems, first, member.role);
      const when = match ? humanizeEventDate(match.occurs_at || match.due_at || match.event_date) : null;
      cardsOut.push({
        key: member.id,
        name: member.first_name?.trim() || name,
        initial: name[0]?.toUpperCase() || '•',
        wash: colorMap[pal.bg],
        photo: null,
        itemTitle: match ? displayItemTitle(match) : null,
        itemWhen: when && when !== 'Today' ? when : match ? fewWords(match.body, 5) : null,
        itemIcon: match ? resolvePlanIcon({ title: match.title, category: match.category }) : null,
      });
    });
    if (profile?.first_name) {
      const youMatch = pickItemForPerson(openItems, profile.first_name, 'self');
      const youWhen = youMatch ? humanizeEventDate(youMatch.occurs_at || youMatch.due_at || youMatch.event_date) : null;
      cardsOut.push({
        key: 'you',
        name: 'You',
        initial: profile.first_name[0]?.toUpperCase() || 'Y',
        wash: colors.sage,
        photo: null,
        itemTitle: youMatch ? displayItemTitle(youMatch) : null,
        itemWhen: youWhen && youWhen !== 'Today' ? youWhen : youMatch ? fewWords(youMatch.body, 5) : null,
        itemIcon: youMatch ? resolvePlanIcon({ title: youMatch.title, category: youMatch.category }) : null,
      });
    }
    if ((user.email || '').trim().toLowerCase() === PREVIEW_FAMILY_EMAIL) {
      const you = cardsOut.find((card) => card.key === 'you');
      setFamily(you ? [{ ...you, photo: STOCK_PHOTO.you }, ...PREVIEW_FAMILY] : PREVIEW_FAMILY);
    } else {
      setFamily(cardsOut);
    }

    const rawInsight = (noticedRow as { insight_text?: string } | null)?.insight_text?.trim() || null;
    const capturedTitles = openItems
      .map((item) => item.title)
      .filter((title): title is string => !!title);
    const showInsight =
      !!rawInsight &&
      isUsableInsight(rawInsight) &&
      looksLikeMentalLoad(rawInsight) &&
      !insightRepeatsCaptured(rawInsight, capturedTitles);
    setNoticed(showInsight ? rawInsight : null);

    setLoading(false);
  }, []);

  const loadAndMaybeRefresh = useCallback(
    async (force = false) => {
      await load();
      const [{ regenerated: spot }, { regenerated: note }] = await Promise.all([
        refreshSpotlight({ force }),
        refreshNoticed({ force }),
      ]);
      if (spot || note) await load();
    },
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      void loadAndMaybeRefresh();
    }, [loadAndMaybeRefresh]),
  );

  useEffect(() => {
    return subscribeAppleCalendarSync((result) => {
      if (result.changed) void load();
    });
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadAndMaybeRefresh();
    });
    return () => sub.remove();
  }, [loadAndMaybeRefresh]);

  function removeCard(card: NudgeCard) {
    setSpotlight((prev) => prev.filter((n) => n.id !== card.id));
  }

  function restoreCard(card: NudgeCard) {
    setSpotlight((prev) => [...prev, card]);
  }

  async function setStatus(nudge: NudgeCard, status: Exclude<NudgeStatus, 'open'>) {
    removeCard(nudge);
    const { error } = await closeItems([nudge.id], status);
    if (error) restoreCard(nudge);
  }

  function patchCard(itemId: string, update: (nudge: NudgeCard) => NudgeCard) {
    setSpotlight((list) => list.map((nudge) => (nudge.id === itemId ? update(nudge) : nudge)));
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
    const snapshot = spotlight.find((card) => card.id === nudgeId)?.checklist ?? [];
    patchCard(nudgeId, (nudge) => ({
      ...nudge,
      checklist: nudge.checklist.filter((entry) => entry.id !== entryId),
    }));
    const { error } = await persistChecklistDelete(entryId);
    if (error) {
      patchCard(nudgeId, (nudge) => ({ ...nudge, checklist: snapshot }));
    }
  }

  async function onChat(nudge: { id: string; icon: PlanIconSpec; title: string; src: string; opener: string }) {
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

  function renderActionPills(n: NudgeCard) {
    return (
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
    );
  }

  function renderActionRow(n: NudgeCard, last: boolean) {
    const isOpen = !!expanded[n.id];
    const support = collapsedActionLine(n);
    const eventContext = extraEventContext(n.title, n.detail || n.body);
    const showSuggest = !!n.suggestion && n.suggestion !== eventContext;
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
          style={[s.homeHeroRow, last && !isOpen && s.homeHeroRowLast]}
          onPress={() => setExpanded((p) => ({ ...p, [n.id]: !p[n.id] }))}>
          <View style={s.nrow}>
            <View style={{ flexShrink: 0 }}>
              <BrandIconDisc name={n.icon.name} wash={n.icon.wash} size={36} />
            </View>
            <View style={s.ncopy}>
              <Text style={s.homeItemTitle}>
                {n.title}
              </Text>
              {support ? <Text style={s.homeItemSub}>{support}</Text> : null}
            </View>
          </View>
          {isOpen ? (
            <>
              {eventContext ? <Text style={s.homeExpandDetail}>{eventContext}</Text> : null}
              {showSuggest ? (
                <View style={s.nsuggestRow}>
                  <TayloMark />
                  <Text style={s.homeSuggest}>{n.suggestion}</Text>
                </View>
              ) : null}
              <ItemPrepChecklist
                items={n.checklist}
                editing={!!editingPrep[n.id]}
                onToggleEditing={() => setEditingPrep((p) => ({ ...p, [n.id]: !p[n.id] }))}
                onToggle={(id, done) => void toggleChecklist(n.id, id, done)}
                onChangeText={(id, text) => renameChecklist(n.id, id, text)}
                onCommitText={(id, text) => void commitChecklistText(id, text)}
                onAdd={() => void addChecklistRow(n)}
                onDelete={(id) => void removeChecklistRow(n.id, id)}
              />
              {renderActionPills(n)}
            </>
          ) : null}
        </Pressable>
      </Swipeable>
    );
  }

  return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.screen}
        keyboardShouldPersistTaps="handled">
        <View style={s.homeGreetBlock}>
          <Text style={s.homeGreetTitle}>
            {greetingLine(firstName)} <TayloMark size={14} />
          </Text>
          <Text style={s.homeGreetSub}>Here's what would be helpful to do today.</Text>
        </View>

        <View style={s.homeSectionHead}>
          <Text style={s.homeSectionLabel}>Today's actions</Text>
          <Pressable onPress={() => router.push('/home/today')}>
            <Text style={s.homeSeeAll}>See all</Text>
          </Pressable>
        </View>
        <Text style={s.homeSectionHint}>{actionsSummary(spotlight.length)}</Text>

        {loading ? (
          <View style={s.emptyState}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <>
            <View style={s.homeHero}>
              {spotlight.length === 0 ? (
                <View style={s.homeHeroRow}>
                  <Text style={s.emptyStateText}>When something would be helpful to do, it'll show up here.</Text>
                </View>
              ) : (
                spotlight.map((card, index) => renderActionRow(card, index === spotlight.length - 1))
              )}
            </View>

            <DayTimelineCard
              items={happening}
              emptyTitle="Nothing on today"
              footer={{
                label: 'See full day ›',
                onPress: () => router.push({ pathname: '/plan', params: { tab: 'schedule' } }),
              }}
            />

            {noticed ? (
              <View style={{ marginTop: 6 }}>
                <View style={s.homeNoticed}>
                  <View style={s.homeNoticedHead}>
                    <TayloMark size={12} />
                    <Text style={s.homeNoticedLabel}>Taylo noticed</Text>
                  </View>
                  <Text style={s.homeNoticedText}>{noticed}</Text>
                </View>
              </View>
            ) : null}

            {family.length ? (
              <>
                <View style={s.homeSectionHead}>
                  <Text style={[s.homeSectionLabel, s.homeSectionLabelMuted]}>Your family</Text>
                  <Pressable onPress={() => router.push('/more/family')}>
                    <Text style={s.homeSeeAll}>View all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={s.homeFamilyScroll}
                  contentContainerStyle={s.homeFamilyRow}>
                  {family.map((member) => (
                    <Pressable
                      key={member.key}
                      style={s.homeFamilyCard}
                      onPress={() => router.push('/more/family')}>
                      <View style={[s.homeFamilyAvatar, { backgroundColor: member.wash }]}>
                        {member.photo ? (
                          <Image source={{ uri: member.photo }} style={s.homeFamilyPhoto} />
                        ) : (
                          <Text style={s.homeFamilyInitial}>{member.initial}</Text>
                        )}
                      </View>
                      <Text style={s.homeFamilyName} numberOfLines={1}>
                        {member.name}
                      </Text>
                      {member.itemTitle ? (
                        <View style={s.homeFamilyDoing}>
                          {member.itemIcon ? (
                            <BrandGlyph name={member.itemIcon.name} size={14} color={colors.navy} />
                          ) : null}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.homeFamilyItem} numberOfLines={2}>
                              {member.itemTitle}
                            </Text>
                            {member.itemWhen ? (
                              <Text style={s.homeFamilyWhen} numberOfLines={1}>
                                {member.itemWhen}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : (
                        <Text style={[s.homeFamilyWhen, { marginTop: 8 }]}>Nothing coming up</Text>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {spotlight.length === 0 ? (
              <View style={s.homeReassure}>
                <BrandIconDisc name="heart-outline" wash="blush" size={32} />
                <View style={s.homeReassureCopy}>
                  <Text style={s.homeReassureTitle}>You're all set for today.</Text>
                  <Text style={s.homeReassureSub}>I've got everything else on the radar.</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
  );
}
