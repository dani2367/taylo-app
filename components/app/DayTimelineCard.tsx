import { BrandGlyph, BrandIconDisc } from '@/components/app/BrandIcon';
import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { dayMood, happenCountLabel, isPreviewHappenId, type HappenItem } from '@/lib/happening';
import { Pressable, Text, View } from 'react-native';

const DAY_ICON = 36;

export function DayTimelineCard({
  kicker = 'Today',
  items,
  footer,
  onItemPress,
}: {
  kicker?: string;
  items: HappenItem[];
  footer?: { label: string; onPress: () => void };
  onItemPress?: (item: HappenItem) => void;
}) {
  if (!items.length) return null;

  return (
    <View style={s.homeDayCard}>
      <View style={s.homeDayHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.homeDayKicker}>{kicker}</Text>
          <Text style={s.homeDayTitle}>{dayMood(items.length)}</Text>
          <Text style={s.homeDayCount}>{happenCountLabel(items.length)}</Text>
        </View>
        <BrandGlyph name="sunny-outline" size={22} color={colors.terracotta} />
      </View>
      {items.map((item, index) => {
        const row = (
          <View style={s.homeDayRow}>
            <View style={s.homeDayRailCol}>
              {index > 0 ? (
                <View style={s.homeDayRailUp} pointerEvents="none">
                  {[0, 1, 2].map((dot) => (
                    <View key={dot} style={s.homeDayDot} />
                  ))}
                </View>
              ) : null}
              <BrandIconDisc name={item.icon.name} wash={item.icon.wash} size={DAY_ICON} />
              {index < items.length - 1 ? (
                <View style={s.homeDayRailDown} pointerEvents="none">
                  {[0, 1, 2].map((dot) => (
                    <View key={dot} style={s.homeDayDot} />
                  ))}
                </View>
              ) : null}
            </View>
            <Text style={s.homeDayTime}>{item.time}</Text>
            <View style={s.ncopy}>
              <Text style={s.homeDayName} numberOfLines={1}>
                {item.title}
              </Text>
              {item.sub ? <Text style={s.homeDaySub}>{item.sub}</Text> : null}
            </View>
          </View>
        );
        if (!onItemPress || isPreviewHappenId(item.id)) return <View key={item.id}>{row}</View>;
        return (
          <Pressable key={item.id} onPress={() => onItemPress(item)}>
            {row}
          </Pressable>
        );
      })}
      {footer ? (
        <Pressable style={s.homeDayFooter} onPress={footer.onPress}>
          <Text style={s.homeDayFooterText}>{footer.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
