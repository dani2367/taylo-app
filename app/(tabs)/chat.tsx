import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import { MicIcon, SendIcon } from '@/components/app/TabIcons';
import { demoFamily } from '@/lib/demo-data';
import { colors } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function ChatScreen() {
  const { current, conversations, typing, openGeneral, selectConversation, send, setEmailState } = useChat();
  const [drawer, setDrawer] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [current?.messages.length, typing]);

  const visible = conversations
    .filter((c) => c.messages.some((m) => m.from === 'user'))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  function onSend() {
    const val = input.trim();
    if (!val) return;
    setInput('');
    send(val);
  }

  const lily = demoFamily.kids[1].name;

  return (
    <KeyboardAvoidingView style={s.chatRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.chatSubhead}>
        <Pressable style={s.chatIconBtn} onPress={() => setDrawer(true)} accessibilityLabel="Previous conversations">
          <Text style={s.chatIconBtnText}>☰</Text>
        </Pressable>
        <View style={s.chatThreadAvatar}>
          <Text style={s.chatThreadAvatarText}>{current?.icon ?? 'T'}</Text>
        </View>
        <View style={s.chatThreadText}>
          <Text style={s.chatThreadTitle} numberOfLines={1}>
            {current?.title ?? 'Taylo'}
          </Text>
          <Text style={s.chatThreadSub} numberOfLines={1}>
            {current?.sub || (current?.kind === 'general' ? 'New chat' : '')}
          </Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.chatMsgs} keyboardShouldPersistTaps="handled">
        {(current?.messages ?? []).map((m, i) => (
          <View key={`${i}-${m.text.slice(0, 12)}`} style={[s.bubble, m.from === 'user' ? s.bubbleUser : s.bubbleTaylo]}>
            {m.from === 'taylo' ? <Text style={s.bsender}>Taylo</Text> : null}
            <Text style={[s.bubbleText, m.from === 'user' ? s.bubbleTextUser : s.bubbleTextTaylo]}>{m.text}</Text>
            {m.emailCard && m.from === 'taylo' ? (
              <View style={s.ecard}>
                {m.emailState === 'added' ? (
                  <Text style={s.sorted}>✕ Added to calendar · reminder set for 18 June</Text>
                ) : m.emailState === 'skipped' ? (
                  <Text style={[s.sorted, { color: colors.textHint }]}>Got it — I'll skip these unless you ask 👍</Text>
                ) : (
                  <>
                    <View style={s.ecardTop}>
                      <Text>🏥</Text>
                      <View>
                        <Text style={s.ecardTitle}>GP appointment detected</Text>
                        <Text style={s.ecardFrom}>From: nhs.net · just now</Text>
                      </View>
                    </View>
                    <Text style={s.ecardDetail}>
                      {lily} — 2-year check-up{'\n'}Thu 19 June · 10:30am · Wimbledon HC
                    </Text>
                    <View style={s.ecardBtns}>
                      <Pressable style={s.ecardYes} onPress={() => setEmailState('added')}>
                        <Text style={s.ecardYesText}>✓ Add to calendar</Text>
                      </Pressable>
                      <Pressable style={s.ecardNo} onPress={() => setEmailState('skipped')}>
                        <Text style={s.ecardNoText}>Not relevant</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : null}
          </View>
        ))}
        {typing ? (
          <View style={s.typing}>
            <View style={s.tdot} />
            <View style={s.tdot} />
            <View style={s.tdot} />
          </View>
        ) : null}
      </ScrollView>

      <View style={s.chatChips}>
        {(current?.chips ?? []).map((ch) => (
          <Pressable key={ch.label} onPress={() => send(ch.msg)}>
            <Text style={s.chatChip}>{ch.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.chatBar}>
        <Pressable style={[s.chatRoundBtn, s.chatMic]} onPress={() => Alert.alert('🎙️ Voice input — available in the live app')}>
          <MicIcon />
        </Pressable>
        <TextInput
          style={s.chatInput}
          placeholder="Ask Taylo anything..."
          placeholderTextColor={colors.textHint}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={onSend}
        />
        <Pressable style={[s.chatRoundBtn, s.chatSend]} onPress={onSend}>
          <SendIcon />
        </Pressable>
      </View>

      {drawer ? (
        <View style={s.drawer}>
          <View style={s.drawerPanel}>
            <View style={s.cdHeader}>
              <Text style={s.cdTitle}>Conversations</Text>
              <Pressable style={s.cdClose} onPress={() => setDrawer(false)}>
                <Text style={s.cdCloseText}>✕</Text>
              </Pressable>
            </View>
            <Pressable
              style={s.cdNew}
              onPress={() => {
                openGeneral();
                setDrawer(false);
              }}>
              <Text style={s.cdNewText}>+ New chat</Text>
            </Pressable>
            <ScrollView>
              {visible.length === 0 ? (
                <Text style={s.cdEmpty}>
                  No conversations yet — reply in a chat to save it here, or start a new one.
                </Text>
              ) : (
                visible.map((c) => {
                  const last = c.messages[c.messages.length - 1];
                  const preview = last
                    ? `${last.from === 'user' ? 'You: ' : ''}${last.text.replace(/\s+/g, ' ').slice(0, 44)}`
                    : '';
                  const active = c.id === current?.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[s.cdItem, active && s.cdItemActive]}
                      onPress={() => {
                        selectConversation(c.id);
                        setDrawer(false);
                      }}>
                      <View style={s.cdItemIcon}>
                        <Text style={{ fontSize: 12 }}>{c.icon}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.cdItemTitle} numberOfLines={1}>
                          {c.title}
                        </Text>
                        <Text style={s.cdItemPreview} numberOfLines={1}>
                          {preview}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawer(false)} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
