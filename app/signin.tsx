import { TayloWordmark } from '@/components/app/TayloWordmark';
import { signupStyles as s } from '@/components/signup/styles';
import { colors } from '@/constants/theme';
import { signIn, validEmail } from '@/lib/signin';
import { router } from 'expo-router';
import { useState } from 'react';
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

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [shakeX] = useState(() => new Animated.Value(0));
  const [pressed, setPressed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function onSubmit() {
    if (submitting) return;
    const trimmed = email.trim();
    const emailOk = validEmail(trimmed);
    const passwordOk = !!password;
    if (!emailOk) {
      setError(null);
      shake('email');
      return;
    }
    if (!passwordOk) {
      setError(null);
      shake('password');
      return;
    }

    setError(null);
    setSubmitting(true);
    void signIn(trimmed, password)
      .then((result) => {
        setSubmitting(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.replace('/home');
      })
      .catch(() => {
        setSubmitting(false);
        setError('Something went wrong. Check your connection and try again.');
      });
  }

  const topBarHeight = insets.top + 46;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={topBarHeight}>
      <View style={[s.topbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={s.back}
          onPress={() => router.back()}
          disabled={submitting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Text style={s.backText}>←</Text>
        </Pressable>
        <View style={s.topbarBrand}>
          <TayloWordmark size={28} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.signinBody, { paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <Text style={s.signinTitle}>Sign in</Text>
        <Text style={s.signinSub}>Email and password for your Taylo account.</Text>

        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <Animated.View style={shakeKey === 'email' ? { transform: [{ translateX: shakeX }] } : undefined}>
            <TextInput
              style={[s.input, focused === 'email' && s.inputFocused, shakeKey === 'email' && s.inputShake]}
              placeholder="e.g. dani@email.com"
              placeholderTextColor={colors.textHint}
              value={email}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              editable={!submitting}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              onChangeText={(value) => {
                setEmail(value);
                if (error) setError(null);
              }}
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
              placeholder="Your password"
              placeholderTextColor={colors.textHint}
              value={password}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              editable={!submitting}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              onChangeText={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
              onSubmitEditing={onSubmit}
            />
          </Animated.View>
        </View>

        {error ? (
          <View style={s.errorBanner} accessibilityLiveRegion="polite">
            <Text style={s.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.replace('/signup')}
          disabled={submitting}
          accessibilityRole="link">
          <Text style={s.skip}>Need an account? Sign up</Text>
        </Pressable>
        <Pressable
          style={[s.continue, (pressed || submitting) && { transform: [{ scale: 0.98 }] }, submitting && s.continueDisabled]}
          disabled={submitting}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          onPress={onSubmit}>
          {submitting ? (
            <View style={s.continueInner}>
              <ActivityIndicator color={colors.cream} size="small" />
              <Text style={s.continueText}>Signing in…</Text>
            </View>
          ) : (
            <Text style={s.continueText}>Sign in</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
