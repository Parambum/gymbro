/**
 * Hex values mirroring tailwind.config.js. Needed wherever a raw colour is
 * required instead of a class name — SVG icon props, navigation options.
 */
export const colors = {
  ink950: '#08080A',
  ink900: '#0E0E11',
  ink850: '#141418',
  ink800: '#1B1B20',
  ink750: '#232329',
  ink700: '#2C2C34',
  ink600: '#3F3F49',
  ink500: '#5A5A66',
  ink400: '#8A8A99',
  ink300: '#B4B4C0',
  ink200: '#D8D8E0',
  flame300: '#FDBA74',
  flame400: '#FB923C',
  flame500: '#F97316',
  flame600: '#EA580C',
  volt: '#FACC15',
  white: '#FFFFFF',
} as const;
