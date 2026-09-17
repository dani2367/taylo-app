import { BrandIconDisc } from '@/components/app/BrandIcon';
import { PlanFamily } from '@/components/app/PlanFamily';
import { PlanItemFeed } from '@/components/app/PlanItemFeed';
import { PlanSchedule } from '@/components/app/PlanSchedule';
import { appStyles as s } from '@/components/app/styles';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';
import { colors } from '@/constants/theme';
import {
  createCustomCollection,
  DEFAULT_LIST_EMOJI,
  GENERAL_TODO_TITLE,
  listActiveCollections,
  organizeStandaloneItems,
} from '@/lib/collections';
import { itemCountLabel } from '@/lib/human-date';
import { ITEM_COUNT_SELECT, PLAN_ITEM_SELECT, mapRadarWatchCard, type PlanItemRow } from '@/lib/plan-item-map';
import { resolvePlanIcon, type PlanIconSpec } from '@/lib/plan-icon';
import { nestedListCount, isListHubTitle } from '@/lib/radar-organize';
import { RADAR_PREVIEW, type RadarItem } from '@/lib/radar';
import { exceptHomeActions, HOME_RADAR_LOAD_KINDS, selectHomeActions, selectRadarWatch } from '@/lib/placement';
import { viewerForUser, visibleItemsSelect } from '@/lib/item-visibility';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type PlanTab = 'radar' | 'schedule' | 'family';

const TABS: { id: PlanTab; label: string }[] = [
  { id: 'radar', label: 'Radar' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'family', label: 'Family' },
];

const TAB_COPY: Record<PlanTab, { sub: string; desc: string }> = {
  radar: {
    sub: 'On your radar',
    desc: "Lists, reminders, and everything I'm holding a little further out.",
  },
  schedule: {
    sub: 'Your schedule',
    desc: "What's coming up, when it actually matters.",
  },
  family: {
    sub: 'Your family',
    desc: "Who's doing what, and what they might need.",
  },
};

const LIST_EMOJIS = ['📝', '🛒', '✈️', '🎂', '🏠', '📚', '🎁', '📌', '📦', '🦷'];

type ListCard = {
  id: string;
  title: string;
  emoji: string | null;
  icon: PlanIconSpec;
  count: number;
  type: string;
};

type ItemCountRow = {
  id: string;
  title: string | null;
  collection_id: string | null;
  prep_children?: { status: string | null }[] | { status: string | null } | null;
};

function listCount(members: ItemCountRow[], collectionTitle: string): number {
  if (collectionTitle === GENERAL_TODO_TITLE) {
    return members.filter((row) => !isListHubTitle(row.title)).length;
  }
  let n = 0;
  for (const row of members) {
    const openPrep = nestedListCount(row.prep_children);
    n += openPrep;
  }
  return n;
}

export default function PlanScreen() {
  const { tab: tabParam, person: personParam } = useLocalSearchParams<{
    tab?: string | string[];
    person?: string | string[];
  }>();
  const requestedTab = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const requestedPerson = Array.isArray(personParam) ? personParam[0] : personParam;
  const [tab, setTab] = useState<PlanTab>(
    requestedTab === 'schedule' || requestedTab === 'family' ? requestedTab : 'radar',
  );
  const [lists, setLists] = useState<ListCard[]>([]);
  const [radar, setRadar] = useState<PlanItemCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [listName, setListName] = useState('');
  const [listEmoji, setListEmoji] = useState(DEFAULT_LIST_EMOJI);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listKeyboardInset, setListKeyboardInset] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scheduleOffsetY = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      setListKeyboardInset(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setListKeyboardInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (requestedTab === 'schedule' || requestedTab === 'family' || requestedTab === 'radar') {
      setTab(requestedTab);
    }
  }, [requestedTab]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLists([]);
      setRadar([]);
      setLoading(false);
      return;
    }

    await organizeStandaloneItems(user.id);

    const collections = await listActiveCollections(user.id);
    const ids = collections.map((row) => row.id);
    const viewer = await viewerForUser(user.id);
    let members: ItemCountRow[] = [];
    if (ids.length) {
      const { data } = await visibleItemsSelect(ITEM_COUNT_SELECT, viewer)
        .eq('status', 'open')
        .is('parent_id', null)
        .in('collection_id', ids);
      members = (data as ItemCountRow[] | null) ?? [];
    }
    const byCollection = new Map<string, ItemCountRow[]>();
    for (const row of members) {
      if (!row.collection_id) continue;
      const list = byCollection.get(row.collection_id) ?? [];
      list.push(row);
      byCollection.set(row.collection_id, list);
    }
    setLists(
      collections
        .map((row) => ({
          id: row.id,
          title: row.title,
          emoji: row.emoji,
          icon: resolvePlanIcon({ title: row.title, collectionType: row.type, stored: row.emoji }),
          count: listCount(byCollection.get(row.id) ?? [], row.title),
          type: row.type,
        }))
        .filter(
          (row) =>
            row.count > 0 ||
            (row.type !== 'shopping' && row.type !== 'todo' && row.title !== GENERAL_TODO_TITLE),
        ),
    );

    const { data: itemData, error } = await visibleItemsSelect(
      `${PLAN_ITEM_SELECT}, created_at, source, collection_id, parent_id`,
      viewer,
    )
      .eq('status', 'open')
      .in('kind', [...HOME_RADAR_LOAD_KINDS]);

    if (error) {
      console.error('Failed to load radar items:', error.message);
      setLoading(false);
      return;
    }

    const today = new Date();
    const all = (itemData as (PlanItemRow & RadarItem)[] | null) ?? [];
    const home = selectHomeActions(all, { today });
    const later = exceptHomeActions(selectRadarWatch(all, today), home);
    setRadar(later.map((card) => mapRadarWatchCard(card, today)));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveList() {
    setSaving(true);
    setCreateError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCreateError('You need to be signed in.');
      setSaving(false);
      return;
    }
    const { collection, error } = await createCustomCollection(user.id, listName, listEmoji);
    setSaving(false);
    if (error || !collection) {
      setCreateError(error || 'Could not create that list.');
      return;
    }
    setLists((prev) => [
      ...prev,
      {
        id: collection.id,
        title: collection.title,
        emoji: collection.emoji,
        icon: resolvePlanIcon({
          title: collection.title,
          collectionType: collection.type,
          stored: collection.emoji,
        }),
        count: 0,
        type: collection.type,
      },
    ]);
    setCreating(false);
    setListName('');
    setListEmoji(DEFAULT_LIST_EMOJI);
  }

  const copy = TAB_COPY[tab];

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={s.screen}
      keyboardShouldPersistTaps="handled">
      <View style={s.homeGreetBlock}>
        <Text style={s.homeGreetTitle}>Plan</Text>
        <Text style={s.homeGreetSub}>{copy.sub}</Text>
      </View>

      <View style={s.planSeg}>
        {TABS.map((entry) => {
          const active = tab === entry.id;
          return (
            <Pressable
              key={entry.id}
              style={[s.planSegItem, active && s.planSegItemActive]}
              onPress={() => setTab(entry.id)}>
              <Text style={[s.planSegText, active && s.planSegTextActive]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'radar' ? (
        loading ? (
          <View style={s.emptyState}>
            <ActivityIndicator color={colors.rose} />
          </View>
        ) : (
          <>
            <View style={s.homeHero}>
              <View style={s.homeCardHead}>
                <Text style={s.homeSectionLabel}>Your lists</Text>
              </View>
              {lists.map((list) => (
                <Pressable
                  key={list.id}
                  style={s.homeHeroRow}
                  onPress={() =>
                    router.push({ pathname: '/plan/list/[collectionId]', params: { collectionId: list.id } })
                  }>
                  <View style={s.nrow}>
                    <View style={{ flexShrink: 0 }}>
                      <BrandIconDisc name={list.icon.name} wash={list.icon.wash} size={36} />
                    </View>
                    <View style={s.ncopy}>
                      <Text style={s.homeItemTitle}>{list.title}</Text>
                      <Text style={s.homeItemSub}>{itemCountLabel(list.count)}</Text>
                    </View>
                    <Text style={s.uchevron}>›</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                style={[s.homeHeroRow, s.homeHeroRowLast]}
                onPress={() => {
                  setCreateError(null);
                  setCreating(true);
                }}>
                <View style={s.nrow}>
                  <BrandIconDisc name="add-outline" wash="sage" size={36} />
                  <View style={s.ncopy}>
                    <Text style={s.homeItemTitle}>Add a new list</Text>
                  </View>
                </View>
              </Pressable>
            </View>

            <PlanItemFeed
              items={radar}
              setItems={setRadar}
              empty="Nothing waiting further out — I'll keep watch."
              variant="hero"
              maxVisible={RADAR_PREVIEW}
              header={
                <View style={s.homeCardHead}>
                  <Text style={s.homeSectionLabel}>Keeping an eye on</Text>
                  {radar.length ? (
                    <Pressable onPress={() => router.push('/plan/later')}>
                      <Text style={s.homeSeeAll}>See all</Text>
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          </>
        )
      ) : tab === 'schedule' ? (
        <View onLayout={(event) => { scheduleOffsetY.current = event.nativeEvent.layout.y; }}>
          <PlanSchedule
            onJumpTo={(localY) => {
              scrollRef.current?.scrollTo({
                y: Math.max(0, scheduleOffsetY.current + localY - 20),
                animated: true,
              });
            }}
          />
        </View>
      ) : (
        <PlanFamily focusPerson={requestedPerson} />
      )}

      <Modal visible={creating} animationType="fade" transparent onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={[
              s.planModalScrim,
              listKeyboardInset > 0 && s.planModalScrimAboveKeyboard,
              listKeyboardInset > 0 && Platform.OS === 'android' ? { paddingBottom: listKeyboardInset + 12 } : null,
            ]}
            onPress={() => setCreating(false)}>
            <Pressable
              style={[
                s.planModalCard,
                listKeyboardInset > 0 && {
                  maxHeight: Math.max(240, windowHeight - listKeyboardInset - 28),
                },
              ]}
              onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
                <Text style={s.planModalTitle}>New list</Text>
                <Text style={s.planModalHint}>Name it, pick an emoji if you like, and I'll keep it on your radar.</Text>
                <TextInput
                  style={s.planModalInput}
                  placeholder="e.g. Holiday packing"
                  placeholderTextColor={colors.textHint}
                  value={listName}
                  onChangeText={setListName}
                  autoFocus
                />
                <View style={s.planEmojiRow}>
                  {LIST_EMOJIS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={[s.planEmojiPick, listEmoji === emoji && s.planEmojiPickOn]}
                      onPress={() => setListEmoji(emoji)}>
                      <Text style={s.planGlyphEmoji}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                {createError ? <Text style={s.planModalError}>{createError}</Text> : null}
                <Pressable
                  style={[s.planModalSave, (!listName.trim() || saving) && { opacity: 0.6 }]}
                  disabled={!listName.trim() || saving}
                  onPress={() => void saveList()}>
                  <Text style={s.planModalSaveText}>{saving ? 'Saving…' : 'Create list'}</Text>
                </Pressable>
                <Pressable onPress={() => setCreating(false)}>
                  <Text style={s.planModalCancel}>Cancel</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
