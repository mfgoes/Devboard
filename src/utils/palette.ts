/** Shared color palette used by stickies and sections.
 *  sticky  = Tailwind *-200 pastel  (used as sticky note fill)
 *  section = Tailwind *-300 variant (slightly more saturated, used as section accent)
 */
export const PALETTE = [
  { label: 'Yellow', sticky: '#fde68a', section: '#fcd34d' },
  { label: 'Green',  sticky: '#bbf7d0', section: '#86efac' },
  { label: 'Blue',   sticky: '#bae6fd', section: '#7dd3fc' },
  { label: 'Pink',   sticky: '#fbcfe8', section: '#f9a8d4' },
  { label: 'Purple', sticky: '#ddd6fe', section: '#c4b5fd' },
  { label: 'Red',    sticky: '#fecaca', section: '#fca5a5' },
  { label: 'Orange', sticky: '#fed7aa', section: '#fdba74' },
  { label: 'Gray',   sticky: '#e2e8f0', section: '#cbd5e1' },
] as const;

/** Section accent color → corresponding sticky pastel. */
export const SECTION_TO_STICKY: Record<string, string> = {
  ...Object.fromEntries(PALETTE.map((p) => [p.section, p.sticky])),
  neutral: '#e2e8f0', // neutral section → gray/white sticky
};
