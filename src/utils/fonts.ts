/** Centralized font family definitions for consistent UI styling */

export const FONTS = {
  /** Main UI font - Jakarta Sans */
  ui: "'Plus Jakarta Sans', sans-serif",

  /** Code/monospace font - JetBrains Mono */
  code: "'JetBrains Mono', 'Fira Code', monospace",

  /** Fallback system fonts */
  sans: 'system-ui, sans-serif',
  mono: 'monospace',
} as const;

export default FONTS;
