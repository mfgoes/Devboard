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
  { label: 'Gold',     sticky: '#F5D76E', section: '#e2be72' },
  { label: 'Rust',     sticky: '#E6956B', section: '#d4835a' },
  { label: 'Forest',   sticky: '#9BC184', section: '#7aaa72' },
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

/** Swatch set for sticky note fills — one pastel per palette entry. */
export const STICKY_COLORS = PALETTE.map((p) => ({ hex: p.sticky, label: p.label }));

/** Swatch set for text color (stickies, text blocks) — vivid, high-contrast on both themes. */
export const TEXT_COLORS = [
  { label: 'Auto',   hex: 'auto' },
  { label: 'White',  hex: '#e2e8f0' },
  { label: 'Yellow', hex: '#fbbf24' },
  { label: 'Green',  hex: '#4ade80' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Blue',   hex: '#60a5fa' },
  { label: 'Purple', hex: '#a78bfa' },
  { label: 'Red',    hex: '#f87171' },
  { label: 'Orange', hex: '#fb923c' },
];

/** Swatch set for shape fills — same base palette as stickies, plus neutrals and no-fill. */
export const SHAPE_FILLS = [
  ...STICKY_COLORS,
  { hex: '#e2e8f0', label: 'White' },
  { hex: '#334155', label: 'Dark' },
  { hex: 'var(--c-line)', label: 'Indigo' },
  { hex: 'transparent', label: 'No fill' },
];

/** Swatch set for shape strokes — the more saturated section variant of the palette. */
export const SHAPE_STROKES = [
  { hex: 'transparent', label: 'No stroke' },
  ...PALETTE.map((p) => ({ hex: p.section, label: p.label })),
  { hex: '#334155', label: 'Dark' },
  { hex: '#e2e8f0', label: 'White' },
];

/** Swatch set for shape text color. Auto uses '' (not 'auto') — sentinel maps to `fontColor: undefined`. */
export const SHAPE_TEXT_COLORS = [
  { label: 'Auto',   hex: '' },
  { label: 'White',  hex: '#e2e8f0' },
  { label: 'Dark',   hex: '#1a1a2e' },
  { label: 'Yellow', hex: '#fbbf24' },
  { label: 'Green',  hex: '#4ade80' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Blue',   hex: '#60a5fa' },
  { label: 'Red',    hex: '#f87171' },
];
