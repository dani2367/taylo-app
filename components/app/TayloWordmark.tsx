import { colors, fonts } from '@/constants/theme';
import { Text, View } from 'react-native';

/** Lowercase taylo with terracotta ✦ just off the right of the o. */
export function TayloWordmark({
  size = 32,
  color = colors.navy,
}: {
  size?: number;
  color?: string;
}) {
  const star = Math.max(11, Math.round(size * 0.32));
  const lineHeight = Math.round(size * 1.05);
  const letter = {
    fontFamily: fonts.serif,
    fontSize: size,
    lineHeight,
    letterSpacing: size > 36 ? -1 : -0.4,
    color,
  } as const;

  return (
    <View
      style={{
        paddingTop: Math.round(star * 0.28),
        paddingRight: Math.round(star * 0.72),
      }}
      accessibilityRole="image"
      accessibilityLabel="taylo">
      <Text style={letter}>taylo</Text>
      <Text
        style={{
          position: 'absolute',
          right: 0,
          top: -Math.round(star * 0.12),
          color: colors.terracotta,
          fontSize: star,
          lineHeight: star,
          includeFontPadding: false,
        }}>
        ✦
      </Text>
    </View>
  );
}
