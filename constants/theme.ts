/**
 * Taylo brand tokens. Typical screen mix: ~60% ivory/cream, ~25% navy,
 * ~10% pastel, ~5% terracotta.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';

export const taylo = {
  navy: '#172B45',
  ivory: '#F8F3EC',
  cream: '#FFFDF9',
  blush: '#F2DED8',
  sage: '#DDE8E2',
  paleBlue: '#DCE7ED',
  terracotta: '#C98F72', // brand accent / star — do not drift this hex
};

const navyMuted = '#4A5C70';
const navyHint = '#8A96A3';

export const colors = {
  navy: taylo.navy,
  ivory: taylo.ivory,
  cream: taylo.cream,
  blush: taylo.blush,
  sage: taylo.sage,
  paleBlue: taylo.paleBlue,
  terracotta: taylo.terracotta,

  text: taylo.navy,
  textMuted: navyMuted,
  textHint: navyHint,
  border: 'rgba(23,43,69,0.06)',

  background: taylo.ivory,
  grayLight: taylo.ivory,

  /** Cream stand-in — never pure white. Use for on-navy text and elevated fills. */
  white: taylo.cream,
  whiteMuted: 'rgba(23,43,69,0.08)',
  whiteTrack: 'rgba(23,43,69,0.12)',
  whiteOutline: 'rgba(23,43,69,0.35)',
  transparent: 'transparent',

  primary: taylo.terracotta,
  onPrimary: taylo.cream,

  /** Legacy primary fill → terracotta. Navy is ink, not fill. */
  rose: taylo.terracotta,
  roseDark: taylo.navy,
  roseLight: taylo.blush,
  roseDeep: taylo.navy,

  tealLight: taylo.sage,
  teal: taylo.navy,
  amberLight: taylo.paleBlue,
  amber: taylo.navy,
  blueLight: taylo.paleBlue,
  blue: taylo.navy,
  purpleLight: taylo.blush,
  purple: taylo.navy,
  greenLight: taylo.sage,
  green: taylo.navy,

  switchOn: taylo.terracotta,
  choiceShadow: 'rgba(23,43,69,0.06)',
  knobShadow: 'rgba(23,43,69,0.12)',
  tabShadow: 'rgba(23,43,69,0.04)',
  cardShadow: 'rgba(23,43,69,0.045)',
  headerPill: taylo.cream,
  headerStat: taylo.navy,
  drawerScrim: 'rgba(23,43,69,0.35)',
  drawerShadow: 'rgba(23,43,69,0.12)',
  blueDeep: taylo.navy,
  blueMid: navyMuted,
  amberDeep: taylo.navy,
  amberMid: navyMuted,
  blueProgBorder: 'rgba(23,43,69,0.12)',
  amberProgBorder: 'rgba(23,43,69,0.12)',
};

export const fonts = {
  /** Cormorant Garamond — display only (wordmark, screen titles, headlines ≥18px). */
  serif: 'CormorantGaramond_600SemiBold',
  serifMedium: 'CormorantGaramond_500Medium',
  /** Inter — all UI, labels, body, buttons. */
  sansLight: 'Inter_300Light',
  sansRegular: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
};

/** iPhone-readable type scale (pt). Serif should not be used below ~18–20. */
export const fontSizes = {
  micro: 12,
  caption: 13,
  label: 14,
  body: 15,
  card: 16,
  title: 18,
  chat: 16,
  header: 17,
  display: 34,
} as const;

export const space = {
  gutter: 18,
  cardPad: 16,
  cardGap: 10,
  sectionTop: 20,
} as const;

export const radii = {
  card: 18,
  button: 20,
  chip: 12,
} as const;

export const fontAssets = {
  CormorantGaramond_500Medium: require('@expo-google-fonts/cormorant-garamond/CormorantGaramond_500Medium.ttf'),
  CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/CormorantGaramond_600SemiBold.ttf'),
  Inter_300Light: require('@expo-google-fonts/inter/Inter_300Light.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/Inter_700Bold.ttf'),
  ...Ionicons.font,
};

const tintColorLight = taylo.terracotta;
const tintColorDark = taylo.cream;

export const Colors = {
  light: {
    text: taylo.navy,
    background: taylo.ivory,
    tint: tintColorLight,
    icon: navyMuted,
    tabIconDefault: navyHint,
    tabIconSelected: taylo.terracotta,
  },
  dark: {
    text: taylo.ivory,
    background: taylo.navy,
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
