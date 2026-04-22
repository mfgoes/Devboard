/**
 * Pure utilities for the file tree: icons, colors, constants, and data structures.
 * No dependencies on component state or hooks.
 */
import { CodeLanguage } from '../../types';

export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.venv', 'venv', '.idea', '.DS_Store',
]);

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico']);

export const DOC_EXTS = new Set(['md']);

export const CODE_EXTS: Record<string, CodeLanguage> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python',
  sql: 'sql',
  json: 'json',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  cs: 'csharp',
  gd: 'gdscript',
  txt: 'text', toml: 'text', yaml: 'text', yml: 'text',
  html: 'text', css: 'text',
};

export function ext(name: string): string {
  return name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File-type icon colours ────────────────────────────────────────────────────
// Light-mode variants are darkened for WCAG AA contrast on white backgrounds.
export function fileColor(name: string, isDark = true): string {
  const e = ext(name);
  if (isDark) {
    if (['ts', 'tsx'].includes(e))   return '#b87750';   // accent
    if (['js', 'jsx'].includes(e))   return '#d4835a';   // orange
    if (e === 'py')                   return '#7aaa72';   // green
    if (e === 'sql')                  return '#d4835a';   // orange
    if (e === 'json')                 return '#e2be72';   // yellow
    if (['md', 'txt'].includes(e))   return '#8a7b6c';   // text-lo
    if (IMAGE_EXTS.has(e))           return '#cc9468';   // accent2
    if (['css', 'html'].includes(e)) return '#c96a6a';   // red
    return '#afa294';                                      // text-md
  }
  // Light mode — higher-contrast equivalents
  if (['ts', 'tsx'].includes(e))   return '#7a3d1a';    // accent-light, darkened
  if (['js', 'jsx'].includes(e))   return '#8a3a15';    // orange-light, darkened
  if (e === 'py')                   return '#2d5a2a';    // green-light, darkened
  if (e === 'sql')                  return '#8a3a15';    // orange-light, darkened
  if (e === 'json')                 return '#6d5c0a';    // yellow-light, darkened
  if (['md', 'txt'].includes(e))   return '#5c4d42';    // text-lo-light, darkened
  if (IMAGE_EXTS.has(e))           return '#8a5a2a';    // accent2-light, darkened
  if (['css', 'html'].includes(e)) return '#7a2222';    // red-light, darkened
  return '#3d322a';                                       // text-md-light, darkened
}

export function FileIcon({ name, kind }: { name: string; kind: 'file' | 'directory' }) {
  if (kind === 'directory') {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M1 3.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3.5z"
          fill="rgba(212, 131, 90, 0.13)" stroke="#d4835a" strokeWidth="1.2" strokeLinejoin="round"
        />
      </svg>
    );
  }
  const color = fileColor(name);
  const e = ext(name);
  if (IMAGE_EXTS.has(e)) {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
        <rect x="1" y="2" width="11" height="9" rx="1.2" stroke={color} strokeWidth="1.2" />
        <circle cx="4" cy="5" r="1" fill={color} />
        <path d="M1 9L4 6.5l2 2L8.5 6l3.5 3.5" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="1" width="9" height="11" rx="1.2" stroke={color} strokeWidth="1.2" />
      <line x1="4" y1="4.5" x2="9" y2="4.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="4" y1="6.5" x2="9" y2="6.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
      <line x1="4" y1="8.5" x2="7" y2="8.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────
export interface TreeEntry {
  name: string;
  kind: 'file' | 'directory';
  path: string[];
  children?: TreeEntry[];
  expanded: boolean;
  loading: boolean;
}

export function buildEntry(name: string, kind: 'file' | 'directory', parentPath: string[]): TreeEntry {
  return { name, kind, path: [...parentPath, name], expanded: false, loading: false };
}

export function flatVisible(entries: TreeEntry[]): TreeEntry[] {
  const result: TreeEntry[] = [];
  for (const e of entries) {
    result.push(e);
    if (e.kind === 'directory' && e.expanded && e.children) result.push(...flatVisible(e.children));
  }
  return result;
}
