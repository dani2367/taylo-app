import { BrandIconDisc } from '@/components/app/BrandIcon';
import { appStyles as s } from '@/components/app/styles';
import type { IconName, Wash } from '@/lib/plan-icon';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

const rows: { href: '/more/family' | '/more/connections' | '/more/settings'; name: IconName; wash: Wash; title: string; sub: string }[] = [
  { href: '/more/family', name: 'people-outline', wash: 'blush', title: 'Family', sub: "Members, kids' details & profiles" },
  { href: '/more/connections', name: 'link-outline', wash: 'paleBlue', title: 'Connections', sub: 'Email & calendar Taylo reads' },
  { href: '/more/settings', name: 'settings-outline', wash: 'sage', title: 'Settings', sub: 'Notifications & preferences' },
];

export default function MoreScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <Text style={s.screenTitle}>More</Text>
      {rows.map((r) => (
        <Pressable key={r.title} style={s.mrow} onPress={() => router.push(r.href)}>
          <BrandIconDisc name={r.name} wash={r.wash} />
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
