import { MoreSubHeader } from '@/components/app/MoreSubHeader';
import { appStyles as s } from '@/components/app/styles';
import { colors, fonts, fontSizes, radii, space } from '@/constants/theme';
import {
  listDeviceCalendars,
  loadAppleCalendarConnection,
  registerAppleCalendarBackgroundSync,
  requestAppleCalendarAccess,
  saveAppleCalendarConnection,
  syncAppleCalendar,
  usesPreviewAppleCalendar,
  type DeviceCalendar,
} from '@/lib/apple-calendar';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const OUTLOOK_AUTH_URL = 'https://fbffbenebwgmmtmnumux.supabase.co/functions/v1/outlook-auth';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable style={[s.tswitch, on && s.tswitchOn]} onPress={onToggle}>
      <View style={[s.tknob, on && s.tknobOn]} />
    </Pressable>
  );
}

function ConnectionCard({
  title,
  subtitle,
  active,
  children,
  expanded,
  onToggleExpand,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  children?: React.ReactNode;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <View style={ls.card}>
      <Pressable style={[ls.cardHead, active && ls.cardHeadActive]} onPress={onToggleExpand}>
        <View style={{ flex: 1 }}>
          <Text style={ls.cardTitle}>{title}</Text>
          <Text style={ls.cardSub}>{subtitle}</Text>
        </View>
        {active ? <Text style={ls.activeBadge}>Active</Text> : null}
        <Text style={ls.chevron}>{expanded ? '∧' : '∨'}</Text>
      </Pressable>
      {expanded ? <View style={ls.cardBody}>{children}</View> : null}
    </View>
  );
}

export default function ConnectionsScreen() {
  const [outlookOpen, setOutlookOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [outlook, setOutlook] = useState(false);
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [apple, setApple] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [deviceCals, setDeviceCals] = useState<DeviceCalendar[]>([]);
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([]);
  const returnParams = useLocalSearchParams<{ connected?: string; error?: string }>();
  const shownReturnError = useRef<string | null>(null);

  const hydrateOutlook = useCallback(async () => {
    const { data } = await supabase
      .from('connections')
      .select('connected')
      .eq('provider', 'microsoft')
      .maybeSingle();
    setOutlook(Boolean(data?.connected));
  }, []);

  const hydrateApple = useCallback(async () => {
    const { connected, selectedIds } = await loadAppleCalendarConnection();
    setApple(connected);
    setSelectedCalIds(selectedIds);
    if (connected) {
      const calendars = await listDeviceCalendars();
      setDeviceCals(calendars);
    }
  }, []);

  useEffect(() => {
    void hydrateApple();
    void hydrateOutlook();
  }, [hydrateApple, hydrateOutlook]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void hydrateOutlook();
    });
    return () => sub.remove();
  }, [hydrateOutlook]);

  useEffect(() => {
    if (returnParams.connected === '1') {
      setOutlook(true);
      void hydrateOutlook();
    }
    const err = returnParams.error ? String(returnParams.error) : '';
    if (err && shownReturnError.current !== err) {
      shownReturnError.current = err;
      Alert.alert('Connection failed', err);
    }
  }, [returnParams.connected, returnParams.error, hydrateOutlook]);

  async function connectOutlook() {
    if (outlookLoading || outlook) return;
    setOutlookLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) {
        throw new Error('Sign in to Taylo first, then connect Outlook.');
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
      const responseText = await res.text();
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
      const { authUrl } = JSON.parse(responseText) as { authUrl?: string };
      if (!authUrl) throw new Error('Could not start Microsoft login.');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appRedirect);
      if (result.type === 'success' && 'url' in result) {
        const returned = Linking.parse(result.url);
        const error = returned.queryParams?.error;
        if (typeof error === 'string' && error) {
          throw new Error(error);
        }
        if (returned.queryParams?.connected === '1') {
          setOutlook(true);
        }
      }
      await hydrateOutlook();
    } catch (e: unknown) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setOutlookLoading(false);
    }
  }

  async function connectAppleCalendar() {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      const granted = await requestAppleCalendarAccess();
      if (!granted) {
        Alert.alert(
          'Calendar access needed',
          "Taylo reads your device calendars to show what's coming up. You can enable this in Settings.",
        );
        return;
      }
      const calendars = await listDeviceCalendars();
      setDeviceCals(calendars);
      const { error } = await saveAppleCalendarConnection({
        connected: true,
        selectedIds,
      });
      if (error) throw new Error(error);
      setApple(true);
      setCalOpen(true);
      await registerAppleCalendarBackgroundSync();
      await syncAppleCalendar({ force: true });
    } catch (e: unknown) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setAppleLoading(false);
    }
  }

  async function toggleDeviceCalendar(id: string) {
    const next = selectedCalIds.includes(id)
      ? selectedCalIds.filter((value) => value !== id)
      : [...selectedCalIds, id];
    setSelectedCalIds(next);
    const { error } = await saveAppleCalendarConnection({ connected: true, selectedIds: next });
    if (error) {
      Alert.alert('Could not save calendars', error);
      return;
    }
    void syncAppleCalendar({ force: true });
  }

  const outlookSub = outlook
    ? 'Outlook connected — Taylo reads relevant emails'
    : 'Connect Outlook to let Taylo spot what matters';

  const calendarSub = apple
    ? selectedCalIds.length
      ? `${selectedCalIds.length} calendar${selectedCalIds.length === 1 ? '' : 's'} selected`
      : 'Choose which calendars to include'
    : usesPreviewAppleCalendar()
      ? 'Needs a development build to read your iPhone calendar'
      : "Connect Apple Calendar to sync what's coming up";

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <MoreSubHeader title="Connections" />
      <Text style={s.connIntro}>
        Connect the services you already use — Taylo reads them to spot what matters for your family.
      </Text>

      {/* Outlook / Email */}
      <ConnectionCard
        title="Outlook"
        subtitle={outlookSub}
        active={outlook}
        expanded={outlookOpen}
        onToggleExpand={() => setOutlookOpen((v) => !v)}>
        {outlook ? (
          <View style={ls.connectedRow}>
            <Text style={ls.connectedText}>Taylo is reading your Outlook inbox for relevant events, orders and appointments.</Text>
          </View>
        ) : (
          <View style={ls.connectRow}>
            <Text style={ls.connectHint}>
              Taylo reads incoming emails to spot family events, deliveries, and appointments — without storing your emails.
            </Text>
            <Pressable
              style={[ls.connectBtn, outlookLoading && ls.connectBtnLoading]}
              disabled={outlookLoading}
              onPress={() => void connectOutlook()}>
              <Text style={ls.connectBtnText}>
                {outlookLoading ? 'Connecting…' : 'Connect Outlook'}
              </Text>
            </Pressable>
          </View>
        )}
      </ConnectionCard>

      {/* Apple Calendar */}
      <ConnectionCard
        title="Apple Calendar"
        subtitle={calendarSub}
        active={apple}
        expanded={calOpen}
        onToggleExpand={() => setCalOpen((v) => !v)}>
        {apple && deviceCals.length ? (
          <>
            <Text style={ls.sectionLabel}>Calendars to include</Text>
            {deviceCals.map((calendar, i) => (
              <View
                key={calendar.id}
                style={[s.hitem, { paddingVertical: 9 }, i === deviceCals.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleRow}>{calendar.title}</Text>
                  {calendar.sub ? <Text style={s.toggleSub}>{calendar.sub}</Text> : null}
                </View>
                <Toggle
                  on={selectedCalIds.includes(calendar.id)}
                  onToggle={() => void toggleDeviceCalendar(calendar.id)}
                />
              </View>
            ))}
          </>
        ) : apple ? (
          <View style={[s.hitem, { paddingVertical: 12, borderBottomWidth: 0 }]}>
            <Text style={s.toggleSub}>
              Permission is on, but Taylo could not list calendars. This usually means the app is running in Expo Go instead of a development build.
            </Text>
          </View>
        ) : (
          <View style={ls.connectRow}>
            <Text style={ls.connectHint}>
              {usesPreviewAppleCalendar()
                ? 'A development build is required to read your iPhone calendar.'
                : 'Taylo reads your iPhone calendars to show upcoming events in one place.'}
            </Text>
            {!usesPreviewAppleCalendar() ? (
              <Pressable
                style={[ls.connectBtn, appleLoading && ls.connectBtnLoading]}
                disabled={appleLoading}
                onPress={() => void connectAppleCalendar()}>
                <Text style={ls.connectBtnText}>
                  {appleLoading ? 'Connecting…' : 'Connect Apple Calendar'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ConnectionCard>

      <Text style={s.pnote}>
        Taylo only reads what it needs · never shares your data{'\n'}disconnect anything at any time
      </Text>
    </ScrollView>
  );
}

const ls = StyleSheet.create({
  card: {
    marginHorizontal: space.gutter,
    marginBottom: 8,
    backgroundColor: colors.cream,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(23,43,69,0.1)',
    overflow: 'hidden',
    boxShadow: '0px 1px 2px rgba(23,43,69,0.045)',
    elevation: 1,
  },
  cardHead: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cream,
  },
  cardHeadActive: {
    backgroundColor: colors.sage,
  },
  cardTitle: {
    fontSize: fontSizes.title,
    fontFamily: fonts.sansSemiBold,
    color: colors.navy,
  },
  cardSub: {
    marginTop: 2,
    fontSize: fontSizes.caption,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    lineHeight: 18,
  },
  activeBadge: {
    fontSize: 9,
    fontFamily: fonts.sansSemiBold,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: colors.paleBlue,
    color: colors.navy,
    overflow: 'hidden',
  },
  chevron: {
    fontSize: 12,
    color: colors.textHint,
    width: 14,
    textAlign: 'center',
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(23,43,69,0.06)',
  },
  sectionLabel: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 4,
    fontSize: 10,
    fontFamily: fonts.sansSemiBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.54,
  },
  connectRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  connectHint: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    lineHeight: fontSizes.body * 1.5,
  },
  connectBtn: {
    backgroundColor: colors.navy,
    borderRadius: radii.button,
    paddingVertical: 11,
    alignItems: 'center',
  },
  connectBtnLoading: {
    opacity: 0.5,
  },
  connectBtnText: {
    color: colors.cream,
    fontSize: fontSizes.label,
    fontFamily: fonts.sansSemiBold,
  },
  connectedRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  connectedText: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
    lineHeight: fontSizes.body * 1.5,
  },
});
