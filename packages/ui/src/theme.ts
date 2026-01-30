export const brandColors = {
  primary: '#E85D04',
  primaryDark: '#D14E00',
  primaryLight: '#FF7B2E',
  secondary: '#1A1A2E',
  accent: '#FFB627',
  success: '#10B981',
  background: '#FEFDFB',
  backgroundWarm: '#FFF8F0',
  backgroundDark: '#0F0F1A',
  text: '#1A1A2E',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  border: '#E2E8F0'
} as const;

export const brandRadii = {
  sm: 10,
  md: 16,
  lg: 20,
  pill: 999
} as const;

export const brandSpacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32
} as const;

export const brandTypography = {
  display: 'Anybody',
  body: 'DM Sans'
} as const;

export const brandTheme = {
  colors: brandColors,
  radii: brandRadii,
  spacing: brandSpacing,
  typography: brandTypography
} as const;

