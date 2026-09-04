import { washColor, type IconName, type Wash } from '@/lib/plan-icon';
import { colors } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

export function BrandGlyph({
  name,
  size = 16,
  color = colors.navy,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function BrandIconDisc({
  name,
  wash = 'blush',
  size = 44,
  glyphSize,
}: {
  name: IconName;
  wash?: Wash;
  size?: number;
  glyphSize?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: washColor[wash],
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name={name} size={glyphSize ?? Math.round(size * 0.44)} color={colors.navy} />
    </View>
  );
}
