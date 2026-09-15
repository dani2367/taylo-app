import { TayloWordmark } from '@/components/app/TayloWordmark';
import { signupStyles as s } from '@/components/signup/styles';
import { colors, fonts, fontSizes } from '@/constants/theme';
import {
  cap,
  createAccountWithHousehold,
  emptyMember,
  initialNewSignupState,
  validEmail,
  type HouseholdMember,
  type NewSignupState,
  type Relationship,
} from '@/lib/signup';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createElement, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// DateTimePicker is a native module — require lazily so web doesn't error out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DateTimePicker: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch {
    // Falls back to text input if the native build doesn't include it yet.
  }
}

WebBrowser.maybeCompleteAuthSession();

const OUTLOOK_AUTH_URL = 'https://fbffbenebwgmmtmnumux.supabase.co/functions/v1/outlook-auth';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type Step = 'account' | 'household' | 'connect' | 'done';
const STEPS: Step[] = ['account', 'household', 'connect', 'done'];

const STEP_EYEBROW: Record<Step, string> = {
  account: "Let's get started",
  household: 'Your household',
  connect: 'Connections',
  done: "You're all set",
};

const STEP_TITLE: Record<Step, string> = {
  account: 'Create your account',
  household: "Who's in your home?",
  connect: 'Connect your calendar & email',
  done: '', // filled in dynamically
};

const REL_OPTS: { val: Relationship; label: string }[] = [
  { val: 'partner', label: 'Partner / Co-parent' },
  { val: 'child', label: 'Child' },
  { val: 'other', label: 'Other' },
];

// ── Date helpers ─────────────────────────────────────────────────────────────

function parseDob(iso: string | null): Date {
  if (!iso) return new Date(2010, 0, 1);
  const parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDob(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = iso.split('-').map(Number);
  return `${parts[2]} ${months[parts[1] - 1]} ${parts[0]}`;
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SignupScreen() {
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<NewSignupState>(initialNewSignupState());
  const [index, setIndex] = useState(0);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [shakeX] = useState(() => new Animated.Value(0));
  const [focused, setFocused] = useState<string | null>(null);
  const [mainPressed, setMainPressed] = useState(false);

  // Step 2 → 3 transition: account creation
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Step 3: Outlook OAuth
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [outlookError, setOutlookError] = useState<string | null>(null);

  // DOB picker: tracks which member's picker is open (by id)
  const [openDobId, setOpenDobId] = useState<string | null>(null);

  const step = STEPS[index];
  const pct = Math.round((index / (STEPS.length - 1)) * 100);
  const showBack = index > 0 && step !== 'done';
  const topBarHeight = insets.top + 46;

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  function goBack() {
    if (creatingAccount) return;
    setCreateError(null);
    setIndex((i) => Math.max(i - 1, 0));
  }

  function updateMember(id: string, patch: Partial<HouseholdMember>) {
    setState((p) => ({
      ...p,
      members: p.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  // ── Step transitions ───────────────────────────────────────────────────────

  async function advanceToConnect() {
    // Create the Supabase account + save household before showing the
    // Outlook OAuth step — the session is required for the OAuth call.
    setCreatingAccount(true);
    setCreateError(null);
    const result = await createAccountWithHousehold(state);
    setCreatingAccount(false);
    if (!result.ok) {
      setCreateError(result.message);
      return;
    }
    setIndex((i) => i + 1);
  }

  async function connectOutlook() {
    if (outlookLoading || state.outlookConnected) return;
    setOutlookLoading(true);
    setOutlookError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) {
        throw new Error('Your session is missing. Please restart the app and try again.');
      }

      const appRedirect = Linking.createURL('outlook-auth');
      const res = await fetch(OUTLOOK_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ action: 'start', app_redirect: appRedirect }),
      });

      const txt = await res.text();
      if (!res.ok) {
        let msg = txt;
        try {
          const parsed = JSON.parse(txt) as { details?: string; error?: string };
          msg = parsed.details ?? parsed.error ?? txt;
        } catch {
          // keep raw body
        }
        throw new Error(msg);
      }

      const { authUrl } = JSON.parse(txt) as { authUrl?: string };
      if (!authUrl) throw new Error('Could not start Microsoft login.');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appRedirect);
      if (result.type === 'success' && 'url' in result) {
        const returned = Linking.parse(result.url);
        const err = returned.queryParams?.error;
        if (typeof err === 'string' && err) throw new Error(err);
        if (returned.queryParams?.connected === '1') {
          setState((p) => ({ ...p, outlookConnected: true }));
        }
      }
    } catch (e: unknown) {
      setOutlookError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setOutlookLoading(false);
    }
  }

  async function onContinue() {
    if (step === 'account') {
      const email = state.email.trim();
      if (!state.firstName.trim()) { shake('firstName'); return; }
      if (!validEmail(email)) { shake('email'); return; }
      if (!state.password || state.password.length < 8) { shake('password'); return; }
      setState((p) => ({ ...p, email }));
      setIndex((i) => i + 1);
      return;
    }
    if (step === 'household') {
      await advanceToConnect();
      return;
    }
    if (step === 'connect') {
      setIndex((i) => i + 1);
      return;
    }
    if (step === 'done') {
      router.replace('/home');
      return;
    }
  }

  // ── Derived values for Done step ──────────────────────────────────────────

  const validMembers = state.members.filter((m) => m.name.trim());

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={topBarHeight}>

      {/* ── Top bar ── */}
      <View style={[s.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={[s.back, !showBack && s.backHidden]}
          onPress={goBack}
          disabled={!showBack || creatingAccount}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Text style={s.backText}>←</Text>
        </Pressable>
        <View style={s.topbarBrand}>
          <TayloWordmark size={26} />
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
        </View>
      </View>

      {/* ── Step content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        key={step}>

        <Text style={s.eyebrow}>{STEP_EYEBROW[step]}</Text>
        <Text style={s.title}>
          {step === 'done'
            ? `Nice to meet you, ${cap(state.firstName || 'there')} 👋`
            : STEP_TITLE[step]}
        </Text>

        {/* ── Step 1: Account ─────────────────────────────────────────── */}
        {step === 'account' ? (
          <>
            <Text style={s.sub}>Name, email, and a password to get in.</Text>

            <View style={ls.nameRow}>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.label}>First name</Text>
                <Animated.View
                  style={shakeKey === 'firstName' ? { transform: [{ translateX: shakeX }] } : undefined}>
                  <TextInput
                    style={[
                      s.input,
                      focused === 'firstName' && s.inputFocused,
                      shakeKey === 'firstName' && s.inputShake,
                    ]}
                    placeholder="First"
                    placeholderTextColor={colors.textHint}
                    value={state.firstName}
                    autoFocus
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="givenName"
                    onFocus={() => setFocused('firstName')}
                    onBlur={() => setFocused(null)}
                    onChangeText={(firstName) => setState((p) => ({ ...p, firstName }))}
                  />
                </Animated.View>
              </View>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.label}>Last name</Text>
                <TextInput
                  style={[s.input, focused === 'lastName' && s.inputFocused]}
                  placeholder="Last"
                  placeholderTextColor={colors.textHint}
                  value={state.lastName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="familyName"
                  onFocus={() => setFocused('lastName')}
                  onBlur={() => setFocused(null)}
                  onChangeText={(lastName) => setState((p) => ({ ...p, lastName }))}
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <Animated.View
                style={shakeKey === 'email' ? { transform: [{ translateX: shakeX }] } : undefined}>
                <TextInput
                  style={[
                    s.input,
                    focused === 'email' && s.inputFocused,
                    shakeKey === 'email' && s.inputShake,
                  ]}
                  placeholder="e.g. dani@email.com"
                  placeholderTextColor={colors.textHint}
                  value={state.email}
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

            <Pressable
              onPress={() => router.replace('/signin')}
              accessibilityRole="link"
              style={{ marginBottom: 8 }}>
              <Text style={s.skip}>Already have an account? Sign in</Text>
            </Pressable>

            <Pressable
              style={[s.continue, mainPressed && { transform: [{ scale: 0.98 }] }]}
              onPressIn={() => setMainPressed(true)}
              onPressOut={() => setMainPressed(false)}
              onPress={onContinue}>
              <Text style={s.continueText}>Continue</Text>
            </Pressable>
          </>
        ) : null}

        {/* ── Step 2: Household ────────────────────────────────────────── */}
        {step === 'household' ? (
          <>
            <Text style={s.sub}>
              Add anyone who shares your home — you can always edit this from the Family page later.
            </Text>

            {state.members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                focused={focused}
                setFocused={setFocused}
                onChange={(patch) => updateMember(m.id, patch)}
                onRemove={() =>
                  setState((p) => ({ ...p, members: p.members.filter((x) => x.id !== m.id) }))
                }
                openDobId={openDobId}
                setOpenDobId={setOpenDobId}
              />
            ))}

            <Pressable
              style={ls.addMemberBtn}
              onPress={() =>
                setState((p) => ({ ...p, members: [...p.members, emptyMember()] }))
              }>
              <Text style={ls.addMemberBtnText}>+ Add a family member</Text>
            </Pressable>

            {state.members.length === 0 ? (
              <Text style={ls.householdHint}>
                Just you for now — that's fine. You can add family members any time from the Family
                page.
              </Text>
            ) : null}

            {createError ? (
              <View style={[s.errorBanner, { marginTop: 12 }]}>
                <Text style={s.errorBannerText}>{createError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[
                s.continue,
                { marginTop: 18 },
                (mainPressed || creatingAccount) && { transform: [{ scale: 0.98 }] },
                creatingAccount && s.continueDisabled,
              ]}
              disabled={creatingAccount}
              onPressIn={() => setMainPressed(true)}
              onPressOut={() => setMainPressed(false)}
              onPress={onContinue}>
              {creatingAccount ? (
                <View style={s.continueInner}>
                  <ActivityIndicator color={colors.navy} size="small" />
                  <Text style={s.continueText}>Creating your account…</Text>
                </View>
              ) : (
                <Text style={s.continueText}>Continue</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {/* ── Step 3: Connect ─────────────────────────────────────────── */}
        {step === 'connect' ? (
          <>
            <Text style={s.sub}>
              Taylo reads these to spot what matters for your family. Only Outlook is available today
              — more providers coming soon.
            </Text>

            {/* Outlook connection card */}
            <View style={ls.connectCard}>
              <View style={ls.connectCardHead}>
                <View style={ls.connectCardIconWrap}>
                  <Text style={ls.connectCardIconText}>✉</Text>
                </View>
                <View style={ls.connectCardCopy}>
                  <Text style={ls.connectCardTitle}>Outlook</Text>
                  <Text style={ls.connectCardSub}>
                    {state.outlookConnected
                      ? 'Connected — Taylo will read your Outlook calendar and inbox'
                      : 'Calendar & email via your Microsoft account'}
                  </Text>
                </View>
                {state.outlookConnected ? (
                  <Text style={ls.connectedCheck}>✓</Text>
                ) : null}
              </View>

              {!state.outlookConnected ? (
                <View style={ls.connectCardBody}>
                  <Text style={ls.connectHint}>
                    Taylo reads incoming emails and calendar events to spot family-relevant things —
                    without storing your emails or sharing your data.
                  </Text>
                  {outlookError ? (
                    <View style={[s.errorBanner, { marginBottom: 4 }]}>
                      <Text style={s.errorBannerText}>{outlookError}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[ls.connectBtn, outlookLoading && s.continueDisabled]}
                    disabled={outlookLoading}
                    onPress={() => void connectOutlook()}>
                    {outlookLoading ? (
                      <View style={s.continueInner}>
                        <ActivityIndicator color={colors.navy} size="small" />
                        <Text style={s.continueText}>Connecting…</Text>
                      </View>
                    ) : (
                      <Text style={s.continueText}>Connect Outlook</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* ⚠️ Note for dev: Outlook OAuth uses the Supabase function as the
                Microsoft redirect_uri. In local dev, Linking.createURL returns an
                exp:// app_redirect which the server accepts, but the Azure app
                registration redirect_uri must match the deployed Supabase function
                URL — not a local IP. If you're seeing redirect_uri_mismatch errors
                in non-dev builds, check the Azure portal registration. */}

            {state.outlookConnected ? (
              <Pressable
                style={[
                  s.continue,
                  { marginTop: 14 },
                  mainPressed && { transform: [{ scale: 0.98 }] },
                ]}
                onPressIn={() => setMainPressed(true)}
                onPressOut={() => setMainPressed(false)}
                onPress={onContinue}>
                <Text style={s.continueText}>Continue →</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onContinue} style={{ marginTop: 16 }}>
                <Text style={s.skip}>Skip for now — connect later from Settings</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {/* ── Step 4: Done ─────────────────────────────────────────────── */}
        {step === 'done' ? (
          <>
            <Text style={s.sub}>Here's what Taylo's got set up — you can always add more later.</Text>

            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>Your name</Text>
                <Text style={s.summaryVal}>
                  {`${cap(state.firstName)} ${cap(state.lastName)}`.trim()}
                </Text>
              </View>
              {validMembers.length ? (
                <View style={s.summaryRow}>
                  <Text style={s.summaryKey}>Household</Text>
                  <Text style={s.summaryVal}>
                    {validMembers.map((m) => cap(m.name)).join(', ')}
                  </Text>
                </View>
              ) : null}
              <View style={[s.summaryRow, s.summaryRowLast]}>
                <Text style={s.summaryKey}>Calendar & email</Text>
                <Text style={s.summaryVal}>
                  {state.outlookConnected ? 'Outlook connected ✓' : 'Not connected yet'}
                </Text>
              </View>
            </View>

            {!state.outlookConnected ? (
              <Text style={[s.sub, s.subAfter]}>
                You can connect Outlook any time from More → Connections.
              </Text>
            ) : null}

            <Pressable
              style={[
                s.continue,
                { marginTop: 18 },
                mainPressed && { transform: [{ scale: 0.98 }] },
              ]}
              onPressIn={() => setMainPressed(true)}
              onPressOut={() => setMainPressed(false)}
              onPress={() => router.replace('/home')}>
              <Text style={s.continueText}>Take me to Taylo →</Text>
            </Pressable>
          </>
        ) : null}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── MemberCard ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  focused,
  setFocused,
  onChange,
  onRemove,
  openDobId,
  setOpenDobId,
}: {
  member: HouseholdMember;
  focused: string | null;
  setFocused: (k: string | null) => void;
  onChange: (patch: Partial<HouseholdMember>) => void;
  onRemove: () => void;
  openDobId: string | null;
  setOpenDobId: (id: string | null) => void;
}) {
  const nameKey = `name-${member.id}`;
  const isDobOpen = openDobId === member.id;
  const isChild = member.relationship === 'child';

  return (
    <View style={ls.memberCard}>
      {/* Name + remove */}
      <View style={ls.memberNameRow}>
        <TextInput
          style={[ls.memberNameInput, focused === nameKey && s.inputFocused]}
          placeholder="Name"
          placeholderTextColor={colors.textHint}
          value={member.name}
          autoCapitalize="words"
          autoCorrect={false}
          onFocus={() => setFocused(nameKey)}
          onBlur={() => setFocused(null)}
          onChangeText={(name) => onChange({ name })}
        />
        <Pressable style={ls.memberRemove} onPress={onRemove} hitSlop={8}>
          <Text style={ls.memberRemoveText}>×</Text>
        </Pressable>
      </View>

      {/* Relationship pills */}
      <View style={ls.relRow}>
        {REL_OPTS.map((opt) => (
          <Pressable
            key={opt.val}
            style={[ls.relPill, member.relationship === opt.val && ls.relPillOn]}
            onPress={() =>
              onChange({ relationship: opt.val, dob: opt.val !== 'child' ? null : member.dob })
            }>
            <Text style={[ls.relPillText, member.relationship === opt.val && ls.relPillTextOn]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* DOB field — children only */}
      {isChild ? (
        <DobField
          member={member}
          onChange={onChange}
          isDobOpen={isDobOpen}
          onToggle={() => setOpenDobId(isDobOpen ? null : member.id)}
          onClose={() => setOpenDobId(null)}
        />
      ) : null}
    </View>
  );
}

// ── DobField ─────────────────────────────────────────────────────────────────

function DobField({
  member,
  onChange,
  isDobOpen,
  onToggle,
  onClose,
}: {
  member: HouseholdMember;
  onChange: (patch: Partial<HouseholdMember>) => void;
  isDobOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const dateValue = parseDob(member.dob);

  // ── Web: native <input type="date"> ──
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: member.dob ?? '',
      max: new Date().toISOString().split('T')[0],
      onChange: (e: { target: { value: string } }) =>
        onChange({ dob: e.target.value || null }),
      style: {
        width: '100%',
        borderWidth: 1.5,
        borderStyle: 'solid',
        borderColor: colors.border,
        borderRadius: 11,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: fontSizes.body,
        fontFamily: fonts.sansRegular,
        color: colors.text,
        backgroundColor: colors.cream,
        outline: 'none',
        marginTop: 6,
        boxSizing: 'border-box',
      },
    });
  }

  // ── Native: tap-to-open picker ──
  return (
    <>
      <Pressable style={ls.dobRow} onPress={onToggle}>
        <Text style={ls.dobLabel}>Date of birth</Text>
        <Text style={member.dob ? ls.dobValue : ls.dobPlaceholder}>
          {member.dob ? formatDob(member.dob) : 'Tap to set'}
        </Text>
      </Pressable>

      {/* iOS: inline spinner */}
      {DateTimePicker && Platform.OS === 'ios' && isDobOpen ? (
        <View style={ls.iosPickerWrap}>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={(_: unknown, date?: Date) => {
              if (date) onChange({ dob: isoFromDate(date) });
            }}
          />
          <Pressable style={ls.iosPickerDoneRow} onPress={onClose}>
            <Text style={ls.iosPickerDoneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Android: system date picker dialog */}
      {DateTimePicker && Platform.OS === 'android' && isDobOpen ? (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(event: { type: string }, date?: Date) => {
            onClose();
            if (event.type === 'set' && date) onChange({ dob: isoFromDate(date) });
          }}
        />
      ) : null}

      {/* Fallback text input if the native module isn't available in this build */}
      {!DateTimePicker ? (
        <TextInput
          style={ls.dobFallback}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textHint}
          value={member.dob ?? ''}
          onChangeText={(v) => onChange({ dob: v || null })}
        />
      ) : null}
    </>
  );
}

// ── Local styles ─────────────────────────────────────────────────────────────

const ls = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 0,
  },
  // ─ Household step ─
  memberCard: {
    backgroundColor: colors.cream,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberNameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.text,
    backgroundColor: colors.cream,
  },
  memberRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.paleBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRemoveText: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.sansRegular,
    lineHeight: 16,
  },
  relRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  relPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.ivory,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  relPillOn: {
    backgroundColor: colors.blush,
    borderColor: colors.terracotta,
  },
  relPillText: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.sansMedium,
    color: colors.textMuted,
  },
  relPillTextOn: {
    color: colors.navy,
  },
  // ─ DOB ─
  dobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: colors.cream,
  },
  dobLabel: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.sansSemiBold,
    color: colors.textHint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dobValue: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.text,
  },
  dobPlaceholder: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textHint,
  },
  iosPickerWrap: {
    backgroundColor: colors.cream,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  iosPickerDoneRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  iosPickerDoneText: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansSemiBold,
    color: colors.navy,
  },
  dobFallback: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.text,
    backgroundColor: colors.cream,
  },
  addMemberBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.paleBlue,
    borderRadius: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  addMemberBtnText: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansSemiBold,
    color: colors.navy,
  },
  householdHint: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textHint,
    lineHeight: fontSizes.body * 1.55,
    textAlign: 'center',
    marginBottom: 8,
  },
  // ─ Connect step ─
  connectCard: {
    backgroundColor: colors.cream,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  connectCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  connectCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.paleBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCardIconText: {
    fontSize: 18,
  },
  connectCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  connectCardTitle: {
    fontSize: fontSizes.title,
    fontFamily: fonts.sansSemiBold,
    color: colors.navy,
  },
  connectCardSub: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  connectedCheck: {
    fontSize: 22,
    color: colors.terracotta,
  },
  connectCardBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
    gap: 12,
  },
  connectHint: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    lineHeight: fontSizes.body * 1.5,
  },
  connectBtn: {
    backgroundColor: colors.blush,
    borderWidth: 1.5,
    borderColor: colors.terracotta,
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
  },
});
