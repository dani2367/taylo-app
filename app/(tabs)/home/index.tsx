import { BrandGlyph, BrandIconDisc } from '@/components/app/BrandIcon';
import { DayTimelineCard } from '@/components/app/DayTimelineCard';
import { PlanItemFeed } from '@/components/app/PlanItemFeed';
import { appStyles as s } from '@/components/app/styles';
import { NoticedStar, TayloMark } from '@/components/app/TayloMark';
import { colors } from '@/constants/theme';
import { subscribeAppleCalendarSync } from '@/lib/apple-calendar';
import { isActiveCollection, organizeStandaloneItems } from '@/lib/collections';
import { happenSortKey, happenTimeLabel, isHappeningToday, type HappenItem } from '@/lib/happening';
import { daysUntil, humanizeEventDate } from '@/lib/human-date';
import { viewerForUser, visibleFamilyMembersSelect, visibleItemsSelect } from '@/lib/item-visibility';
import {
  displayItemTitle,
  HOME_OVERFLOW_RANK_BASE,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  isFamilyVisible,
  isInformationalOnSchedule,
  selectHomeActions,
  type HomeSurfaced,
  type PlacementParent,
} from '@/lib/placement';
import { isUsableInsight, insightRepeatsCaptured, looksLikeMentalLoad, refreshNoticed } from '@/lib/noticed';
import { resolvePlanIcon, type PlanIconSpec } from '@/lib/plan-icon';
import { actionSupportLine, extraEventContext, firstCompleteSentence, helpfulSuggestion } from '@/lib/suggestion';
import { latestSpotlightRows, refreshSpotlight } from '@/lib/spotlight';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

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

const FAMILY_WASH = [colors.blush, colors.sage, colors.paleBlue];

function personInitials(first: string | null | undefined, last: string | null | undefined, fallback = ''): string {
  const a = first?.trim()?.[0];
  const b = last?.trim()?.[0];
  if (a && b) return `${a}${b}`.toUpperCase();
  if (a) return a.toUpperCase();
  const parts = fallback.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '•').toUpperCase();
}

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
  created_by?: string | null;
  visibility?: string | null;
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

const categoryMeta: Record<string, { icon: PlanIconSpec; label: string }> = {
  school: { icon: resolvePlanIcon({ category: 'school' }), label: 'School' },
  medical: { icon: resolvePlanIcon({ category: 'medical' }), label: 'Medical' },
  activity: { icon: resolvePlanIcon({ category: 'activity' }), label: 'Activity' },
  delivery: { icon: resolvePlanIcon({ category: 'delivery' }), label: 'Delivery' },
  returns: { icon: resolvePlanIcon({ category: 'returns' }), label: 'Returns' },
  financial: { icon: resolvePlanIcon({ category: 'financial' }), label: 'Financial' },
  errand: { icon: resolvePlanIcon({ category: 'errand' }), label: 'Errand' },
  home: { icon: resolvePlanIcon({ category: 'home' }), label: 'Home' },
};

function formatCategory(category: string | null) {
  const key = (category || '').toLowerCase();
  if (categoryMeta[key]) return categoryMeta[key];
  if (!category) return { icon: resolvePlanIcon({}), label: 'Nudge' };
  return {
    icon: resolvePlanIcon({ category }),
    label: category.charAt(0).toUpperCase() + category.slice(1),
  };
}

function mapActionCard(item: ItemRow, children: ItemRow[], reason: string, spotlightId: string): PlanItemCardModel | null {
  if (item.status !== 'open') return null;
  if (!isActiveCollection(item.collections)) return null;
  const addedByUser = item.source === 'manual' || item.source === 'chat';
  const meta = formatCategory(item.category);
  const title = displayItemTitle(item);
  const body = item.body || '';
  const detail = item.detail || item.action_description || '';
  const src = addedByUser ? meta.label : item.source_label || item.source_email_subject || meta.label;
  return {
    id: item.id,
    rowKey: spotlightId,
    title,
    context: collapsedActionLine({
      title,
      body,
      reason: reason.trim(),
      category: item.category || '',
      eventDate: item.due_at || item.event_date,
    }),
    detail,
    suggestion: helpfulSuggestion({ ...item, detail }),
    opener: item.detail || item.action_description || body || title,
    src,
    askSub: extraEventContext(title, detail || body) || src,
    icon: meta.icon,
    prepLabel: null,
    checklist: children
      .filter((row) => row.status !== 'dismissed')
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .map((row) => ({ id: row.id, text: row.title || '', done: row.status === 'done' })),
    createdBy: item.created_by ?? null,
    visibility: item.visibility === 'shared' ? 'shared' : 'private',
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

function collapsedActionLine(card: {
  title: string;
  body: string;
  reason: string;
  category: string;
  eventDate: string | null;
}): string | null {
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
  return happenTimeLabel(item, timeFromEventDate(item.occurs_at || item.event_date));
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
  const [spotlight, setSpotlight] = useState<PlanItemCardModel[]>([]);
  const [happening, setHappening] = useState<HappenItem[]>([]);
  const [family, setFamily] = useState<FamilyCard[]>([]);
  const [noticed, setNoticed] = useState<string | null>(null);
  const [noticedSeen, setNoticedSeen] = useState<string | null>(null);
  const [noticedOpen, setNoticedOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSpotlight([]);
      setHappening([]);
      setFamily([]);
      setNoticed(null);
      setNoticedOpen(false);
      setLoading(false);
      return;
    }

    await organizeStandaloneItems(user.id);

    const viewer = await viewerForUser(user.id);
    const [{ data: profile }, { data: spotlightData }, { data: itemData }, { data: members }, { data: noticedRow }] =
      await Promise.all([
        supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('home_spotlight')
          .select('id, item_id, reason_text, rank, generated_at')
          .eq('user_id', user.id)
          .order('rank', { ascending: true }),
        visibleItemsSelect(
            'id, title, body, detail, suggestion, category, action_description, event_date, due_at, occurs_at, kind, confidence, surface_from, surface_until, parent_id, created_at, who_it_affects, urgency_level, status, source_email_subject, source_label, source, created_by, visibility, parent:items!parent_id(id, title, kind, status, collection_id, occurs_at, event_date, due_at), collections(status)',
            viewer,
          )
          .eq('status', 'open')
          .in('kind', [...HOME_RADAR_LOAD_KINDS]),
        visibleFamilyMembersSelect('id, role, first_name, last_name', viewer),
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
      .filter((card): card is PlanItemCardModel => !!card);
    setSpotlight(actionCards);
    const actionIds = new Set(actionCards.map((card) => card.id));
    const realHappening = openItems
      .filter((item) => !actionIds.has(item.id) && isHappeningToday(item, today))
      .map((item) => ({
        id: item.id,
        title: item.title || 'Untitled',
        time: happenTime(item),
        sub: happenSub(item),
        informational: isInformationalOnSchedule(item),
        icon: resolvePlanIcon({ title: item.title, category: item.category }),
      }));
    setHappening(realHappening.sort((a, b) => happenSortKey(a) - happenSortKey(b)));

    const memberRows = (members as { id: string; role: string; first_name: string | null; last_name: string | null }[] | null) ?? [];
    const cardsOut: FamilyCard[] = memberRows.map((member, index) => {
      const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Family';
      const first = member.first_name?.trim() || name;
      const match = pickItemForPerson(openItems, first, member.role);
      const when = match ? humanizeEventDate(match.occurs_at || match.due_at || match.event_date) : null;
      return {
        key: member.id,
        name: member.first_name?.trim() || name,
        initial: personInitials(member.first_name, member.last_name, name),
        wash: FAMILY_WASH[index % FAMILY_WASH.length],
        photo: null,
        itemTitle: match ? displayItemTitle(match) : null,
        itemWhen: when && when !== 'Today' ? when : match ? fewWords(match.body, 5) : null,
        itemIcon: match ? resolvePlanIcon({ title: match.title, category: match.category }) : null,
      };
    });
    const hasSelf = memberRows.some((member) => {
      const role = (member.role || '').toLowerCase();
      if (role === 'self' || role === 'you') return true;
      const first = member.first_name?.trim().toLowerCase();
      return !!profile?.first_name && first === profile.first_name.trim().toLowerCase();
    });
    if (!hasSelf) {
      const youFirst = profile?.first_name?.trim() || '';
      const youMatch = youFirst ? pickItemForPerson(openItems, youFirst, 'self') : null;
      const youWhen = youMatch ? humanizeEventDate(youMatch.occurs_at || youMatch.due_at || youMatch.event_date) : null;
      cardsOut.unshift({
        key: 'profile',
        name: 'You',
        initial: personInitials(youFirst, null, 'You'),
        wash: colors.sage,
        photo: null,
        itemTitle: youMatch ? displayItemTitle(youMatch) : null,
        itemWhen: youWhen && youWhen !== 'Today' ? youWhen : youMatch ? fewWords(youMatch.body, 5) : null,
        itemIcon: youMatch ? resolvePlanIcon({ title: youMatch.title, category: youMatch.category }) : null,
      });
    }
    setFamily(cardsOut);

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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.screen}
        keyboardShouldPersistTaps="handled">
        <View style={s.homeGreetBlock}>
          <View style={s.homeGreetTitleRow}>
            <Text style={s.homeGreetTitle}>{greetingLine(firstName)}</Text>
            <NoticedStar
              unread={!!noticed && noticed !== noticedSeen}
              onPress={
                noticed
                  ? () => {
                      setNoticedOpen(true);
                      setNoticedSeen(noticed);
                    }
                  : undefined
              }
            />
          </View>
          <Text style={s.homeGreetSub}>Here's what would be helpful to do today.</Text>
        </View>

        {loading ? (
          <View style={s.emptyState}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <>
            <PlanItemFeed
              items={spotlight}
              setItems={setSpotlight}
              empty="When something would be helpful to do, it'll show up here."
              variant="hero"
              header={
                <View style={s.homeCardHead}>
                  <View style={s.homeCardHeadCopy}>
                    <Text style={s.homeSectionLabel}>Today's actions</Text>
                    <Text style={s.homeCardHint}>{actionsSummary(spotlight.length)}</Text>
                  </View>
                  <Pressable onPress={() => router.push('/home/today')}>
                    <Text style={s.homeSeeAll}>See all</Text>
                  </Pressable>
                </View>
              }
            />

            <DayTimelineCard
              items={happening}
              emptyTitle="A quiet one"
              footer={{
                label: 'See full day ›',
                onPress: () => router.push({ pathname: '/plan', params: { tab: 'schedule' } }),
              }}
            />

            {family.length ? (
              <View style={s.homeFamilySection}>
                <View style={s.homeCardHead}>
                  <Text style={s.homeSectionLabel}>Your family</Text>
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
                      onPress={() =>
                        router.push({ pathname: '/plan', params: { tab: 'family', person: member.key } })
                      }>
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
              </View>
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

      <Modal
        visible={noticedOpen && !!noticed}
        transparent
        animationType="fade"
        onRequestClose={() => setNoticedOpen(false)}>
        <Pressable style={s.planModalScrim} onPress={() => setNoticedOpen(false)}>
          <Pressable style={s.homeNoticedModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.homeNoticedHead}>
              <TayloMark size={12} />
              <Text style={s.homeNoticedLabel}>Taylo noticed</Text>
            </View>
            <Text style={s.homeNoticedText}>{noticed}</Text>
            <Pressable onPress={() => setNoticedOpen(false)} style={{ marginTop: 14, alignSelf: 'flex-end' }}>
              <Text style={s.homeSeeAll}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
