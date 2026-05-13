import { useBoardStore } from './store/boardStore';

export type ThemeName = 'dark' | 'light';

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
  canvasBg: '#1c1916',
  dotColor: '#2c2620',
  panelBg: '#242019',
  border: '#3c3529',
  textHi: '#ece6dd',
  textLo: '#8a7b6c',
  textOff: '#4a3a28',
  connectorColor: '#b87750',
  connectorPreview: '#cc9468',
  sectionLabelColor: '#ffffff',
};

const LIGHT: ThemeColors = {
  canvasBg: '#f6f1ea',
  dotColor: '#d8d0c4',
  panelBg: '#ede7dd',
  border: '#cdc4b6',
  textHi: '#28201a',
  textLo: '#9a8878',
  textOff: '#bbb5af',
  connectorColor: '#a06038',
  connectorPreview: '#b87848',
  sectionLabelColor: '#28201a',
};

export function applyTheme(theme: ThemeName) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('light', isLight);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--initial-bg', isLight ? LIGHT.canvasBg : DARK.canvasBg);
}

export function applyStoredTheme() {
  applyTheme(useBoardStore.getState().theme);
}

export function useTheme(): ThemeColors {
  const theme = useBoardStore((s) => s.theme);
  return theme === 'light' ? LIGHT : DARK;
}
