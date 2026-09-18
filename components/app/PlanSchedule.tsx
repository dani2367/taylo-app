import { BrandGlyph, BrandIconDisc } from '@/components/app/BrandIcon';
import { DayTimelineCard } from '@/components/app/DayTimelineCard';
import { ScheduleMonthCalendar } from '@/components/app/ScheduleMonthCalendar';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { happenClockLabel, happenSortKey, type HappenItem } from '@/lib/happening';
import { cachedDensityInsight, refreshScheduleDensity } from '@/lib/schedule-density';
import { resolvePlanIcon } from '@/lib/plan-icon';
import {
  addMonthKey,
  bucketAgenda,
  currentWeekDays,
  defaultSelectedYmd,
  findBusyDay,
  fallbackDensityLine,
  laterThisMonthLabel,
  mapAgendaRow,
  monthKeyFromYmd,
  monthPrefix,
  selectedSectionTitle,
  thingsAheadLabel,
  ymdLocal,
  type AgendaRow,
  type BusyDay,
  type ScheduleSourceItem,
} from '@/lib/schedule';
import { viewerForUser, visibleItemsSelect } from '@/lib/item-visibility';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const SELECT = 'id, title, body, category, icon, occurs_at, who_it_affects, kind, status, confidence';

export function AgendaItemRow({
  item,
  when,
  last,
}: {
  item: AgendaRow;
  when: 'time' | 'date';
  last?: boolean;
}) {
  const left = when === 'time' ? (item.informational ? 'Note' : item.timeLabel || '') : item.dateLabel;
  const icon = resolvePlanIcon({ title: item.title, category: item.category, stored: item.storedIcon });
  const muted = item.informational;
  return (
    <Pressable
      style={[s.homeHeroRow, last && s.homeHeroRowLast, muted && s.homeDayRowInfo]}
      onPress={() => router.push({ pathname: '/plan/item/[itemId]', params: { itemId: item.id } })}>
      <View style={s.nrow}>
        <Text style={[when === 'time' ? s.scheduleTime : s.scheduleDate, muted && s.scheduleTimeInfo]}>{left}</Text>
        <BrandIconDisc name={icon.name} wash={icon.wash} size={36} />
        <View style={s.ncopy}>
          <Text style={[s.scheduleItemTitle, muted && s.scheduleItemTitleInfo]} numberOfLines={1}>
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
  const [monthKey, setMonthKey] = useState(() => monthPrefix(today));
  const [selectedYmd, setSelectedYmd] = useState(() => ymdLocal(today));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [density, setDensity] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyDay | null>(null);

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedYmd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedYmd]);

  const buckets = useMemo(
    () => bucketAgenda(rows, selectedYmd, today, monthKey),
    [rows, selectedYmd, today, monthKey],
  );
  const isToday = selectedYmd === ymdLocal(today);
  const markedYmds = useMemo(() => new Set(rows.map((row) => row.ymd)), [rows]);
  const selectedHappen: HappenItem[] = useMemo(() => {
    const real = buckets.selected.map((item) => ({
      id: item.id,
      title: item.title,
      time: item.informational ? 'Note' : happenClockLabel(item.timeLabel),
      sub: item.sub,
      informational: item.informational,
      icon: resolvePlanIcon({ title: item.title, category: item.category, stored: item.storedIcon }),
    }));
    return real.sort((a, b) => happenSortKey(a) - happenSortKey(b));
  }, [buckets.selected]);

  const selectDay = useCallback((ymd: string) => {
    setMonthKey(monthKeyFromYmd(ymd));
    setSelectedYmd(ymd);
  }, []);

  const changeMonth = useCallback(
    (delta: number) => {
      setMonthKey((current) => {
        const next = addMonthKey(current, delta);
        setSelectedYmd(defaultSelectedYmd(next, today));
        return next;
      });
    },
    [today],
  );

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

    const viewer = await viewerForUser(user.id);
    const { data, error } = await visibleItemsSelect(SELECT, viewer)
      .eq('status', 'open')
      .in('kind', ['occurrence', 'context_only'])
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
    <View>
      {density && busy ? (
        <Pressable
          style={s.scheduleNotice}
          onPress={() => selectDay(busy.ymd)}
          accessibilityRole="button"
          accessibilityLabel="See the busy day">
          <BrandGlyph name="sparkles-outline" size={18} color={colors.terracotta} />
          <Text style={s.scheduleNoticeText}>{density}</Text>
          <Text style={s.uchevron}>›</Text>
        </Pressable>
      ) : null}

      <ScheduleMonthCalendar
        monthKey={monthKey}
        selectedYmd={selectedYmd}
        today={today}
        markedYmds={markedYmds}
        expanded={calendarOpen}
        onToggleExpanded={() => setCalendarOpen((open) => !open)}
        onChangeMonth={changeMonth}
        onSelectDay={selectDay}
      />

      <View>
        <DayTimelineCard
          kicker={isToday ? 'Today' : selectedSectionTitle(selectedDate, today)}
          items={selectedHappen}
          emptyTitle={rows.length ? (isToday ? 'Nothing on today' : 'Nothing on this day') : undefined}
          onItemPress={(item) => {
            router.push({ pathname: '/plan/item/[itemId]', params: { itemId: item.id } });
          }}
        />
      </View>

      <View style={s.homeHero}>
        <View style={s.homeCardHead}>
          <Text style={s.homeSectionLabel}>{laterThisMonthLabel(monthKey)}</Text>
        </View>
        {buckets.laterThisMonth.length ? (
          buckets.laterThisMonth.map((item, index) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              when="date"
              last={index === buckets.laterThisMonth.length - 1}
            />
          ))
        ) : (
          <View style={[s.homeHeroRow, s.homeHeroRowLast]}>
            <Text style={s.emptyStateText}>Nothing else this month.</Text>
          </View>
        )}
      </View>

      {buckets.furtherAhead.length ? (
        <View style={s.homeHero}>
          <View style={s.homeCardHead}>
            <Text style={s.homeSectionLabel}>Further ahead</Text>
          </View>
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
    </View>
  );
}
