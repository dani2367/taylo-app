import { colors } from '@/constants/theme';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export function TodayIcon({ active }: { active: boolean }) {
  const c = active ? colors.roseDark : colors.textHint;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9,22 9,12 15,12 15,22" />
    </Svg>
  );
}

export function AheadIcon({ active }: { active: boolean }) {
  const c = active ? colors.roseDark : colors.textHint;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Line x1="16" y1="2" x2="16" y2="6" />
      <Line x1="8" y1="2" x2="8" y2="6" />
      <Line x1="3" y1="10" x2="21" y2="10" />
    </Svg>
  );
}

export function ChatIcon({ active }: { active: boolean }) {
  const c = active ? colors.roseDark : colors.textHint;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

export function MoreIcon({ active }: { active: boolean }) {
  const c = active ? colors.roseDark : colors.textHint;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
      <Circle cx="12" cy="12" r="1.5" fill={c} />
      <Circle cx="19" cy="12" r="1.5" fill={c} />
      <Circle cx="5" cy="12" r="1.5" fill={c} />
    </Svg>
  );
}

export function MicIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2}>
      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <Line x1="12" y1="19" x2="12" y2="23" />
      <Line x1="8" y1="23" x2="16" y2="23" />
    </Svg>
  );
}

export function SendIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.5}>
      <Line x1="22" y1="2" x2="11" y2="13" />
      <Path d="M22 2 L15 22 L11 13 L2 9 Z" fill={colors.white} stroke={colors.white} />
    </Svg>
  );
}
