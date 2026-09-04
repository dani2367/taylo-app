import { colors, fonts } from '@/constants/theme';
import { Text, View } from 'react-native';

/** Lowercase taylo with terracotta ✦ on the t, slightly right of centre. */
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
      style={{ flexDirection: 'row', alignItems: 'flex-end', paddingTop: Math.round(star * 0.45) }}
      accessibilityRole="image"
      accessibilityLabel="taylo">
      <View>
        <Text style={letter}>t</Text>
        <Text
          style={{
            position: 'absolute',
            color: colors.terracotta,
            fontSize: star,
            lineHeight: star,
            top: -Math.round(star * 0.22),
            left: size * 0.58,
            includeFontPadding: false,
          }}>
          ✦
        </Text>
      </View>
      <Text style={[letter, { marginLeft: size * -0.06 }]}>aylo</Text>
    </View>
  );
}
