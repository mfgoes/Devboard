import { useBoardStore } from '../store/boardStore';
import type { Tool } from '../types';

// Tauri event listener — only active when running inside a Tauri window
export async function listenTauriMenus(handlers: Record<string, () => void>) {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten: Array<() => void> = [];
    for (const [event, handler] of Object.entries(handlers)) {
      unlisten.push(await listen(event, handler));
    }
    // URL opener (help menu links)
    const { listen: listenUrl } = await import('@tauri-apps/api/event');
    unlisten.push(await listenUrl('menu:open_url', (e) => {
      window.open(e.payload as string, '_blank', 'noopener');
    }));
    // Tool switcher (View > Tools menu)
    unlisten.push(await listen('menu:tool', (e) => {
      useBoardStore.getState().setActiveTool(e.payload as Tool);
    }));
    return () => unlisten.forEach((u) => u());
  } catch {
    return () => {};
  }
}

export function shouldKeepSidePanelOpenForTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest([
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[data-side-panel-open-target="true"]',
    '[data-native-clipboard="true"]',
    '[role="button"]',
    '[role="menu"]',
    '[role="dialog"]',
  ].join(','));
}

export function loadFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#board=(.+)$/);
  if (!match) return;
  try {
    const decoded = decodeURIComponent(escape(atob(match[1])));
    const data = JSON.parse(decoded);
    if (data.nodes && Array.isArray(data.nodes)) {
      useBoardStore.getState().loadBoard(data);
      history.replaceState(null, '', window.location.pathname);
    }
  } catch {
    console.warn('Failed to load board from URL hash.');
  }
}

export interface WorkspaceRoute {
  workspaceId?: string;
  noteId?: string;
  canvasId?: string;
  workspaceTitle?: string;
  noteTitle?: string;
  canvasTitle?: string;
}

/** Hash routes work on static hosting and never expose local filesystem paths. */
export function readWorkspaceRoute(): WorkspaceRoute | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash || hash.startsWith('board=')) return null;
  // Current readable route: #/workspace/project-name/note/arrival-scene?workspace=…&note=…
  // Legacy compact route: #workspace=…&note=…
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
  const params = new URLSearchParams(query);
  const workspaceId = params.get('workspace') || undefined;
  const noteId = params.get('note') || undefined;
  const canvasId = params.get('canvas') || undefined;
  if (!workspaceId && !noteId && !canvasId) return null;
  return { workspaceId, noteId, canvasId };
}

function routeSlug(value: string | undefined, fallback: string): string {
  const source = (value || fallback).trim().toLowerCase();
  return encodeURIComponent(
    source
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || fallback,
  );
}

export function workspaceRouteUrl(route: WorkspaceRoute): string {
  const params = new URLSearchParams();
  if (route.workspaceId) params.set('workspace', route.workspaceId);
  if (route.noteId) params.set('note', route.noteId);
  if (route.canvasId) params.set('canvas', route.canvasId);
  const segments: string[] = [];
  if (route.workspaceId) segments.push('workspace', routeSlug(route.workspaceTitle, 'private-workspace'));
  if (route.noteId) segments.push('note', routeSlug(route.noteTitle, 'untitled-note'));
  if (route.canvasId) segments.push('canvas', routeSlug(route.canvasTitle, 'untitled-canvas'));
  const path = segments.length ? `/${segments.join('/')}` : '';
  return `${window.location.origin}${window.location.pathname}#${path}?${params.toString()}`;
}

export function replaceWorkspaceRoute(route: WorkspaceRoute): void {
  const url = workspaceRouteUrl(route);
  if (window.location.href !== url) history.replaceState(null, '', url);
}

export async function isBraveBrowser(): Promise<boolean> {
  return !!(navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave
    && await (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave!.isBrave!();
}

export function generateId() { return Math.random().toString(36).slice(2, 11); }
