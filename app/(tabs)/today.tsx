import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s, iconBg } from '@/components/app/styles';
import { type Nudge } from '@/lib/demo-data';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

type NudgeRow = {
  id: string;
  title: string | null;
  body: string | null;
  src: string | null;
  source: string | null;
  icon: string | null;
  cls: string | null;
  urgent: boolean | null;
  badge: string | null;
  opener: string | null;
  chips: Nudge['chips'] | null;
  actions: Nudge['actions'] | null;
};

const clsFallback: Nudge['cls'] = 'rose';

function mapNudge(row: NudgeRow): Nudge {
  const cls = (row.cls as Nudge['cls']) || clsFallback;
  return {
    id: row.id,
    urgent: !!row.urgent,
    icon: row.icon || '📌',
    cls: cls in iconBg ? cls : clsFallback,
    badge: row.badge,
    title: row.title || 'Nudge',
    src: row.src || row.source || '',
    body: row.body || '',
    opener: row.opener || row.body || '',
    chips: row.chips || [],
    actions: row.actions || [{ t: '✓ Done', cls: 'bd' }],
  };
}

export default function TodayScreen() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const { openItem } = useChat();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: nudgeRows } = await supabase.from('nudges').select('*').eq('user_id', user.id);
      setNudges((nudgeRows as NudgeRow[] | null)?.map(mapNudge) ?? []);
    }

    load();
  }, []);

  const urgentCount = nudges.filter((n) => n.urgent).length;

  function onAction(nudge: Nudge, cls: string) {
    if (cls === 'bdelegate') {
      Alert.alert('Sent!', "They'll get a notification ✉️");
      return;
    }
    setDone((prev) => ({ ...prev, [nudge.id]: true }));
  }

  function onChat(nudge: Nudge) {
    openItem(nudge.id, {
      icon: nudge.icon,
      title: nudge.title,
      sub: nudge.src,
      opener: nudge.opener,
      chips: nudge.chips,
    });
    router.push('/chat');
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <View style={s.tbox}>
        <Text style={s.tboxTitle}>Since you last checked in</Text>
        <Text style={s.tboxBody}>
          Taylo processed <Text style={s.tboxStrong}>12 messages</Text> today —{' '}
          <Text style={s.tboxStrong}>{urgentCount}</Text> {urgentCount === 1 ? 'thing' : 'things'} needing your
          attention, <Text style={s.tboxStrong}>5</Text> added to Ahead, and <Text style={s.tboxStrong}>4</Text> that
          didn't need any action.
        </Text>
      </View>
      <Text style={s.slabel}>Needs your attention</Text>
      {nudges.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyStateText}>Nothing needs your attention right now ✨</Text>
        </View>
      ) : (
        nudges.map((n) => {
          const isDone = !!done[n.id];
          return (
            <View key={n.id} style={[s.nudge, n.urgent && s.nudgeUrgent, isDone && s.nudgeDone]}>
              {n.badge ? (
                <View style={s.ubadge}>
                  <Text style={s.ubadgeText}>{n.badge}</Text>
                </View>
              ) : null}
              {n.src ? <Text style={s.nsrc}>{n.src}</Text> : null}
              <View style={s.nrow}>
                <View style={[s.nicon, { backgroundColor: iconBg[n.cls] }]}>
                  <Text style={s.niconText}>{n.icon}</Text>
                </View>
                <View style={s.ncopy}>
                  <Text style={[s.ntitle, isDone && s.ntitleDone]}>{n.title}</Text>
                  <Text style={s.nbody}>{n.body}</Text>
                </View>
              </View>
              <View style={s.nactions}>
                {isDone ? (
                  <Text style={s.sorted}>✓ Sorted — nice one!</Text>
                ) : (
                  <>
                    {n.actions.map((a) => (
                      <Pressable
                        key={a.t}
                        style={[
                          s.pill,
                          a.cls === 'bd' && s.pillTeal,
                          a.cls === 'bg' && s.pillGray,
                          a.cls === 'bdelegate' && s.pillDelegate,
                        ]}
                        onPress={() => onAction(n, a.cls)}>
                        <Text
                          style={[
                            s.pillText,
                            a.cls === 'bd' && s.pillTextTeal,
                            a.cls === 'bg' && s.pillTextMuted,
                            a.cls === 'bdelegate' && s.pillTextBlue,
                          ]}>
                          {a.t}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable style={[s.pill, s.pillChat]} onPress={() => onChat(n)}>
                      <Text style={[s.pillText, s.pillTextChat]}>💬 Chat</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
