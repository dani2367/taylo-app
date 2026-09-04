import { colors, fonts } from '@/constants/theme';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/** Terracotta ✦ — prefix only for Taylo’s observations, never decoration. */
export function TayloMark({
  size = 13,
  style,
}: {
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      accessibilityLabel=""
      style={[
        {
          color: colors.terracotta,
          fontFamily: fonts.sansRegular,
          fontSize: size,
          lineHeight: size + 3,
        },
        style,
      ]}>
      ✦
    </Text>
  );
}
