import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s, iconBg } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

type NudgeStatus = 'open' | 'done' | 'delegated';

type NudgeRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  category: string | null;
  action_description: string | null;
  due_date: string | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  urgent: boolean | null;
  status: NudgeStatus | null;
  source_email_subject: string | null;
  suggestion: string | null;
};

type NudgeCard = {
  id: string;
  title: string;
  body: string;
  detail: string;
  category: string;
  categoryLabel: string;
  urgent: boolean;
  icon: string;
  cls: keyof typeof iconBg;
  opener: string;
  src: string;
  suggestion: string | null;
};

function formatSuggestion(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim().replace(/^suggested:\s*/i, '');
  return trimmed || null;
}

const categoryMeta: Record<string, { icon: string; cls: keyof typeof iconBg; label: string }> = {
  school: { icon: '📚', cls: 'blue', label: 'School' },
  medical: { icon: '🏥', cls: 'teal', label: 'Medical' },
  activity: { icon: '🎭', cls: 'purple', label: 'Activity' },
  delivery: { icon: '📦', cls: 'amber', label: 'Delivery' },
  returns: { icon: '↩️', cls: 'rose', label: 'Returns' },
  financial: { icon: '💳', cls: 'green', label: 'Financial' },
};

function formatCategory(category: string | null) {
  const key = (category || '').toLowerCase();
  if (categoryMeta[key]) return categoryMeta[key];
  if (!category) return { icon: '📌', cls: 'rose' as const, label: 'Nudge' };
  return {
    icon: '📌',
    cls: 'rose' as const,
    label: category.charAt(0).toUpperCase() + category.slice(1),
  };
}

function mapNudge(row: NudgeRow): NudgeCard {
  const meta = formatCategory(row.category);
  const title = row.title || 'Nudge';
  const body = row.body || '';
  const detail = row.detail || row.action_description || body;
  return {
    id: row.id,
    title,
    body,
    detail,
    category: row.category || '',
    categoryLabel: meta.label,
    urgent: !!row.urgent,
    icon: meta.icon,
    cls: meta.cls,
    opener: row.action_description || body,
    src: row.source_email_subject || meta.label,
    suggestion: formatSuggestion(row.suggestion),
  };
}

export default function TodayScreen() {
  const [nudges, setNudges] = useState<NudgeCard[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { openItem } = useChat();

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNudges([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('nudges')
      .select(
        'id, title, body, detail, suggestion, category, action_description, due_date, who_it_affects, urgency_level, urgent, status, source_email_subject',
      )
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('urgent', { ascending: false })
      .order('created_at', { ascending: false });

    setNudges((data as NudgeRow[] | null)?.map(mapNudge) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const urgentCount = nudges.filter((n) => n.urgent).length;

  async function setStatus(nudge: NudgeCard, status: Exclude<NudgeStatus, 'open'>) {
    setNudges((prev) => prev.filter((n) => n.id !== nudge.id));
    const { error } = await supabase.from('nudges').update({ status }).eq('id', nudge.id);
    if (error) {
      setNudges((prev) =>
        [...prev, nudge].sort((a, b) => Number(b.urgent) - Number(a.urgent)),
      );
    }
  }

  async function onChat(nudge: NudgeCard) {
    await openItem(nudge.id, {
      icon: nudge.icon,
      title: nudge.title,
      sub: nudge.src,
      opener: nudge.opener,
      chips: [],
      generateOpener: true,
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
      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={colors.rose} />
        </View>
      ) : nudges.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyStateText}>Nothing needs your attention right now ✨</Text>
        </View>
      ) : (
        nudges.map((n) => {
          const isOpen = !!expanded[n.id];
          return (
            <Pressable
              key={n.id}
              style={[s.nudge, n.urgent && s.nudgeUrgent]}
              onPress={() => setExpanded((p) => ({ ...p, [n.id]: !p[n.id] }))}>
              <Text style={s.nsrc}>{n.categoryLabel}</Text>
              <View style={s.nrow}>
                <View style={[s.nicon, { backgroundColor: iconBg[n.cls] }]}>
                  <Text style={s.niconText}>{n.icon}</Text>
                </View>
                <View style={s.ncopy}>
                  <View style={s.uheadRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ntitle}>{n.title}</Text>
                      <Text style={s.nbody}>{n.body}</Text>
                    </View>
                    <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
                  </View>
                </View>
              </View>
              {isOpen ? (
                <>
                  {n.detail ? <Text style={s.udetail}>{n.detail}</Text> : null}
                  {n.suggestion ? <Text style={s.nsuggest}>{n.suggestion}</Text> : null}
                  <View style={s.nactions}>
                    <Pressable
                      style={[s.pill, s.pillTeal]}
                      onPress={(e) => {
                        e.stopPropagation();
                        void setStatus(n, 'done');
                      }}>
                      <Text style={[s.pillText, s.pillTextTeal]}>✓ Done</Text>
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
                      <Text style={[s.pillText, s.pillTextChat]}>💬 Chat</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
