import { appStyles as s } from '@/components/app/styles';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

const rows = [
  { href: '/more/family' as const, icon: '👨‍👩‍👧', title: 'Family', sub: "Members, kids' details & profiles" },
  { href: '/more/connections' as const, icon: '🔗', title: 'Connections', sub: 'Email & calendar Taylo reads' },
  { href: '/more/settings' as const, icon: '⚙️', title: 'Settings', sub: 'Notifications & preferences' },
];

export default function MoreScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <Text style={s.slabel}>More</Text>
      {rows.map((r) => (
        <Pressable key={r.title} style={s.mrow} onPress={() => router.push(r.href)}>
          <Text style={s.mrowIcon}>{r.icon}</Text>
          <View style={s.mrowCopy}>
            <Text style={s.mrowTitle}>{r.title}</Text>
            <Text style={s.mrowSub}>{r.sub}</Text>
          </View>
          <Text style={s.mrowChevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
