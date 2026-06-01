export const DARK_MENU_COLORS = {
  surface: 'rgba(22,22,22,0.96)',
  border: 'rgba(255,255,255,0.10)',
  hover: 'rgba(255,255,255,0.10)',
  hoverStrong: 'rgba(255,255,255,0.14)',
  text: 'rgba(255,255,255,0.78)',
  textHi: '#ffffff',
  textMuted: 'rgba(255,255,255,0.48)',
  textSubtle: 'rgba(255,255,255,0.35)',
  textDisabled: 'rgba(255,255,255,0.25)',
  accent: '#cc9468',
  shadow: '0 18px 42px rgba(0,0,0,0.32)',
} as const;

export const DARK_MENU_CLASSES = {
  panel: 'rounded-xl border border-white/10 bg-[rgba(22,22,22,0.96)] shadow-2xl',
  itemBase: 'w-full flex items-center gap-2.5 px-3 py-1.5 font-sans text-[12px] text-left transition-colors',
  itemEnabled: 'text-white/78 hover:text-white hover:bg-white/10',
  itemActive: 'text-white bg-white/10',
  itemDisabled: 'text-white/25 cursor-default',
  accent: 'text-[#cc9468]',
  muted: 'text-white/50',
  label: 'px-3 py-0.5 font-sans text-[10px] text-white/35 uppercase tracking-widest select-none',
  badge: 'text-[9px] font-sans text-white/60 border border-white/10 bg-white/10 rounded px-1 py-0.5 uppercase tracking-wide',
  divider: 'my-1 h-px bg-white/10 mx-2',
} as const;
