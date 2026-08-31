import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import {
  aheadNoticedText,
  demoChecklists,
  genericAheadChips,
  genericAheadOpener,
  splitIconTitle,
  type AheadItem,
  type Checklist,
} from '@/lib/demo-data';
import { colors, fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

const headColors = {
  rose: { bg: colors.roseLight, title: colors.roseDeep, sub: colors.roseDark, progBg: colors.roseLight, progFg: colors.roseDark, progBorder: colors.rose },
  blue: { bg: colors.blueLight, title: colors.blueDeep, sub: colors.blueMid, progBg: colors.blueLight, progFg: colors.blue, progBorder: colors.blueProgBorder },
  amber: { bg: colors.amberLight, title: colors.amberDeep, sub: colors.amberMid, progBg: colors.amberLight, progFg: colors.amber, progBorder: colors.amberProgBorder },
};

type AheadRow = {
  id: string;
  title: string | null;
  sub: string | null;
  subtitle: string | null;
  day: string | number | null;
  month: string | null;
  date: string | null;
  item_date: string | null;
  opener: string | null;
  chips: AheadItem['chips'] | null;
  email_card: boolean | null;
};

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function mapAhead(row: AheadRow): AheadItem {
  const rawDate = row.date || row.item_date;
  let day = row.day != null ? String(row.day) : '';
  let month = row.month || '';
  if ((!day || !month) && rawDate) {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) {
      if (!day) day = String(d.getDate());
      if (!month) month = shortMonths[d.getMonth()];
    }
  }
  return {
    id: row.id,
    day: day || '—',
    month,
    title: row.title || 'Upcoming',
    sub: row.sub || row.subtitle || '',
    opener: row.opener || undefined,
    chips: row.chips || undefined,
    emailCard: !!row.email_card,
  };
}

export default function AheadScreen() {
  const [aheadItems, setAheadItems] = useState<AheadItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [aheadDone, setAheadDone] = useState<Record<string, boolean>>({});
  const [openLists, setOpenLists] = useState<Record<string, boolean>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    demoChecklists.forEach((l) => {
      l.items.forEach((item, i) => {
        if (item.done) init[`${l.id}-${i}`] = true;
      });
    });
    return init;
  });
  const { openItem, openGeneral, send } = useChat();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from('ahead_items').select('*').eq('user_id', user.id);
      setAheadItems((data as AheadRow[] | null)?.map(mapAhead) ?? []);
    }

    load();
  }, []);

  function openAheadChat(item: AheadItem) {
    const { icon, text } = splitIconTitle(item.title);
    const detail = item.opener || genericAheadOpener(text, item.sub);
    openItem(item.id, {
      icon,
      title: text,
      sub: item.sub,
      opener: detail,
      chips: item.chips || genericAheadChips,
      emailCard: item.emailCard,
    });
    router.push('/chat');
  }

  function openChecklistChat(list: Checklist) {
    const { icon, text } = splitIconTitle(list.title);
    const remaining = list.items
      .map((item, i) => ({ item, i }))
      .filter(({ item, i }) => !ticks[`${list.id}-${i}`])
      .map(({ item }) => item.text);
    const openerList = remaining.length
      ? remaining.map((t) => `• ${t}`).join('\n')
      : "Looks like everything's ticked off already — nice work!";
    openItem(list.id, {
      icon,
      title: text,
      sub: 'Checklist',
      opener: `Let's work through your ${text} checklist together. Here's what's left:\n\n${openerList}`,
      chips: [
        { label: "What's most urgent?", msg: 'What should I do first on this checklist?' },
        { label: 'Add another item', msg: 'Add an item to this checklist' },
      ],
    });
    router.push('/chat');
  }

  function generateChecklist() {
    openGeneral();
    router.push('/chat');
    setTimeout(() => send('Can you generate a checklist for me?'), 400);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <View style={s.tbox}>
        <Text style={s.tboxTitle}>Taylo noticed…</Text>
        <Text style={s.tboxBody}>{aheadNoticedText()}</Text>
      </View>

      <Text style={s.slabel}>Coming up</Text>
      {aheadItems.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyStateText}>No upcoming items yet</Text>
        </View>
      ) : (
        aheadItems.map((item) => {
        const isOpen = !!expanded[item.id];
        const isDone = !!aheadDone[item.id];
        const { text } = splitIconTitle(item.title);
        const detail = item.opener || genericAheadOpener(text, item.sub);
        return (
          <Pressable
            key={item.id}
            style={[s.uitem, isDone && s.uitemDone]}
            onPress={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}>
            <View style={s.udate}>
              <Text style={s.uday}>{item.day}</Text>
              <Text style={s.umonth}>{item.month}</Text>
            </View>
            <View style={s.udiv} />
            <View style={s.ubody}>
              <View style={s.uheadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.utitle, isDone && s.utitleDone]}>{item.title}</Text>
                  <Text style={s.usub}>{item.sub}</Text>
                </View>
                <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
              </View>
              {isOpen ? (
                <>
                  <Text style={s.udetail}>{detail}</Text>
                  <View style={s.uactions}>
                    {isDone ? (
                      <Text style={s.sorted}>✓ Sorted — nice one!</Text>
                    ) : (
                      <>
                        <Pressable
                          style={[s.pill, s.pillTeal]}
                          onPress={() => setAheadDone((p) => ({ ...p, [item.id]: true }))}>
                          <Text style={[s.pillText, s.pillTextTeal]}>✓ Mark done</Text>
                        </Pressable>
                        <Pressable style={[s.pill, s.pillChat]} onPress={() => openAheadChat(item)}>
                          <Text style={[s.pillText, s.pillTextChat]}>💬 Chat</Text>
                        </Pressable>
                        <Pressable style={[s.pill, s.pillGray]} onPress={() => Alert.alert('Edit — available in the live app')}>
                          <Text style={[s.pillText, s.pillTextMuted]}>✏️ Edit</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </>
              ) : null}
            </View>
          </Pressable>
        );
      })
      )}

      <Text style={s.slabel}>Your checklists ✅</Text>
      <Text style={s.clHint}>Taylo creates these when it spots something coming up. Tap to work through them.</Text>

      {demoChecklists.map((list) => {
        const theme = headColors[list.headBg];
        const open = !!openLists[list.id];
        const doneCount = list.items.filter((_, i) => ticks[`${list.id}-${i}`]).length;
        const complete = doneCount === list.items.length;
        return (
          <View key={list.id} style={s.hcard}>
            <Pressable style={[s.hhead, { backgroundColor: theme.bg }]} onPress={() => setOpenLists((p) => ({ ...p, [list.id]: !p[list.id] }))}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.hheadTitle, { color: theme.title }]}>{list.title}</Text>
                <Text style={[s.hheadSub, { color: theme.sub }]}>{list.sub}</Text>
              </View>
              <View style={s.clActions}>
                <Pressable
                  style={[s.clIconBtn, s.clIconBtnEdit]}
                  onPress={() => Alert.alert('Edit — available in the live app')}>
                  <Text style={s.clIconBtnText}>✏️</Text>
                </Pressable>
                <Pressable style={[s.clIconBtn, s.clIconBtnChat]} onPress={() => openChecklistChat(list)}>
                  <Text style={s.clIconBtnText}>💬</Text>
                </Pressable>
                <View
                  style={[
                    s.clProg,
                    {
                      backgroundColor: complete ? colors.tealLight : theme.progBg,
                      borderWidth: 1,
                      borderColor: complete ? colors.teal : theme.progBorder,
                    },
                  ]}>
                  <Text style={{ fontSize: 9, fontFamily: fonts.sansSemiBold, color: complete ? colors.teal : theme.progFg }}>
                    {doneCount}/{list.items.length}
                  </Text>
                </View>
              </View>
            </Pressable>
            {open
              ? list.items.map((item, i) => {
                  const on = !!ticks[`${list.id}-${i}`];
                  const last = i === list.items.length - 1;
                  return (
                    <Pressable
                      key={`${list.id}-${i}`}
                      style={[s.hitem, last && s.hitemLast]}
                      onPress={() => setTicks((p) => ({ ...p, [`${list.id}-${i}`]: !on }))}>
                      <View style={[s.hcheck, on && s.hcheckOn]}>{on ? <Text style={s.hcheckMark}>✓</Text> : null}</View>
                      <Text style={[s.htext, on && s.htextDone]}>{item.text}</Text>
                      <Text style={s.hwhen}>{item.when}</Text>
                    </Pressable>
                  );
                })
              : null}
          </View>
        );
      })}

      <Pressable style={s.newClBtn} onPress={generateChecklist}>
        <View style={s.newClIcon}>
          <Text style={s.newClIconText}>+</Text>
        </View>
        <View>
          <Text style={s.newClText}>Generate a new checklist</Text>
          <Text style={s.newClSub}>Holiday, back to school, party prep, new baby…</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}
