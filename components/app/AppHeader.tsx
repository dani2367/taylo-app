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
      <TayloWordmark size={34} />
      <Pressable
        style={s.homeBrandIconBtn}
        onPress={() => router.push('/more')}
        accessibilityRole="button"
        accessibilityLabel="Settings">
        <Ionicons name="settings-outline" size={22} color={colors.navy} />
      </Pressable>
    </View>
  );
}

export function AppHeader() {
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.first_name) setFirstName(profile.first_name);
    }
    load();
  }, []);

  return (
    <View style={s.header}>
      <Text style={s.greeting}>{greetingForName(firstName)}</Text>
    </View>
  );
}
