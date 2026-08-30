import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { demoCalToggles, demoEmailToggles } from '@/lib/demo-data';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  const [apple, setApple] = useState(false);

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
                onPress={() => setOutlook((v) => !v)}>
                <Text style={[s.connAlsoBtnText, outlook && s.connAlsoBtnTextOn]}>
                  {outlook ? '✓ Outlook' : '💌 Outlook'}
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
