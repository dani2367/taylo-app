import { useChat } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import { TayloWordmark } from '@/components/app/TayloWordmark';
import { MenuIcon, MicIcon, SendIcon } from '@/components/app/TabIcons';
import { colors } from '@/constants/theme';
import { demoFamily } from '@/lib/demo-data';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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

export default function ChatScreen() {
  const { current, conversations, typing, openGeneral, selectConversation, deleteConversation, chooseIntent, send, setEmailState } = useChat();
  const [drawer, setDrawer] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const tabBarSv = useSharedValue(tabBarHeight);
  const lift = useSharedValue(0);

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
          <MenuIcon />
        </Pressable>
        <View style={s.chatLogoCenter} pointerEvents="none">
          <TayloWordmark size={24} />
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
            <Pressable
              style={({ pressed }) => [s.intentBubble, pressed && { opacity: 0.86 }]}
              onPress={() => chooseIntent('offload')}
              accessibilityRole="button"
              accessibilityLabel="Offload">
              <Text style={s.intentBubbleTitle}>Offload</Text>
              <Text style={s.intentBubbleHint}>Dump it on the list</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.intentBubble, pressed && { opacity: 0.86 }]}
              onPress={() => chooseIntent('ask')}
              accessibilityRole="button"
              accessibilityLabel="Ask">
              <Text style={s.intentBubbleTitle}>Ask</Text>
              <Text style={s.intentBubbleHint}>Talk it through</Text>
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

        {(current?.chips ?? []).length > 0 ? (
      <View style={s.chatChips}>
        {(current?.chips ?? []).map((ch) => (
          <Pressable key={ch.label} style={s.chatChipRow} onPress={() => send(ch.msg)}>
            <TayloMark size={11} />
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
                    </Swipeable>
                  );
                })
              )}
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawer(false)} />
        </View>
      ) : null}
    </View>
  );
}
