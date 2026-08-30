import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROSE = '#C9917A';
const ROSE_DARK = '#A86E58';

export default function SplashScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.logo}>Taylo</Text>
        <Text style={styles.tagline}>You hold enough. Let Taylo hold the rest.</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 30) }]}>
        <Text style={styles.cta}>Let's get started</Text>
        <Pressable style={styles.primaryBtn} onPress={() => {}}>
          <Text style={styles.primaryBtnText}>Sign up</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={() => {}}>
          <Text style={styles.outlineBtnText}>Sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ROSE,
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 12,
  },
  logo: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 48,
    letterSpacing: -1,
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: 'DMSans_300Light',
    fontSize: 11.5,
    lineHeight: 11.5 * 1.55,
    color: '#fff',
    opacity: 0.8,
    maxWidth: 180,
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: 22,
    gap: 9,
  },
  cta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: '#fff',
    opacity: 0.95,
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    color: ROSE_DARK,
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  outlineBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    color: '#fff',
  },
});
