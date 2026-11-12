import { useColorScheme } from 'react-native';

const light = {
  bg: '#FBF7F1',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EDE4',
  ink: '#25232B',
  inkSoft: '#6B6672',
  line: '#E6DED2',
  primary: '#D9573B',
  primaryInk: '#FFFFFF',
  primarySoft: '#FBE4DC',
  /** Second tile colour ("נוספו לאחרונה"), distinct from the categories' own colours. */
  accent: '#5B4FC4',
  good: '#2E8B57',
  warn: '#C77B12',
  bad: '#C0392B',
  /** Behind a sheet over the screen. */
  scrim: 'rgba(20, 16, 24, 0.45)',
};

const dark: typeof light = {
  bg: '#16151A',
  surface: '#211F27',
  surfaceAlt: '#2A2731',
  ink: '#F4F1EC',
  inkSoft: '#A9A3B0',
  line: '#35323C',
  primary: '#F07A5E',
  primaryInk: '#1A1214',
  primarySoft: '#3A2520',
  accent: '#7D6FE0',
  good: '#5CC28A',
  warn: '#E7A64A',
  bad: '#F0796B',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export type Palette = typeof light;

/** Dark mode matters for nap time in a darkened room. */
export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  bold: 'Rubik_700Bold',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 10, m: 16, l: 24 };
/** Minimum touch target, from the design principles. */
export const TOUCH = 48;

/** Raised cards that float over the screen (status banner, toasts). */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
} as const;
