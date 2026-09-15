import { BrandGlyph } from '@/components/app/BrandIcon';
import { MoreSubHeader } from '@/components/app/MoreSubHeader';
import { appStyles as s } from '@/components/app/styles';
import { colors, fonts, fontSizes, radii, space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function SettingsRow({
  icon,
  label,
  sub,
  onPress,
  destructive,
  loading,
  last,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[ls.row, last && ls.rowLast]}
      onPress={onPress}
      disabled={loading}>
      <BrandGlyph
        name={icon as Parameters<typeof BrandGlyph>[0]['name']}
        size={18}
        color={destructive ? colors.terracotta : colors.navy}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[ls.rowLabel, destructive && ls.rowLabelDestructive]}>{label}</Text>
        {sub ? <Text style={ls.rowSub}>{sub}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.terracotta} />
      ) : (
        <Text style={ls.rowChevron}>›</Text>
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out of Taylo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          const { error } = await supabase.auth.signOut();
          setSigningOut(false);
          if (error) {
            Alert.alert('Sign out failed', error.message);
            return;
          }
          router.replace('/signin');
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
      <MoreSubHeader title="Settings" />
      <Text style={s.slabel}>Account</Text>
      <View style={ls.card}>
        <SettingsRow
          icon="log-out-outline"
          label="Sign out"
          sub="Sign out of your Taylo account"
          onPress={() => void handleSignOut()}
          destructive
          loading={signingOut}
          last
        />
      </View>

      <Text style={[s.pnote, { marginTop: 24 }]}>
        More settings coming soon — notifications,{'\n'}account preferences and more.
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
    borderColor: 'rgba(23,43,69,0.06)',
    overflow: 'hidden',
    boxShadow: '0px 1px 2px rgba(23,43,69,0.045)',
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(23,43,69,0.06)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.navy,
  },
  rowLabelDestructive: {
    color: colors.terracotta,
  },
  rowSub: {
    marginTop: 1,
    fontSize: fontSizes.caption,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
  },
  rowChevron: {
    fontSize: 14,
    color: colors.textHint,
  },
});
