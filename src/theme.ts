import { useBoardStore } from './store/boardStore';

export interface ThemeColors {
  canvasBg: string;
  dotColor: string;
  panelBg: string;
  border: string;
  textHi: string;
  textLo: string;
  textOff: string;
  connectorColor: string;
  connectorPreview: string;
  sectionLabelColor: string;
}

const DARK: ThemeColors = {
  canvasBg: '#111118',
  dotColor: '#3a3a4a',
  panelBg: '#1a1a2a',
  border: '#2e2e46',
  textHi: '#e2e8f0',
  textLo: '#8888aa',
  textOff: '#4a4a6a',
  connectorColor: '#6366f1',
  connectorPreview: '#818cf8',
  sectionLabelColor: '#ffffff',
};

const LIGHT: ThemeColors = {
  canvasBg: '#f0f0ec',
  dotColor: '#c0c0cc',
  panelBg: '#ffffff',
  border: '#d4d4e0',
  textHi: '#18181b',
  textLo: '#71717a',
  textOff: '#a1a1aa',
  connectorColor: '#4f46e5',
  connectorPreview: '#6366f1',
  sectionLabelColor: '#18181b',
};

export function useTheme(): ThemeColors {
  const theme = useBoardStore((s) => s.theme);
  return theme === 'light' ? LIGHT : DARK;
}
