import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { demoCalToggles, demoEmailToggles } from '@/lib/demo-data';
import { supabase } from '@/lib/supabase';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const MICROSOFT_CLIENT_ID = 'f976566d-39c1-48bc-b140-e7a5a727afd5';
const OUTLOOK_AUTH_URL = 'https://fbffbenebwgmmtmnumux.supabase.co/functions/v1/outlook-auth';
const MICROSOFT_SCOPES = [
  'openid',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
];

const discovery = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable style={[s.tswitch, on && s.tswitchOn]} onPress={onToggle}>
      <View style={[s.tknob, on && s.tknobOn]} />
    </Pressable>
  );
}

export default function ConnectionsScreen() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [email, setEmail] = useState(demoEmailToggles);
  const [cal, setCal] = useState(demoCalToggles);
  const [outlook, setOutlook] = useState(false);
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [apple, setApple] = useState(false);

  const redirectUri = __DEV__
    ? 'exp://192.168.0.120:8081'
    : makeRedirectUri({ scheme: 'tayloapp' });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      scopes: MICROSOFT_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      usePKCE: true,
      prompt: AuthSession.Prompt.Consent,
    },
    discovery,
  );

  const codeVerifierRef = useRef<string | null>(null);
  const exchangedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (response?.type !== 'success') return;

    const { code } = response.params;
    if (!code || exchangedCodeRef.current === code) return;

    const codeVerifier = codeVerifierRef.current;
    if (!codeVerifier) {
      Alert.alert('Connection failed', 'Missing PKCE verifier. Please try connecting again.');
      return;
    }

    exchangedCodeRef.current = code;

    (async () => {
      setOutlookLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;

        const requestBody = { code, redirect_uri: redirectUri, code_verifier: codeVerifier };
        console.log('[outlook-auth] Edge Function request', {
          url: OUTLOOK_AUTH_URL,
          hasJwt: Boolean(jwt),
          redirectUri,
          codeLength: typeof code === 'string' ? code.length : null,
          verifierLength: codeVerifier.length,
        });

        const res = await fetch(OUTLOOK_AUTH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify(requestBody),
        });

        const responseText = await res.text();
        console.log('[outlook-auth] Edge Function response', {
          ok: res.ok,
          status: res.status,
          body: responseText,
        });

        if (!res.ok) {
          let message = responseText;
          try {
            const parsed = JSON.parse(responseText) as { details?: string; error?: string };
            message = parsed.details ?? parsed.error ?? responseText;
          } catch {
            // keep raw body
          }
          throw new Error(message);
        }

        setOutlook(true);
      } catch (e: unknown) {
        exchangedCodeRef.current = null;
        Alert.alert('Connection failed', e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setOutlookLoading(false);
      }
    })();
  }, [response, redirectUri]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <View style={s.subnav}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.subnavBack}>← More</Text>
        </Pressable>
        <Text style={s.subnavTitle}>Connections</Text>
      </View>
      <Text style={s.connIntro}>
        Connect the services you already use — Taylo reads them to spot what matters for your family.
      </Text>

      <View style={s.hcard}>
        <Pressable style={[s.hhead, { backgroundColor: colors.roseLight }]} onPress={() => setEmailOpen((v) => !v)}>
          <View style={{ flex: 1 }}>
            <Text style={[s.hheadTitle, { color: colors.roseDeep }]}>📧 Email</Text>
            <Text style={[s.hheadSub, { color: colors.roseDark }]}>Gmail connected · reading newsletters & orders</Text>
          </View>
          <Text style={s.bon}>Active</Text>
        </Pressable>
        {emailOpen ? (
          <>
            <Text style={s.connSectionLabel}>What to capture</Text>
            {email.map((t, i) => (
              <View key={t.key} style={[s.hitem, { paddingVertical: 7 }, i === email.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleRow}>{t.label}</Text>
                  <Text style={s.toggleSub}>{t.sub}</Text>
                </View>
                <Toggle
                  on={t.on}
                  onToggle={() => setEmail((prev) => prev.map((x) => (x.key === t.key ? { ...x, on: !x.on } : x)))}
                />
              </View>
            ))}
            <View style={s.connAlso}>
              <Text style={s.connAlsoLabel}>Also connect:</Text>
              <Pressable
                style={[s.connAlsoBtn, outlook && s.connAlsoBtnOn]}
                disabled={!request || outlookLoading || outlook}
                onPress={() => {
                  codeVerifierRef.current = request?.codeVerifier ?? null;
                  void promptAsync();
                }}>
                <Text style={[s.connAlsoBtnText, outlook && s.connAlsoBtnTextOn]}>
                  {outlookLoading ? 'Connecting…' : outlook ? '✓ Outlook' : '💌 Outlook'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      <View style={s.hcard}>
        <Pressable style={[s.hhead, { backgroundColor: colors.blueLight }]} onPress={() => setCalOpen((v) => !v)}>
          <View style={{ flex: 1 }}>
            <Text style={[s.hheadTitle, { color: colors.blueDeep }]}>📅 Calendar</Text>
            <Text style={[s.hheadSub, { color: colors.blueMid }]}>Google Calendar connected · syncing family events</Text>
          </View>
          <Text style={s.bon}>Active</Text>
        </Pressable>
        {calOpen ? (
          <>
            {cal.map((t, i) => (
              <View key={t.key} style={[s.hitem, { paddingVertical: 7 }, i === cal.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleRow}>{t.label}</Text>
                  <Text style={s.toggleSub}>{t.sub}</Text>
                </View>
                <Toggle
                  on={t.on}
                  onToggle={() => setCal((prev) => prev.map((x) => (x.key === t.key ? { ...x, on: !x.on } : x)))}
                />
              </View>
            ))}
            <View style={s.connAlso}>
              <Text style={s.connAlsoLabel}>Also connect:</Text>
              <Pressable style={[s.connAlsoBtn, apple && s.connAlsoBtnOn]} onPress={() => setApple((v) => !v)}>
                <Text style={[s.connAlsoBtnText, apple && s.connAlsoBtnTextOn]}>
                  {apple ? '✓ Apple Calendar' : '🍍 Apple Calendar'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      <Text style={s.pnote}>
        Taylo only reads what it needs · never shares your data{'\n'}disconnect anything at any time 🔒
      </Text>
    </ScrollView>
  );
}
