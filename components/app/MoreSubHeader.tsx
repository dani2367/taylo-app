import { colors, fonts, fontSizes } from '@/constants/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Stable custom header for More sub-pages.
 * headerShown: false on all More screens so the native header never renders.
 * This component renders in-flow at the top of each page's ScrollView,
 * inheriting the safe-area offset already applied by the outer headerWrap.
 */
export function MoreSubHeader({ title }: { title: string }) {
  return (
    <View style={ls.bar}>
      <Pressable
        style={ls.backHit}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}>
        <Text style={ls.chevron}>‹</Text>
      </Pressable>

      <Text style={ls.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Phantom element keeps title centred */}
      <View style={ls.backHit} pointerEvents="none" />
    </View>
  );
}

const ls = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ivory,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 48,
  },
  backHit: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 30,
    lineHeight: 34,
    color: colors.navy,
    fontFamily: fonts.sansLight,
    includeFontPadding: false,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSizes.header,
    fontFamily: fonts.sansSemiBold,
    color: colors.navy,
    letterSpacing: 0.1,
  },
});
