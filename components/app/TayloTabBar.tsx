import { appStyles as s } from '@/components/app/styles';
import { AheadIcon, ChatIcon, MoreIcon, TodayIcon } from '@/components/app/TabIcons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ICONS = {
  today: TodayIcon,
  ahead: AheadIcon,
  chat: ChatIcon,
  more: MoreIcon,
} as const;

const LABELS: Record<string, string> = {
  today: 'Today',
  ahead: 'Ahead',
  chat: 'Chat',
  more: 'More',
};

export function TayloTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      {state.routes.map((route, index) => {
        if (!(route.name in ICONS)) return null;
        const isFocused = state.index === index;
        const Icon = ICONS[route.name as keyof typeof ICONS];
        return (
          <Pressable
            key={route.key}
            style={[s.tab, isFocused && s.tabActive]}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              } else if (isFocused && route.name === 'more') {
                navigation.navigate('more', { screen: 'index' });
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}>
            <Icon active={isFocused} />
            <Text style={[s.tabLabel, isFocused && s.tabLabelActive]}>{LABELS[route.name]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
