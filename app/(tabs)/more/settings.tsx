import { appStyles as s } from '@/components/app/styles';
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

export default function SettingsScreen() {
  const [inApp, setInApp] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <View style={s.subnav}>
        <Pressable onPress={() => router.back()}>
          <Text style={s.subnavBack}>← More</Text>
        </Pressable>
        <Text style={s.subnavTitle}>Settings</Text>
      </View>
      <Text style={s.slabel}>Notifications</Text>
      <View style={s.watoggle}>
        <Text style={{ fontSize: 18 }}>💬</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.wlabel}>In-app chat (default)</Text>
          <Text style={s.wsub}>Taylo talks to you inside the app</Text>
        </View>
        <Toggle on={inApp} onToggle={() => setInApp((v) => !v)} />
      </View>
      <View style={s.watoggle}>
        <Text style={{ fontSize: 18, color: '#25D366' }}>●</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.wlabel}>WhatsApp nudges</Text>
          <Text style={s.wsub}>Also get alerts via WhatsApp</Text>
        </View>
        <Toggle on={whatsapp} onToggle={() => setWhatsapp((v) => !v)} />
      </View>
    </ScrollView>
  );
}
