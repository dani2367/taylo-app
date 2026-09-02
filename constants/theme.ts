/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Platform } from 'react-native';

export const colors = {
  rose: '#C9917A',
  roseDark: '#A86E58',
  roseLight: '#F5EDE8',
  roseDeep: '#3D1F15',
  tealLight: '#EAF0EC',
  teal: '#4A7560',
  amberLight: '#F5EFE4',
  amber: '#9A7A3A',
  blueLight: '#EAEEF2',
  blue: '#4A6880',
  purpleLight: '#F0EDF5',
  purple: '#7A6A90',
  greenLight: '#EAF3DE',
  green: '#3B6D11',
  grayLight: '#F5F1EE',
  gray: '#9A9490',
  text: '#2A1F1A',
  textMuted: '#6b5d58',
  textHint: '#a8998f',
  border: 'rgba(100,60,40,0.10)',
  cream: '#FFFAF8',
  white: '#fff',
  whiteMuted: 'rgba(255,255,255,0.2)',
  whiteTrack: 'rgba(255,255,255,0.25)',
  whiteOutline: 'rgba(255,255,255,0.55)',
  transparent: 'transparent',
  switchOn: '#25D366',
  choiceShadow: 'rgba(169,90,60,0.12)',
  knobShadow: 'rgba(0,0,0,0.2)',
  tabShadow: 'rgba(60,30,15,0.09)',
  headerPill: 'rgba(255,255,255,0.15)',
  headerStat: 'rgba(255,255,255,0.95)',
  drawerScrim: 'rgba(30,15,10,0.35)',
  drawerShadow: 'rgba(30,15,10,0.2)',
  blueDeep: '#0C447C',
  blueMid: '#185FA5',
  amberDeep: '#633806',
  amberMid: '#854F0B',
  blueProgBorder: 'rgba(74,104,128,0.3)',
  amberProgBorder: 'rgba(154,122,58,0.3)',
};

export const fonts = {
  serif: 'DMSerifDisplay_400Regular',
  sansLight: 'DMSans_300Light',
  sansRegular: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
};

/** iPhone-readable type scale (pt). Use these instead of prototype HTML px sizes. */
export const fontSizes = {
  micro: 11,
  caption: 12,
  label: 13,
  body: 15,
  card: 15,
  title: 16,
  chat: 16,
  header: 17,
  display: 22,
} as const;

export const fontAssets = {
  DMSerifDisplay_400Regular,
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
};

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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
