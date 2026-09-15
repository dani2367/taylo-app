import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import {
  calendarStripDays,
  monthGridDays,
  monthPrefix,
  monthTitle,
  weekCellInitial,
  ymdLocal,
} from '@/lib/schedule';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Pressable, Text, View } from 'react-native';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function ScheduleMonthCalendar({
  monthKey,
  selectedYmd,
  today,
  markedYmds,
  expanded,
  onToggleExpanded,
  onChangeMonth,
  onSelectDay,
}: {
  monthKey: string;
  selectedYmd: string;
  today: Date;
  markedYmds: Set<string>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChangeMonth: (delta: number) => void;
  onSelectDay: (ymd: string) => void;
}) {
  const todayYmd = ymdLocal(today);
  const days = expanded ? monthGridDays(monthKey) : calendarStripDays(monthKey, selectedYmd);

  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-20, 20])
    .onEnd((event) => {
      'worklet';
      if (event.translationX <= -48) runOnJS(onChangeMonth)(1);
      else if (event.translationX >= 48) runOnJS(onChangeMonth)(-1);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={s.scheduleCal}>
        <View style={s.scheduleCalHead}>
          <Pressable
            style={s.scheduleCalNav}
            onPress={() => onChangeMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={18} color={colors.navy} />
          </Pressable>
          <Pressable
            style={s.scheduleCalMonthBtn}
            onPress={onToggleExpanded}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse calendar' : 'Expand calendar'}
            accessibilityState={{ expanded }}>
            <Text style={s.scheduleCalMonth}>{monthTitle(monthKey, today)}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textHint} />
          </Pressable>
          <Pressable
            style={s.scheduleCalNav}
            onPress={() => onChangeMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={18} color={colors.navy} />
          </Pressable>
        </View>

        <View style={s.scheduleCalDow}>
          {DOW.map((label, index) => (
            <Text key={`${label}-${index}`} style={s.scheduleCalDowText}>
              {label}
            </Text>
          ))}
        </View>

        <View style={s.scheduleCalGrid}>
          {days.map((day) => {
            const ymd = ymdLocal(day);
            const inMonth = monthPrefix(day) === monthKey;
            const on = ymd === selectedYmd;
            const isToday = ymd === todayYmd;
            return (
              <Pressable
                key={ymd}
                style={[
                  s.scheduleCalCell,
                  on && s.scheduleCalCellOn,
                  isToday && !on && s.scheduleCalCellToday,
                  !inMonth && s.scheduleCalCellOut,
                ]}
                onPress={() => onSelectDay(ymd)}
                accessibilityRole="button"
                accessibilityLabel={`${weekCellInitial(day)} ${day.getDate()}${markedYmds.has(ymd) ? ', has plans' : ''}`}>
                <Text style={[s.scheduleCalNum, on && s.scheduleCalNumOn]}>{day.getDate()}</Text>
                <View style={[s.scheduleCalDot, markedYmds.has(ymd) && s.scheduleCalDotOn]} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </GestureDetector>
  );
}
