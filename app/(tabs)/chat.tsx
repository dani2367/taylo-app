import { BrandIconDisc } from '@/components/app/BrandIcon';
import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import { HistoryIcon, MicIcon, SendIcon } from '@/components/app/TabIcons';
import { TayloMark } from '@/components/app/TayloMark';
import { TayloWordmark } from '@/components/app/TayloWordmark';
import { colors } from '@/constants/theme';
import { demoFamily } from '@/lib/demo-data';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function keyboardEasing(easing?: KeyboardEvent['easing']) {
  switch (easing) {
    case 'easeIn':
      return Easing.in(Easing.quad);
    case 'easeOut':
      return Easing.out(Easing.quad);
    case 'easeInEaseOut':
      return Easing.inOut(Easing.quad);
    case 'linear':
      return Easing.linear;
    default:
      return Easing.bezier(0.17, 0.59, 0.4, 0.77);
  }
}

function liftFromKeyboard(e: KeyboardEvent, tabBar: number) {
  const windowH = Dimensions.get('window').height;
  const visible = Math.max(0, windowH - e.endCoordinates.screenY);
  return Math.max(0, visible - tabBar);
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function conversationDateLabel(ts: number) {
  const date = startOfLocalDay(new Date(ts));
  const today = startOfLocalDay(new Date());
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function conversationRowTitle(title: string, messages: { from: string; text: string }[]) {
  const generic = /^(taylo|new chat|chat)$/i.test(title.trim());
  if (!generic && title.trim()) return title;
  const firstUser = messages.find((m) => m.from === 'user')?.text.replace(/\s+/g, ' ').trim();
  if (!firstUser) return title || 'Chat';
  return firstUser.length > 48 ? `${firstUser.slice(0, 46)}…` : firstUser;
}

export default function ChatScreen() {
  const { current, conversations, typing, openGeneral, selectConversation, deleteConversation, chooseIntent, send, setEmailState } = useChat();
  const [drawer, setDrawer] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const tabBarSv = useSharedValue(tabBarHeight);
  const lift = useSharedValue(0);
  const insets = useSafeAreaInsets();

  tabBarSv.value = tabBarHeight;

  useEffect(() => {
    const animateTo = (next: number, e?: KeyboardEvent) => {
      const duration = e?.duration ?? 0;
      if (duration > 0) {
        lift.value = withTiming(next, { duration, easing: keyboardEasing(e?.easing) });
      } else {
        lift.value = withTiming(next, { duration: 250, easing: keyboardEasing('keyboard') });
      }
    };

    const onFrame = (e: KeyboardEvent) => {
      animateTo(liftFromKeyboard(e, tabBarSv.value), e);
    };
    const onHide = (e: KeyboardEvent) => {
      animateTo(0, e);
    };

    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame', onFrame),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', () => {
        lift.value = withTiming(0, { duration: 250, easing: keyboardEasing('keyboard') });
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [lift, tabBarSv]);

  const shiftStyle = useAnimatedStyle(() => ({
    paddingBottom: lift.value,
  }));

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [current?.messages.length, typing]);

  const visible = conversations
    .filter((c) => c.messages.some((m) => m.from === 'user'))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  function dismissKeyboard() {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }

  function onSend() {
    const val = input.trim();
    if (!val) return;
    setInput('');
    send(val);
  }

  const lily = demoFamily.kids[1].name;
  const showIntentPicker =
    current?.kind === 'general' &&
    !current.intent &&
    !(current.messages ?? []).some((m) => m.from === 'user');

  return (
    <View style={s.chatRoot}>
      <View style={s.chatSubhead}>
        <Pressable
          style={[s.chatIconBtn, { zIndex: 2 }]}
          onPress={() => {
            dismissKeyboard();
            setDrawer(true);
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Previous conversations">
          <HistoryIcon />
        </Pressable>
        <View style={s.chatLogoCenter} pointerEvents="none">
          <TayloWordmark size={32} />
          {current?.kind === 'item' ? (
            <Text style={s.chatThreadSub} numberOfLines={1}>
              {current.title}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={s.chatClip}>
        {showIntentPicker ? (
          <View style={s.intentPicker}>
            <Text style={s.intentPickerPrompt}>What's on your mind?</Text>
            <Pressable
              style={({ pressed }) => [s.intentBubble, pressed && s.intentBubblePressed]}
              onPress={() => chooseIntent('offload')}
              accessibilityRole="button"
              accessibilityLabel="Offload — quick capture">
              <View style={s.intentIconWrap}>
                <Ionicons name="file-tray-outline" size={22} color={colors.terracotta} />
              </View>
              <View style={s.intentBubbleCopy}>
                <Text style={s.intentBubbleTitle}>Offload</Text>
                <Text style={s.intentBubbleHint}>Quick capture — get it off your mind</Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.intentBubble, pressed && s.intentBubblePressed]}
              onPress={() => chooseIntent('ask')}
              accessibilityRole="button"
              accessibilityLabel="Ask — talk it through">
              <View style={s.intentIconWrap}>
                <Ionicons name="chatbubbles-outline" size={22} color={colors.terracotta} />
              </View>
              <View style={s.intentBubbleCopy}>
                <Text style={s.intentBubbleTitle}>Ask</Text>
                <Text style={s.intentBubbleHint}>Talk it through — a conversation with Taylo</Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <Animated.View style={[s.chatShift, shiftStyle]}>
            <ScrollView
              ref={scrollRef}
              style={s.chatBody}
              contentContainerStyle={s.chatMsgs}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              alwaysBounceVertical>
              <Pressable onPress={dismissKeyboard} style={s.chatMsgsTap}>
                {(current?.messages ?? []).map((m, i) => {
                  const isOpener =
                    m.from === 'taylo' &&
                    current?.kind === 'item' &&
                    !(current?.messages ?? []).slice(0, i).some((prev) => prev.from === 'taylo');
                  return (
                    <View key={m.id ?? `${i}-${m.text.slice(0, 12)}`} style={[s.bubble, m.from === 'user' ? s.bubbleUser : s.bubbleTaylo]}>
                      {m.from === 'taylo' ? <Text style={s.bsender}>Taylo</Text> : null}
                      <Text style={[s.bubbleText, m.from === 'user' ? s.bubbleTextUser : s.bubbleTextTaylo]}>
                        {isOpener ? (
                          <>
                            <TayloMark />{' '}
                          </>
                        ) : null}
                        {m.text}
                      </Text>
                      {m.emailCard && m.from === 'taylo' ? (
                        <View style={s.ecard}>
                          {m.emailState === 'added' ? (
                            <Text style={s.sorted}>✕ Added to calendar · reminder set for 18 June</Text>
                          ) : m.emailState === 'skipped' ? (
                            <Text style={[s.sorted, { color: colors.textHint }]}>Got it — I'll skip these unless you ask</Text>
                          ) : (
                            <>
                              <View style={s.ecardTop}>
                                <BrandIconDisc name="medkit-outline" wash="paleBlue" size={28} />
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
                                  <Text style={s.ecardYesText}>Add to calendar</Text>
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
                  );
                })}
                {typing ? (
                  <View style={s.typing}>
                    <View style={s.tdot} />
                    <View style={s.tdot} />
                    <View style={s.tdot} />
                  </View>
                ) : null}
              </Pressable>
            </ScrollView>

            {(current?.chips ?? []).length > 0 &&
            !(current?.messages ?? []).some((m) => m.from === 'user') &&
            !typing ? (
              <View style={s.chatChips}>
                {(current?.chips ?? []).map((ch) => (
                  <Pressable key={ch.label} style={s.chatChipRow} onPress={() => send(ch.msg)}>
                    <Text style={s.chatChip}>{ch.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={s.chatBar}>
              <Pressable style={[s.chatRoundBtn, s.chatMic]} onPress={() => Alert.alert('Voice input — available in the live app')}>
                <MicIcon />
              </Pressable>
              <TextInput
                ref={inputRef}
                style={s.chatInput}
                placeholder={current?.intent === 'offload' ? "What's on the list..." : 'Ask Taylo anything...'}
                placeholderTextColor={colors.textHint}
                value={input}
                onChangeText={setInput}
                multiline
                blurOnSubmit={false}
                onSubmitEditing={onSend}
              />
              <Pressable style={[s.chatRoundBtn, s.chatSend]} onPress={onSend}>
                <SendIcon />
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>

      {/* History drawer — Modal so it overlays tab bar and status bar */}
      <Modal
        visible={drawer}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawer(false)}
        statusBarTranslucent>
        {/* GestureHandlerRootView required: Modal renders outside the app's GHRV */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={s.drawer}>
            <View style={[s.drawerPanel, { paddingTop: insets.top }]}>
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
              <ScrollView style={s.cdList} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
                {visible.length === 0 ? (
                  <Text style={s.cdEmpty}>
                    No conversations yet — reply in a chat to save it here, or start a new one.
                  </Text>
                ) : (
                  visible.map((c) => {
                    const active = c.id === current?.id;
                    return (
                      <Swipeable
                        key={c.id}
                        overshootRight={false}
                        renderRightActions={() => (
                          <Pressable
                            style={s.cdSwipeDelete}
                            onPress={() => {
                              void deleteConversation(c.id);
                            }}>
                            <Text style={s.cdSwipeDeleteText}>Delete</Text>
                          </Pressable>
                        )}>
                        <Pressable
                          style={[s.cdItem, active && s.cdItemActive]}
                          onPress={() => {
                            selectConversation(c.id);
                            setDrawer(false);
                          }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.cdItemTitle} numberOfLines={1}>
                              {conversationRowTitle(c.title, c.messages)}
                            </Text>
                            <Text style={s.cdItemPreview} numberOfLines={1}>
                              {conversationDateLabel(c.updatedAt)}
                            </Text>
                          </View>
                        </Pressable>
                      </Swipeable>
                    );
                  })
                )}
              </ScrollView>
            </View>
            <Pressable style={{ flex: 1 }} onPress={() => setDrawer(false)} />
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
