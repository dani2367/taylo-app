import { BrandGlyph, BrandIconDisc } from '@/components/app/BrandIcon';
import { DayTimelineCard } from '@/components/app/DayTimelineCard';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { happenClockLabel, happenSortKey, type HappenItem } from '@/lib/happening';
import { cachedDensityInsight, refreshScheduleDensity } from '@/lib/schedule-density';
import { resolvePlanIcon } from '@/lib/plan-icon';
import {
  bucketAgenda,
  currentWeekDays,
  findBusyDay,
  fallbackDensityLine,
  formatDayLabel,
  formatSelectorLabel,
  LATER_PREVIEW,
  mapAgendaRow,
  MAX_WEEK_OFFSET,
  selectedSectionTitle,
  thingsAheadLabel,
  weekCellInitial,
  weekDaysAtOffset,
  weekSectionLabel,
  ymdLocal,
  type AgendaRow,
  type BusyDay,
  type ScheduleSourceItem,
} from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

const SELECT = 'id, title, body, category, icon, occurs_at, who_it_affects, kind, status';

export function AgendaItemRow({
  item,
  when,
  last,
}: {
  item: AgendaRow;
  when: 'time' | 'date';
  last?: boolean;
}) {
  const left = when === 'time' ? item.timeLabel || '' : item.dateLabel;
  const icon = resolvePlanIcon({ title: item.title, category: item.category, stored: item.storedIcon });
  return (
    <Pressable
      style={[s.homeHeroRow, last && s.homeHeroRowLast]}
      onPress={() => router.push({ pathname: '/plan/item/[itemId]', params: { itemId: item.id } })}>
      <View style={s.nrow}>
        <Text style={when === 'time' ? s.scheduleTime : s.scheduleDate}>{left}</Text>
        <BrandIconDisc name={icon.name} wash={icon.wash} size={36} />
        <View style={s.ncopy}>
          <Text style={s.scheduleItemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.sub ? <Text style={s.homeItemSub}>{item.sub}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function PlanSchedule() {
  const today = useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const week = useMemo(() => weekDaysAtOffset(today, weekOffset), [today, weekOffset]);
  const [selectedYmd, setSelectedYmd] = useState(() => ymdLocal(today));
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [density, setDensity] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyDay | null>(null);

  const selectedDate = useMemo(() => {
    const match = week.find((day) => ymdLocal(day) === selectedYmd);
    if (match) return match;
    const [y, m, d] = selectedYmd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedYmd, week]);

  const buckets = useMemo(() => bucketAgenda(rows, selectedYmd, today), [rows, selectedYmd, today]);
  const laterPreview = buckets.laterThisMonth.slice(0, LATER_PREVIEW);
  const isToday = selectedYmd === ymdLocal(today);
  const selectedHappen: HappenItem[] = useMemo(() => {
    const real = buckets.selected.map((item) => ({
      id: item.id,
      title: item.title,
      time: happenClockLabel(item.timeLabel),
      sub: item.sub,
      icon: resolvePlanIcon({ title: item.title, category: item.category, stored: item.storedIcon }),
    }));
    return real.sort((a, b) => happenSortKey(a) - happenSortKey(b));
  }, [buckets.selected]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setDensity(null);
      setBusy(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('items')
      .select(SELECT)
      .eq('user_id', user.id)
      .eq('status', 'open')
      .eq('kind', 'occurrence')
      .not('occurs_at', 'is', null);

    if (error) {
      console.error('Failed to load schedule items:', error.message);
      setLoading(false);
      return;
    }

    const now = new Date();
    const mapped = ((data as ScheduleSourceItem[] | null) ?? [])
      .map((item) => mapAgendaRow(item, now))
      .filter((item): item is AgendaRow => !!item);
    setRows(mapped);

    const nextBusy = findBusyDay(mapped, currentWeekDays(now), now);
    setBusy(nextBusy);
    if (!nextBusy) {
      setDensity(null);
      setLoading(false);
      return;
    }

    setDensity(cachedDensityInsight(nextBusy.fingerprint) || fallbackDensityLine(nextBusy.weekday, nextBusy.titles));
    setLoading(false);

    const { insight } = await refreshScheduleDensity(nextBusy);
    if (insight) setDensity(insight);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={s.emptyState}>
        <ActivityIndicator color={colors.rose} />
      </View>
    );
  }

  return (
    <>
      {density && busy ? (
        <Pressable
          style={s.scheduleNotice}
          onPress={() => {
            setWeekOffset(0);
            setSelectedYmd(busy.ymd);
          }}
          accessibilityRole="button"
          accessibilityLabel="See the busy day">
          <BrandGlyph name="sparkles-outline" size={18} color={colors.terracotta} />
          <Text style={s.scheduleNoticeText}>{density}</Text>
          <Text style={s.uchevron}>›</Text>
        </Pressable>
      ) : null}

      <View style={s.homeSectionHead}>
        <Text style={s.homeSectionLabel}>{weekSectionLabel(weekOffset)}</Text>
        <Pressable onPress={() => setPicker(true)} hitSlop={8} style={s.scheduleSelector}>
          <Text style={s.homeSeeAll}>{formatSelectorLabel(selectedDate, today)} ▾</Text>
        </Pressable>
      </View>

      <View style={s.scheduleWeekNav}>
        <Pressable
          style={[s.scheduleWeekArrow, weekOffset <= 0 && s.scheduleWeekArrowOff]}
          disabled={weekOffset <= 0}
          onPress={() => {
            const next = weekOffset - 1;
            setWeekOffset(next);
            setSelectedYmd(next <= 0 ? ymdLocal(today) : ymdLocal(weekDaysAtOffset(today, next)[0]));
          }}
          accessibilityRole="button"
          accessibilityLabel="Previous week">
          <Ionicons name="chevron-back" size={18} color={colors.navy} />
        </Pressable>
        <View style={s.scheduleWeek}>
          {week.map((day) => {
            const ymd = ymdLocal(day);
            const on = ymd === selectedYmd;
            return (
              <Pressable
                key={ymd}
                style={[s.scheduleWeekCell, on && s.scheduleWeekCellOn]}
                onPress={() => setSelectedYmd(ymd)}>
                <Text style={[s.scheduleWeekInitial, on && s.scheduleWeekTextOn]}>{weekCellInitial(day)}</Text>
                <Text style={[s.scheduleWeekNum, on && s.scheduleWeekTextOn]}>{day.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={[s.scheduleWeekArrow, weekOffset >= MAX_WEEK_OFFSET && s.scheduleWeekArrowOff]}
          disabled={weekOffset >= MAX_WEEK_OFFSET}
          onPress={() => {
            const next = weekOffset + 1;
            setWeekOffset(next);
            setSelectedYmd(ymdLocal(weekDaysAtOffset(today, next)[0]));
          }}
          accessibilityRole="button"
          accessibilityLabel="Next week">
          <Ionicons name="chevron-forward" size={18} color={colors.navy} />
        </Pressable>
      </View>

      <DayTimelineCard
        kicker={isToday ? 'Today' : selectedSectionTitle(selectedDate, today)}
        items={selectedHappen}
        emptyTitle={rows.length ? (isToday ? 'Nothing on today' : 'Nothing on this day') : undefined}
        onItemPress={(item) => {
          router.push({ pathname: '/plan/item/[itemId]', params: { itemId: item.id } });
        }}
      />

      {buckets.laterThisMonth.length ? (
        <>
          <View style={s.homeSectionHead}>
            <Text style={s.homeSectionLabel}>Later this month</Text>
            {buckets.laterThisMonth.length > LATER_PREVIEW ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/plan/month', params: { selected: selectedYmd } })
                }>
                <Text style={s.homeSeeAll}>View all</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={s.homeHero}>
            {laterPreview.map((item, index) => (
              <AgendaItemRow
                key={item.id}
                item={item}
                when="date"
                last={index === laterPreview.length - 1}
              />
            ))}
          </View>
        </>
      ) : null}

      {buckets.furtherAhead.length ? (
        <>
          <View style={s.homeSectionHead}>
            <Text style={s.homeSectionLabel}>Further ahead</Text>
          </View>
          <View style={s.homeHero}>
            {buckets.furtherAhead.map((group, index) => {
              const open = expandedMonth === group.key;
              const lastGroup = index === buckets.furtherAhead.length - 1;
              return (
                <View key={group.key}>
                  <Pressable
                    style={[s.homeHeroRow, lastGroup && !open && s.homeHeroRowLast]}
                    onPress={() => setExpandedMonth(open ? null : group.key)}>
                    <View style={s.nrow}>
                      <Ionicons
                        name={open ? 'chevron-down' : 'chevron-forward'}
                        size={16}
                        color={colors.textHint}
                      />
                      <View style={s.ncopy}>
                        <Text style={s.homeItemTitle}>
                          {group.label} · {thingsAheadLabel(group.count)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  {open
                    ? group.items.map((item, itemIndex) => (
                        <AgendaItemRow
                          key={item.id}
                          item={item}
                          when="date"
                          last={lastGroup && itemIndex === group.items.length - 1}
                        />
                      ))
                    : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {!rows.length && !selectedHappen.length ? (
        <View style={s.homeReassure}>
          <BrandIconDisc name="calendar-outline" wash="paleBlue" size={32} />
          <View style={s.homeReassureCopy}>
            <Text style={s.homeReassureTitle}>Nothing dated yet</Text>
            <Text style={s.homeReassureSub}>When something has a day, I'll line it up here.</Text>
          </View>
        </View>
      ) : null}

      <Modal visible={picker} animationType="fade" transparent onRequestClose={() => setPicker(false)}>
        <Pressable style={s.planModalScrim} onPress={() => setPicker(false)}>
          <Pressable style={s.planModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.planModalTitle}>{weekSectionLabel(weekOffset)}</Text>
            <Text style={s.planModalHint}>Jump to a day, or use the arrows for next week.</Text>
            {week.map((day) => {
              const ymd = ymdLocal(day);
              const on = ymd === selectedYmd;
              return (
                <Pressable
                  key={ymd}
                  style={[s.schedulePickRow, on && s.schedulePickRowOn]}
                  onPress={() => {
                    setSelectedYmd(ymd);
                    setPicker(false);
                  }}>
                  <Text style={s.homeItemTitle}>{formatSelectorLabel(day, today)}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPicker(false)}>
              <Text style={s.planModalCancel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
