import { BrandIconDisc } from '@/components/app/BrandIcon';
import { TayloWordmark } from '@/components/app/TayloWordmark';
import { signupStyles as s } from '@/components/signup/styles';
import { colors, fonts, fontSizes } from '@/constants/theme';
import {
  cap,
  completeSignup,
  emptyKid,
  expandSteps,
  extraChipLabel,
  initialSignupState,
  parseExtra,
  SIGNUP_STEPS_START,
  validEmail,
  type Kid,
  type SignupState,
  type SignupStep,
  type UserType,
} from '@/lib/signup';
import type { IconName, Wash } from '@/lib/plan-icon';
import { router } from 'expo-router';
import { createElement, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAMILY_OPTS: { name: IconName; wash: Wash; label: string; sub: string; val: UserType }[] = [
  { name: 'person-outline', wash: 'paleBlue', label: 'Just me', sub: 'No partner or kids', val: 'solo' },
  { name: 'heart-outline', wash: 'blush', label: 'Me & a partner', sub: 'No children yet', val: 'partner' },
  { name: 'people-outline', wash: 'sage', label: 'Family with kids', sub: 'One or more children', val: 'family' },
  { name: 'flower-outline', wash: 'blush', label: 'Baby on the way', sub: 'Expecting soon', val: 'expecting' },
];

const CONNS: { name: IconName; wash: Wash; label: string; sub: string; key: string }[] = [
  { name: 'mail-outline', wash: 'paleBlue', label: 'Gmail', sub: 'Newsletters, orders, appointments', key: 'gmail' },
  { name: 'calendar-outline', wash: 'sage', label: 'Google Calendar', sub: 'Events & appointments', key: 'gcal' },
  { name: 'mail-outline', wash: 'blush', label: 'Outlook', sub: 'Alternative email', key: 'outlook' },
  { name: 'calendar-outline', wash: 'paleBlue', label: 'Apple Calendar', sub: 'iOS calendar', key: 'appcal' },
];

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SignupState>(initialSignupState);
  const [steps, setSteps] = useState<SignupStep[]>(SIGNUP_STEPS_START);
  const [index, setIndex] = useState(0);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [continuePressed, setContinuePressed] = useState(false);
  const [shakeX] = useState(() => new Animated.Value(0));
  const [extraText, setExtraText] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [partnerForcedOn, setPartnerForcedOn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = steps[index];
  const showBack = index > 0;
  const pct = Math.round((index / Math.max(steps.length - 1, 1)) * 100);
  const showSkip = step === 'connect' || step === 'extra';
  const skipLabel = step === 'extra' ? 'Skip — finish setup' : 'Skip for now';
  const showContinue = step !== 'type';
  const continueLabel = submitting ? 'Creating your account…' : step === 'summary' ? 'Take me to Taylo →' : 'Continue';
  const partnerToggleOn =
    partnerForcedOn !== null ? partnerForcedOn : state.userType === 'partner' || !!state.partner;

  function shake(key: string) {
    setShakeKey(key);
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -4, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -3, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 3, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start(() => setShakeKey(null));
  }

  function goNext() {
    setIndex((i) => i + 1);
    setExtraText('');
  }

  function goBack() {
    if (submitting) return;
    setSubmitError(null);
    if (index > 0) setIndex(index - 1);
  }

  function onContinue() {
    if (step === 'account') {
      const email = state.email.trim();
      const password = state.password;
      const emailOk = validEmail(email);
      const passwordOk = !!password && password.length >= 8;
      if (!emailOk) {
        shake('email');
        return;
      }
      if (!passwordOk) {
        shake('password');
        return;
      }
      setState((prev) => ({ ...prev, email }));
      goNext();
      return;
    }
    if (step === 'name') {
      const fn = state.name.trim();
      if (!fn) {
        shake('first');
        return;
      }
      setState((prev) => ({ ...prev, name: cap(fn), lastName: cap(prev.lastName.trim()) }));
      goNext();
      return;
    }
    if (step === 'kids') {
      const kids = state.kids.filter((k) => k.name.trim()).map((k) => ({ ...k, name: cap(k.name.trim()) }));
      if (!kids.length) {
        shake('kids');
        return;
      }
      setState((prev) => ({ ...prev, kids }));
      goNext();
      return;
    }
    if (step === 'partner') {
      if (partnerToggleOn) {
        const nm = state.partner.trim();
        if (!nm) {
          shake('partner');
          return;
        }
        setState((prev) => ({ ...prev, partner: cap(nm) }));
      } else {
        setState((prev) => ({ ...prev, partner: '', partnerInvited: false }));
      }
      goNext();
      return;
    }
    if (step === 'summary') {
      if (submitting) return;
      setSubmitError(null);
      setSubmitting(true);
      void completeSignup(state)
        .then((result) => {
          setSubmitting(false);
          if (!result.ok) {
            setSubmitError(result.message);
            return;
          }
          router.replace('/home');
        })
        .catch(() => {
          setSubmitting(false);
          setSubmitError('Something went wrong. Check your connection and try again.');
        });
      return;
    }
    goNext();
  }

  function selectType(val: UserType) {
    setState((prev) => ({ ...prev, userType: val }));
    setPartnerForcedOn(null);
    setSteps((prev) => expandSteps(val, index, prev));
    setTimeout(() => goNext(), 220);
  }

  function updateKid(i: number, patch: Partial<Kid>) {
    setState((prev) => ({
      ...prev,
      kids: prev.kids.map((k, idx) => (idx === i ? { ...k, ...patch } : k)),
    }));
  }

  const summaryRows = [
    { label: 'Name', value: `${state.name} ${state.lastName || ''}`.trim() },
    ...(state.kids.map((k) => k.name).filter(Boolean).length
      ? [{ label: 'Children', value: state.kids.map((k) => k.name).filter(Boolean).join(', ') }]
      : []),
    ...(state.partner
      ? [
          {
            label: 'Partner',
            value: `${state.partner}${state.partnerInvited ? ' (invited)' : ''}`,
          },
        ]
      : []),
    {
      label: 'Connections',
      value: Object.keys(state.connections).length
        ? `${Object.keys(state.connections).length} connected`
        : 'None yet',
    },
    ...(state.extras.length ? [{ label: 'Notes', value: `${state.extras.length} added` }] : []),
  ];

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <View style={[s.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={[s.back, !showBack && s.backHidden]}
          onPress={goBack}
          disabled={!showBack || submitting}
          hitSlop={8}>
          <Text style={s.backText}>←</Text>
        </Pressable>
        <View style={s.topbarBrand}>
          <TayloWordmark size={26} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        key={step}>
        {step === 'account' ? (
          <>
            <Text style={s.eyebrow}>Welcome to Taylo</Text>
            <Text style={s.title}>Create your account</Text>
            <Text style={s.sub}>Start with an email and password.</Text>
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <Animated.View style={shakeKey === 'email' ? { transform: [{ translateX: shakeX }] } : undefined}>
                <TextInput
                  style={[s.input, focused === 'email' && s.inputFocused, shakeKey === 'email' && s.inputShake]}
                  placeholder="e.g. dani@email.com"
                  placeholderTextColor={colors.textHint}
                  value={state.email}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  onChangeText={(email) => setState((p) => ({ ...p, email }))}
                />
              </Animated.View>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <Animated.View
                style={shakeKey === 'password' ? { transform: [{ translateX: shakeX }] } : undefined}>
                <TextInput
                  style={[
                    s.input,
                    focused === 'password' && s.inputFocused,
                    shakeKey === 'password' && s.inputShake,
                  ]}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textHint}
                  value={state.password}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  onChangeText={(password) => setState((p) => ({ ...p, password }))}
                />
              </Animated.View>
            </View>
          </>
        ) : null}

        {step === 'name' ? (
          <>
            <Text style={s.eyebrow}>About you</Text>
            <Text style={s.title}>What should we call you?</Text>
            <Text style={s.sub}>Your first and last name.</Text>
            <View style={s.field}>
              <Text style={s.label}>First name</Text>
              <Animated.View style={shakeKey === 'first' ? { transform: [{ translateX: shakeX }] } : undefined}>
                <TextInput
                  style={[s.input, focused === 'first' && s.inputFocused, shakeKey === 'first' && s.inputShake]}
                  placeholder="e.g. Dani"
                  placeholderTextColor={colors.textHint}
                  value={state.name}
                  autoFocus
                  onFocus={() => setFocused('first')}
                  onBlur={() => setFocused(null)}
                  onChangeText={(name) => setState((p) => ({ ...p, name }))}
                />
              </Animated.View>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Last name</Text>
              <TextInput
                style={[s.input, focused === 'last' && s.inputFocused]}
                placeholder="e.g. Cohen"
                placeholderTextColor={colors.textHint}
                value={state.lastName}
                onFocus={() => setFocused('last')}
                onBlur={() => setFocused(null)}
                onChangeText={(lastName) => setState((p) => ({ ...p, lastName }))}
              />
            </View>
          </>
        ) : null}

        {step === 'type' ? (
          <>
            <Text style={s.eyebrow}>About your household</Text>
            <Text style={s.title}>
              Which best describes your family set up, {state.name || 'there'}?
            </Text>
            <Text style={s.sub}>This helps Taylo tailor what it looks out for.</Text>
            <View style={s.choiceGrid}>
              {FAMILY_OPTS.map((o) => (
                <Pressable
                  key={o.val}
                  style={[s.choice, state.userType === o.val && s.choiceSel]}
                  onPress={() => selectType(o.val)}>
                  <View style={{ marginBottom: 6 }}>
                    <BrandIconDisc name={o.name} wash={o.wash} size={40} />
                  </View>
                  <Text style={s.choiceLabel}>{o.label}</Text>
                  <Text style={s.choiceSub}>{o.sub}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 'kids' ? (
          <>
            <Text style={s.eyebrow}>Your children</Text>
            <Text style={s.title}>Tell us about your children</Text>
            <Text style={s.sub}>
              Names and birthdays — you can add school details later from the Family page.
            </Text>
            <Animated.View style={shakeKey === 'kids' ? { transform: [{ translateX: shakeX }] } : undefined}>
              {state.kids.map((k, i) => (
                <View key={i} style={s.kidRow}>
                  <TextInput
                    style={[s.input, s.inputSm, focused === `kid-n-${i}` && s.inputFocused]}
                    placeholder="Child's name"
                    placeholderTextColor={colors.textHint}
                    value={k.name}
                    onFocus={() => setFocused(`kid-n-${i}`)}
                    onBlur={() => setFocused(null)}
                    onChangeText={(name) => updateKid(i, { name })}
                  />
                  <DateField
                    value={k.birthday}
                    focused={focused === `kid-b-${i}`}
                    onFocus={() => setFocused(`kid-b-${i}`)}
                    onBlur={() => setFocused(null)}
                    onChange={(birthday) => updateKid(i, { birthday })}
                  />
                  {state.kids.length > 1 ? (
                    <Pressable style={s.remove} onPress={() => setState((p) => ({ ...p, kids: p.kids.filter((_, idx) => idx !== i) }))}>
                      <Text style={s.removeText}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Animated.View>
            <Pressable onPress={() => setState((p) => ({ ...p, kids: [...p.kids, emptyKid()] }))}>
              <Text style={s.addRow}>+ Add another child</Text>
            </Pressable>
          </>
        ) : null}

        {step === 'partner' ? (
          <>
            <Text style={s.eyebrow}>Partner</Text>
            <Text style={s.title}>Is there a partner at home?</Text>
            <Text style={s.sub}>Someone who shares the family load with you.</Text>
            <View style={s.toggleRow}>
              <View style={s.toggleCopy}>
                <Text style={s.toggleLabel}>I have a partner</Text>
                <Text style={s.toggleSub}>They can be invited to Taylo too</Text>
              </View>
              <Pressable
                onPress={() => {
                  const next = !partnerToggleOn;
                  setPartnerForcedOn(next);
                  if (!next) setState((p) => ({ ...p, partner: '', partnerInvited: false }));
                }}>
                <View style={[s.switch, partnerToggleOn && s.switchOn]}>
                  <View style={[s.knob, partnerToggleOn && s.knobOn]} />
                </View>
              </Pressable>
            </View>
            {partnerToggleOn ? (
              <View>
                <View style={s.field}>
                  <Text style={s.label}>Partner's first name</Text>
                  <Animated.View
                    style={shakeKey === 'partner' ? { transform: [{ translateX: shakeX }] } : undefined}>
                    <TextInput
                      style={[
                        s.input,
                        focused === 'partner' && s.inputFocused,
                        shakeKey === 'partner' && s.inputShake,
                      ]}
                      placeholder="e.g. James"
                      placeholderTextColor={colors.textHint}
                      value={state.partner}
                      onFocus={() => setFocused('partner')}
                      onBlur={() => setFocused(null)}
                      onChangeText={(partner) => setState((p) => ({ ...p, partner }))}
                    />
                  </Animated.View>
                </View>
                <Pressable
                  style={s.checkboxRow}
                  onPress={() => setState((p) => ({ ...p, partnerInvited: !p.partnerInvited }))}>
                  <View style={[s.checkbox, state.partnerInvited && s.checkboxOn]}>
                    {state.partnerInvited ? <Text style={s.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={s.checkboxLabel}>
                    Invite them to Taylo too — they'll get their own account and see shared family info
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 'connect' ? (
          <>
            <Text style={s.eyebrow}>Connections</Text>
            <Text style={s.title}>Connect your calendar & email</Text>
            <Text style={s.sub}>Taylo reads these to spot what matters for your family.</Text>
            <View style={s.connList}>
              {CONNS.map((c) => {
                const on = !!state.connections[c.key];
                return (
                  <View key={c.key} style={s.connRow}>
                    <BrandIconDisc name={c.name} wash={c.wash} size={32} />
                    <View style={s.connCopy}>
                      <Text style={s.connLabel}>{c.label}</Text>
                      <Text style={s.connSub}>{c.sub}</Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setState((prev) => {
                          const next = { ...prev.connections };
                          if (next[c.key]) delete next[c.key];
                          else next[c.key] = true;
                          return { ...prev, connections: next };
                        })
                      }>
                      <Text style={[s.connBtn, on && s.connBtnOn]}>{on ? 'Connected' : 'Connect'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 'extra' ? (
          <>
            <Text style={s.eyebrow}>Almost done</Text>
            <Text style={s.title}>Anything else on your mind?</Text>
            <Text style={s.sub}>An upcoming appointment, a reminder — anything at all.</Text>
            <TextInput
              style={[s.textarea, focused === 'extra' && s.inputFocused]}
              placeholder="e.g. MOT is due in March"
              placeholderTextColor={colors.textHint}
              multiline
              value={extraText}
              onFocus={() => setFocused('extra')}
              onBlur={() => setFocused(null)}
              onChangeText={setExtraText}
            />
            <Pressable
              onPress={() => {
                const val = extraText.trim();
                if (!val) return;
                setState((prev) => ({ ...prev, extras: [...prev.extras, parseExtra(val)] }));
                setExtraText('');
              }}>
              <Text style={s.addRow}>+ Add</Text>
            </Pressable>
            <View style={s.chipList}>
              {state.extras.map((e, i) => (
                <View key={`${e.title}-${i}`} style={s.chip}>
                  <Text style={s.chipText}>{extraChipLabel(e.title)}</Text>
                  <Pressable onPress={() => setState((p) => ({ ...p, extras: p.extras.filter((_, idx) => idx !== i) }))}>
                    <Text style={s.chipX}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {step === 'summary' ? (
          <>
            <Text style={s.eyebrow}>All set</Text>
            <Text style={s.title}>Nice to meet you, {state.name}</Text>
            <Text style={s.sub}>Here's what Taylo's got so far:</Text>
            <View style={s.summaryCard}>
              {summaryRows.map((row, i) => (
                <View key={row.label} style={[s.summaryRow, i === summaryRows.length - 1 && s.summaryRowLast]}>
                  <Text style={s.summaryKey}>{row.label}</Text>
                  <Text style={s.summaryVal}>{row.value}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.sub, s.subAfter]}>
              You can add school details, medical notes and more from the Family page any time.
            </Text>
            {submitError ? (
              <View style={s.errorBanner} accessibilityLiveRegion="polite">
                <Text style={s.errorBannerText}>{submitError}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 22), borderTopWidth: 0, paddingHorizontal: 0, paddingTop: 18 }]}>
          {showSkip ? (
            <Pressable onPress={goNext}>
              <Text style={s.skip}>{skipLabel}</Text>
            </Pressable>
          ) : null}
          {showContinue ? (
            <Pressable
              style={[s.continue, (continuePressed || submitting) && { transform: [{ scale: 0.98 }] }, submitting && s.continueDisabled]}
              disabled={submitting}
              onPressIn={() => setContinuePressed(true)}
              onPressOut={() => setContinuePressed(false)}
              onPress={onContinue}>
              {submitting ? (
                <View style={s.continueInner}>
                  <ActivityIndicator color={colors.cream} size="small" />
                  <Text style={s.continueText}>{continueLabel}</Text>
                </View>
              ) : (
                <Text style={s.continueText}>{continueLabel}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DateField({
  value,
  onChange,
  focused,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      onFocus,
      onBlur,
      style: {
        flex: 1,
        minWidth: 0,
        borderWidth: 1.5,
        borderStyle: 'solid',
        borderColor: focused ? colors.terracotta : colors.border,
        borderRadius: 11,
        paddingTop: 9,
        paddingBottom: 9,
        paddingLeft: 11,
        paddingRight: 11,
        fontSize: fontSizes.body,
        fontFamily: fonts.sansRegular,
        color: colors.text,
        backgroundColor: colors.cream,
        outline: 'none',
      },
    });
  }

  return (
    <TextInput
      style={[s.input, s.inputSm, focused && s.inputFocused]}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={colors.textHint}
      value={value}
      onFocus={onFocus}
      onBlur={onBlur}
      onChangeText={onChange}
    />
  );
}
