import { appStyles as s } from '@/components/app/styles';
import { TayloWordmark } from '@/components/app/TayloWordmark';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

function greetingForName(name: string) {
  const hr = new Date().getHours();
  const timeGreet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${timeGreet}, ${name}` : `Good ${timeGreet}`;
}

export function HomeBrandBar() {
  return (
    <View style={s.homeBrandBar}>
      <TayloWordmark size={26} />
      <Pressable
        style={s.homeBrandIconBtn}
        onPress={() => router.push('/more')}
        accessibilityRole="button"
        accessibilityLabel="More">
        <Ionicons name="menu-outline" size={22} color={colors.navy} />
      </Pressable>
    </View>
  );
}

export function AppHeader() {
  const [firstName, setFirstName] = useState('');
  const [nudgeCount, setNudgeCount] = useState(0);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('home_spotlight')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_watching', false),
      ]);

      if (profile?.first_name) setFirstName(profile.first_name);
      setNudgeCount(count ?? 0);
    }

    load();
  }, []);

  const things = nudgeCount === 1 ? 'thing' : 'things';

  return (
    <View style={s.header}>
      <Text style={s.greeting}>{greetingForName(firstName)}</Text>
      <TayloWordmark size={32} />
      <View style={s.mlBar}>
        <Text style={s.mlStat}>{`Taylo's got ${nudgeCount} ${things} for you today`}</Text>
      </View>
    </View>
  );
}
