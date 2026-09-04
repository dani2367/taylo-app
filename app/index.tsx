import { TayloWordmark } from '@/components/app/TayloWordmark';
import { colors, fonts, fontSizes } from '@/constants/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.logoWrap}>
          <TayloWordmark size={48} />
        </View>
        <Text style={styles.tagline}>You hold enough. Let Taylo hold the rest.</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 30) }]}>
        <Text style={styles.cta}>Let's get started</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.push('/signup')}>
          <Text style={styles.primaryBtnText}>Sign up</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={() => router.push('/signin')}>
          <Text style={styles.outlineBtnText}>Sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 12,
  },
  logoWrap: {
    marginBottom: 5,
    alignItems: 'center',
  },
  tagline: {
    fontFamily: fonts.sansLight,
    fontSize: fontSizes.body,
    lineHeight: fontSizes.body * 1.5,
    color: colors.navy,
    opacity: 0.7,
    maxWidth: 260,
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: 22,
    gap: 9,
  },
  cta: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSizes.title,
    color: colors.navy,
    opacity: 0.95,
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: fontSizes.header,
    color: colors.cream,
  },
  outlineBtn: {
    backgroundColor: colors.cream,
    borderRadius: 20,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  outlineBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: fontSizes.header,
    color: colors.navy,
  },
});
