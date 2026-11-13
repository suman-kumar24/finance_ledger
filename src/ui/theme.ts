import { useColorScheme } from 'react-native';

import { useSettings } from '@/hooks/useSettings';

export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  positive: string;
  positiveSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
  track: string;
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#F5F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF0ED',
  text: '#13201C',
  textMuted: '#56645F',
  border: '#DCE3DF',
  accent: '#0F6B5A',
  accentSoft: '#DBEEE8',
  onAccent: '#FFFFFF',
  positive: '#1B7A4B',
  positiveSoft: '#DDF1E5',
  warning: '#8F5600',
  warningSoft: '#FBEACB',
  danger: '#B3261E',
  dangerSoft: '#F9DEDC',
  scrim: 'rgba(10, 20, 17, 0.45)',
  track: '#E3E9E5',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0D1412',
  surface: '#161F1C',
  surfaceAlt: '#1E2925',
  text: '#E7F0EC',
  textMuted: '#9DADA7',
  border: '#2A3632',
  accent: '#62D5B5',
  accentSoft: '#17382F',
  onAccent: '#06231C',
  positive: '#74D7A0',
  positiveSoft: '#173425',
  warning: '#F3BC5B',
  warningSoft: '#3A2C10',
  danger: '#F28B82',
  dangerSoft: '#3D1C1A',
  scrim: 'rgba(0, 0, 0, 0.6)',
  track: '#26322E',
};

/** Material 3 spacing steps (dp). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
/** Minimum touch target (dp). */
export const TOUCH = 48;

export function useTheme(): Palette {
  const system = useColorScheme();
  const { theme } = useSettings();
  const dark = theme === 'system' ? system === 'dark' : theme === 'dark';
  return dark ? DARK : LIGHT;
}
