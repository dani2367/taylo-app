import { appStyles as s } from '@/components/app/styles';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

function greetingForName(name: string) {
  const hr = new Date().getHours();
  const timeGreet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${timeGreet}, ${name}!` : `Good ${timeGreet}!`;
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
          .from('nudges')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'open'),
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
      <Text style={s.appName}>Taylo</Text>
      <View style={s.mlBar}>
        <Text style={s.mlStat}>{`Taylo's got ${nudgeCount} ${things} for you today ✨`}</Text>
      </View>
    </View>
  );
}
