import { colors } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

function glyph(name: IconName, active: boolean) {
  return <Ionicons name={name} size={18} color={active ? colors.terracotta : colors.textHint} />;
}

export function TodayIcon({ active }: { active: boolean }) {
  return glyph(active ? 'home' : 'home-outline', active);
}

export function AheadIcon({ active }: { active: boolean }) {
  return glyph(active ? 'calendar' : 'calendar-outline', active);
}

export function ChatIcon({ active }: { active: boolean }) {
  return glyph(active ? 'chatbubble' : 'chatbubble-outline', active);
}

export function MoreIcon({ active }: { active: boolean }) {
  return glyph(active ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline', active);
}

export function MicIcon() {
  return <Ionicons name="mic-outline" size={16} color={colors.textMuted} />;
}

export function SendIcon() {
  return <Ionicons name="send" size={16} color={colors.cream} />;
}

export function MenuIcon() {
  return <Ionicons name="menu-outline" size={22} color={colors.textMuted} />;
}
