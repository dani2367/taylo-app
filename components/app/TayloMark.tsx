import { colors, fonts } from '@/constants/theme';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

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

export function NoticedStar({
  unread,
  onPress,
  size = 16,
}: {
  unread: boolean;
  onPress?: () => void;
  size?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!unread) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.28,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [unread, pulse]);

  const star = (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <TayloMark size={size} />
    </Animated.View>
  );

  if (!onPress) return star;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Taylo noticed — tap to read">
      {star}
    </Pressable>
  );
}
