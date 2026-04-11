/** Shared color palette used by stickies and sections.
 *  sticky  = muted pastel (used as sticky note fill)
 *  section = slightly more saturated variant (used as section accent)
 */
export const PALETTE = [
  { label: 'Cream',    sticky: '#FFF9C4', section: '#FFF176' },
  { label: 'Apricot',  sticky: '#FFE0B2', section: '#FFCC80' },
  { label: 'Mint',     sticky: '#C8E6C9', section: '#A5D6A7' },
  { label: 'Rose',     sticky: '#F8BBD0', section: '#F48FB1' },
  { label: 'Lavender', sticky: '#E1BEE7', section: '#CE93D8' },
  { label: 'Blue',     sticky: '#BBDEFB', section: '#90CAF9' },
  { label: 'Slate',    sticky: '#CFD8DC', section: '#B0BEC5' },
] as const;

/** Design system accent colors (warm brown palette). */
export const ACCENT_COLORS = {
  primary: '#b87750',    // --c-line (dark mode) / #a06038 (light)
  secondary: '#cc9468',  // --c-line-pre (dark) / #b87848 (light)
  yellow: '#e2be72',     // --c-yellow (dark) / #b8921e (light)
  orange: '#d4835a',     // --c-orange (dark) / #b06030 (light)
  green: '#7aaa72',      // --c-green (dark) / #528a4a (light)
  red: '#c96a6a',        // --c-red (dark) / #a84040 (light)
} as const;

/** Light mode accent colors. */
export const ACCENT_COLORS_LIGHT = {
  primary: '#a06038',
  secondary: '#b87848',
  yellow: '#b8921e',
  orange: '#b06030',
  green: '#528a4a',
  red: '#a84040',
} as const;

/** Demo board sticky note colors (from design system palette). */
export const DEMO_COLORS = {
  ideas: ACCENT_COLORS.yellow,    // "Drop ideas"
  connect: ACCENT_COLORS.orange,  // "Connect them"
  share: ACCENT_COLORS.green,     // "Share & export"
  connector: ACCENT_COLORS.primary, // Connector lines
} as const;

/**
 * Resolve a CSS custom property to its computed hex/rgb value for use in
 * Konva canvas rendering (canvas 2D does not resolve CSS vars natively).
 * Falls back to the input string if resolution fails.
 */
export function resolveCssColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || varName;
}

/** Section accent color → corresponding sticky pastel. */
export const SECTION_TO_STICKY: Record<string, string> = {
  ...Object.fromEntries(PALETTE.map((p) => [p.section, p.sticky])),
  neutral: '#CFD8DC', // neutral section → slate sticky
};
