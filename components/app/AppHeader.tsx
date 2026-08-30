import { appStyles as s } from '@/components/app/styles';
import { demoFamily, demoNudges, greetingForNow } from '@/lib/demo-data';
import { Text, View } from 'react-native';

export function AppHeader() {
  const n = demoNudges.length;
  const things = n === 1 ? 'thing' : 'things';
  return (
    <View style={s.header}>
      <Text style={s.greeting}>{greetingForNow(demoFamily.name)}</Text>
      <Text style={s.appName}>Taylo</Text>
      <View style={s.mlBar}>
        <Text style={s.mlStat}>{`Taylo's got ${n} ${things} for you today ✨`}</Text>
      </View>
    </View>
  );
}
