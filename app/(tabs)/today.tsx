import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s, iconBg } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  source: 'email' | 'chat' | 'manual' | null;
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
  addedByUser: boolean;
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
  errand: { icon: '🛒', cls: 'amber', label: 'Errand' },
  home: { icon: '🏠', cls: 'rose', label: 'Home' },
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

function mapNudge(row: NudgeRow): NudgeCard {
  const addedByUser = row.source === 'manual' || row.source === 'chat';
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
    opener: row.action_description || body || title,
    src: addedByUser ? meta.label : row.source_email_subject || meta.label,
    suggestion: formatSuggestion(row.suggestion) || (addedByUser ? MANUAL_HELP : null),
    addedByUser,
  };
}

export default function TodayScreen() {
  const [nudges, setNudges] = useState<NudgeCard[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
      setNudges([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('nudges')
      .select(
        'id, title, body, detail, suggestion, category, action_description, due_date, who_it_affects, urgency_level, urgent, status, source_email_subject, source',
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

    const category = inferCategory(title, note);
    const meta = formatCategory(category);

    const { data, error } = await supabase
      .from('nudges')
      .insert({
        user_id: user.id,
        title,
        body: note || null,
        detail: note || null,
        suggestion: MANUAL_HELP,
        category,
        icon: meta.icon,
        colour_class: meta.cls,
        source: 'manual',
        source_label: 'Added by you',
        status: 'open',
        urgent: false,
      })
      .select(
        'id, title, body, detail, suggestion, category, action_description, due_date, who_it_affects, urgency_level, urgent, status, source_email_subject, source',
      )
      .single();

    setSaving(false);
    if (error || !data) {
      console.error('Failed to add to-do:', error?.message);
      return;
    }

    const card = mapNudge(data as NudgeRow);
    setNudges((prev) => [card, ...prev]);
    setExpanded((p) => ({ ...p, [card.id]: true }));
    setNewTitle('');
    setNewNote('');
    setAdding(false);
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
      <View style={s.tbox}>
        <Text style={s.tboxTitle}>Since you last checked in</Text>
        <Text style={s.tboxBody}>
          Taylo processed <Text style={s.tboxStrong}>12 messages</Text> today —{' '}
          <Text style={s.tboxStrong}>{urgentCount}</Text> {urgentCount === 1 ? 'thing' : 'things'} needing your
          attention, <Text style={s.tboxStrong}>5</Text> added to Ahead, and <Text style={s.tboxStrong}>4</Text> that
          didn't need any action.
        </Text>
      </View>
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
            <Text style={s.newClText}>Add to Today</Text>
            <Text style={s.newClSub}>Whatever you need to get done</Text>
          </View>
        </Pressable>
      )}
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
            <Swipeable
              key={n.id}
              overshootRight={false}
              renderRightActions={() => (
                <Pressable
                  style={s.nudgeSwipeDelete}
                  onPress={() => void setStatus(n, 'dismissed')}>
                  <Text style={s.nudgeSwipeDeleteText}>Delete</Text>
                </Pressable>
              )}>
            <Pressable
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
                      {n.body ? <Text style={s.nbody}>{n.body}</Text> : null}
                    </View>
                    <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
                  </View>
                </View>
              </View>
              {isOpen ? (
                <>
                  {n.detail && n.detail !== n.body ? <Text style={s.udetail}>{n.detail}</Text> : null}
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
            </Swipeable>
          );
        })
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
