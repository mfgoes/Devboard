/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; click to place files on canvas.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { listDirectory, readWorkspaceFile, readWorkspaceFileAsUrl, readWorkspaceFileInfo, getWorkspaceName, openWorkspace, FSA_DIR_SUPPORTED } from '../utils/workspaceManager';
import { CodeLanguage, CodeBlockNode, ImageNode } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.venv', 'venv', '.idea', '.DS_Store',
]);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico']);
const CODE_EXTS: Record<string, CodeLanguage> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python',
  sql: 'sql',
  json: 'json',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  cs: 'csharp',
  gd: 'gdscript',
  md: 'text', txt: 'text', toml: 'text', yaml: 'text', yml: 'text',
  html: 'text', css: 'text',
};

function ext(name: string): string {
  return name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';
}

function generateId() { return Math.random().toString(36).slice(2, 11); }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File-type icon colours ────────────────────────────────────────────────────
function fileColor(name: string): string {
  const e = ext(name);
  if (['ts', 'tsx'].includes(e))   return '#3b82f6';
  if (['js', 'jsx'].includes(e))   return '#f59e0b';
  if (e === 'py')                   return '#10b981';
  if (e === 'sql')                  return '#f97316';
  if (e === 'json')                 return '#a3e635';
  if (['md', 'txt'].includes(e))   return '#94a3b8';
  if (IMAGE_EXTS.has(e))           return '#22d3ee'; // cyan
  if (['css', 'html'].includes(e)) return '#e879f9';
  return '#64748b';
}

function FileIcon({ name, kind }: { name: string; kind: 'file' | 'directory' }) {
  if (kind === 'directory') {
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M1 3.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3.5z"
          fill="#f59e0b22" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"
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
interface TreeEntry {
  name: string;
  kind: 'file' | 'directory';
  path: string[];
  children?: TreeEntry[];
  expanded: boolean;
  loading: boolean;
}

function buildEntry(name: string, kind: 'file' | 'directory', parentPath: string[]): TreeEntry {
  return { name, kind, path: [...parentPath, name], expanded: false, loading: false };
}

// ── Place-on-canvas helpers ───────────────────────────────────────────────────
function canvasCenter() {
  const { camera } = useBoardStore.getState();
  return {
    x: (-camera.x + window.innerWidth / 2) / camera.scale,
    y: (-camera.y + window.innerHeight / 2) / camera.scale,
  };
}

async function placeCodeFile(pathParts: string[]) {
  const relativePath = pathParts.join('/');
  const content = await readWorkspaceFile(relativePath);
  if (content === null) return;
  const { addNode } = useBoardStore.getState();
  const { x, y } = canvasCenter();
  const e = ext(pathParts[pathParts.length - 1]);
  const language: CodeLanguage = CODE_EXTS[e] ?? 'text';
  const lines = content.split('\n').length;
  const height = Math.min(Math.max(lines * 16, 120), 520);
  addNode({
    id: generateId(),
    type: 'codeblock',
    x: x - 260,
    y: y - height / 2,
    width: 520,
    height,
    code: content,
    language,
    title: pathParts[pathParts.length - 1],
    showLineNumbers: true,
    linkedFile: relativePath,
  } satisfies CodeBlockNode);
}

async function placeImageFile(pathParts: string[]) {
  const relativePath = pathParts.join('/');
  const objectUrl = await readWorkspaceFileAsUrl(relativePath);
  if (!objectUrl) return;
  const { addNode } = useBoardStore.getState();
  const { x, y } = canvasCenter();
  const imgEl = new window.Image();
  imgEl.onload = () => {
    const maxW = 480;
    const w = Math.min(imgEl.width, maxW);
    const h = Math.round(imgEl.height * (w / imgEl.width));
    addNode({
      id: generateId(),
      type: 'image',
      x: x - w / 2,
      y: y - h / 2,
      width: w,
      height: h,
      src: objectUrl,
      assetName: pathParts[pathParts.length - 1],
    } satisfies ImageNode);
  };
  imgEl.src = objectUrl;
}

// ── TreeRow ───────────────────────────────────────────────────────────────────
function TreeRow({
  entry,
  depth,
  onToggle,
  onFileClick,
  onImageHover,
  onImageLeave,
}: {
  entry: TreeEntry;
  depth: number;
  onToggle: (path: string[]) => void;
  onFileClick: (entry: TreeEntry) => void;
  onImageHover?: (entry: TreeEntry, clientY: number) => void;
  onImageLeave?: () => void;
}) {
  const isDir = entry.kind === 'directory';
  const isImage = !isDir && IMAGE_EXTS.has(ext(entry.name));
  const canOpen = !isDir && (CODE_EXTS[ext(entry.name)] !== undefined || isImage);
  const tooltip = canOpen ? `${entry.path.join('/')} — click to place on canvas` : entry.path.join('/');

  return (
    <>
      <div
        className="group flex items-center gap-1.5 h-[22px] pr-2 rounded cursor-pointer"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => isDir ? onToggle(entry.path) : onFileClick(entry)}
        onMouseEnter={(e) => isImage && onImageHover?.(entry, e.clientY)}
        onMouseLeave={() => isImage && onImageLeave?.()}
        title={tooltip}
      >
        {/* Expand arrow for directories */}
        <span className="w-3 flex items-center justify-center shrink-0 text-[var(--c-text-off)]" style={{ fontSize: 9 }}>
          {isDir ? (entry.loading ? '…' : entry.expanded ? '▾' : '▸') : ' '}
        </span>

        <FileIcon name={entry.name} kind={entry.kind} />

        {/* Show base name (truncated) + extension (always visible) */}
        {(() => {
          const color = isDir ? 'var(--c-text-hi)' : canOpen ? fileColor(entry.name) : 'var(--c-text-lo)';
          const dotIdx = isDir ? -1 : entry.name.lastIndexOf('.');
          const base = dotIdx > 0 ? entry.name.slice(0, dotIdx) : entry.name;
          const extn = dotIdx > 0 ? entry.name.slice(dotIdx) : '';
          return (
            <span className="flex-1 min-w-0 flex font-mono text-[11px]" style={{ color }}>
              <span className="truncate">{base}</span>
              {extn && <span className="shrink-0">{extn}</span>}
            </span>
          );
        })()}

        {canOpen && (
          <span className="hidden group-hover:inline text-[9px] text-[#6366f1] shrink-0">+</span>
        )}
      </div>

      {isDir && entry.expanded && entry.children && (
        <>
          {entry.children.map((child) => (
            <TreeRow
              key={child.path.join('/')}
              entry={child}
              depth={depth + 1}
              onToggle={onToggle}
              onFileClick={onFileClick}
              onImageHover={onImageHover}
              onImageLeave={onImageLeave}
            />
          ))}
          {entry.children.length === 0 && (
            <div
              className="text-[10px] text-[var(--c-text-off)] font-mono italic"
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 18 }}
            >
              empty
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Empty / no-workspace state ────────────────────────────────────────────────
function NoWorkspaceState({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 12, textAlign: 'center' }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.35 }}>
        <path d="M3 9a3 3 0 0 1 3-3h8l4 4H30a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinejoin="round" />
        <line x1="18" y1="16" x2="18" y2="24" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="20" x2="22" y2="20" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--c-text-hi)', fontWeight: 600, margin: '0 0 4px' }}>No folder open</p>
        <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-off)', margin: 0, lineHeight: 1.5 }}>
          Open a folder to browse files, place images and code snippets on the canvas.
        </p>
      </div>
      {FSA_DIR_SUPPORTED && (
        <button
          onClick={onOpen}
          style={{
            marginTop: 4,
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#4f46e5')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#6366f1')}
        >
          Open folder…
        </button>
      )}
      {!FSA_DIR_SUPPORTED && (
        <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--c-text-off)', margin: 0 }}>
          Requires Chrome, Edge, or the desktop app.
        </p>
      )}
    </div>
  );
}

// ── Persistent state (survives open/close cycles) ─────────────────────────────
let _savedPos: { x: number; y: number } | null = null;
let _savedWidth = 260;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

export default function WorkspaceExplorer({ onClose }: Props) {
  const workspaceName = useBoardStore((s) => s.workspaceName) ?? getWorkspaceName() ?? 'No folder open';
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [pos, setPos] = useState(_savedPos ?? { x: 8, y: 52 });
  const [width, setWidth] = useState(_savedWidth);
  const panelRef = useRef<HTMLDivElement>(null);

  // Image hover preview
  type ImagePreview = { url: string; natW: number; natH: number; size: number; clientY: number };
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const handleImageHover = useCallback((entry: TreeEntry, clientY: number) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const info = await readWorkspaceFileInfo(entry.path.join('/'));
      if (!info) return;
      if (previewUrlRef.current && previewUrlRef.current !== info.url) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = info.url;
      const img = new window.Image();
      img.onload = () => setImagePreview({ url: info.url, natW: img.naturalWidth, natH: img.naturalHeight, size: info.size, clientY });
      img.onerror = () => URL.revokeObjectURL(info.url);
      img.src = info.url;
    }, 250);
  }, []);

  const handleImageLeave = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setImagePreview(null);
  }, []);

  // Persist across open/close
  useEffect(() => { _savedPos = pos; }, [pos]);
  useEffect(() => { _savedWidth = width; }, [width]);

  // ── Drag to move (header) ────────────────────────────────────────────────────
  const onMouseDownHeader = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const start = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (me: MouseEvent) => {
      setPos({ x: start.origX + me.clientX - start.startX, y: start.origY + me.clientY - start.startY });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Drag to resize (right edge) ──────────────────────────────────────────────
  const onMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origW = width;
    const onMove = (me: MouseEvent) => {
      setWidth(Math.max(200, origW + me.clientX - startX));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Load root on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    setRootLoading(true);
    setRootError(null);
    listDirectory([])
      .then((entries) => {
        const filtered = entries.filter((e) => {
          if (e.name.startsWith('.')) return false;
          if (e.kind === 'directory' && SKIP_DIRS.has(e.name)) return false;
          return true;
        });
        setTree(filtered.map((e) => buildEntry(e.name, e.kind, [])));
        setRootLoading(false);
      })
      .catch(() => {
        // No workspace open — show the empty state (rootError stays null, tree stays [])
        setRootLoading(false);
      });
  }, []);

  // ── Tree update helper ───────────────────────────────────────────────────────
  const updateEntry = useCallback(
    (entries: TreeEntry[], path: string[], updater: (e: TreeEntry) => TreeEntry): TreeEntry[] =>
      entries.map((e) => {
        if (e.path.join('/') === path.join('/')) return updater(e);
        if (e.children && path.join('/').startsWith(e.path.join('/'))) {
          return { ...e, children: updateEntry(e.children, path, updater) };
        }
        return e;
      }),
    []
  );

  const handleToggle = useCallback(async (path: string[]) => {
    const findEntry = (entries: TreeEntry[], p: string[]): TreeEntry | null => {
      for (const e of entries) {
        if (e.path.join('/') === p.join('/')) return e;
        if (e.children) { const found = findEntry(e.children, p); if (found) return found; }
      }
      return null;
    };

    setTree((prev) => {
      const entry = findEntry(prev, path);
      if (!entry) return prev;
      if (entry.expanded) return updateEntry(prev, path, (e) => ({ ...e, expanded: false }));
      if (entry.children !== undefined) return updateEntry(prev, path, (e) => ({ ...e, expanded: true }));
      return updateEntry(prev, path, (e) => ({ ...e, expanded: true, loading: true }));
    });

    try {
      const rawChildren = await listDirectory(path);
      const filtered = rawChildren.filter((e) => {
        if (e.name.startsWith('.')) return false;
        if (e.kind === 'directory' && SKIP_DIRS.has(e.name)) return false;
        return true;
      });
      const children = filtered.map((e) => buildEntry(e.name, e.kind, path));
      setTree((prev) =>
        updateEntry(prev, path, (e) =>
          e.expanded ? { ...e, children, loading: false } : { ...e, children, loading: false, expanded: false }
        )
      );
    } catch {
      setTree((prev) => updateEntry(prev, path, (e) => ({ ...e, children: [], loading: false })));
    }
  }, [updateEntry]);

  const handleFileClick = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (IMAGE_EXTS.has(e)) {
      await placeImageFile(entry.path);
    } else if (CODE_EXTS[e] !== undefined) {
      await placeCodeFile(entry.path);
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const result = await openWorkspace();
    if (result) {
      useBoardStore.getState().setWorkspaceName?.(result.name);
      if (result.data) useBoardStore.getState().loadBoard(result.data);
      // Reload tree
      setRootLoading(true);
      setRootError(null);
      listDirectory([])
        .then((entries) => {
          const filtered = entries.filter((e) => !e.name.startsWith('.') && !(e.kind === 'directory' && SKIP_DIRS.has(e.name)));
          setTree(filtered.map((e) => buildEntry(e.name, e.kind, [])));
          setRootLoading(false);
        })
        .catch((err) => {
          setRootError(`Failed to read folder: ${err?.message ?? err}`);
          setRootLoading(false);
        });
    }
  }, []);

  const panelHeight = Math.min(520, window.innerHeight - pos.y - 16);

  return (
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        width,
        height: panelHeight,
        zIndex: 180,
        borderRadius: 12,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header — drag handle */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
          borderRadius: '12px 12px 0 0',
          cursor: 'grab',
        }}
        onMouseDown={onMouseDownHeader}
        className="active:cursor-grabbing"
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--c-text-hi)', letterSpacing: '0.04em' }}>
          Explorer
        </span>
        <button
          onClick={onClose}
          title="Close explorer"
          className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Workspace root label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, overflow: 'hidden' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5a1 1 0 0 1 1-1h1.8L5 3H8.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z" fill="#f59e0b33" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: 'var(--c-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={workspaceName}
        >
          {workspaceName}
        </span>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin', overflowX: 'hidden' }}>
        {rootLoading ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-off)', fontFamily: 'monospace' }}>Loading…</div>
        ) : !getWorkspaceName() ? (
          <NoWorkspaceState onOpen={handleOpenFolder} />
        ) : tree.length === 0 ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-off)', fontFamily: 'monospace', fontStyle: 'italic' }}>Folder is empty</div>
        ) : (
          tree.map((entry) => (
            <TreeRow key={entry.path.join('/')} entry={entry} depth={0} onToggle={handleToggle} onFileClick={handleFileClick} onImageHover={handleImageHover} onImageLeave={handleImageLeave} />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0, borderRadius: '0 0 12px 12px' }}>
        <p style={{ fontSize: 9, color: 'var(--c-text-off)', fontFamily: 'monospace', lineHeight: 1.4, margin: 0 }}>
          Click a file to place it on the canvas.
        </p>
      </div>

      {/* Right-edge resize handle */}
      <div
        onMouseDown={onMouseDownResizer}
        style={{ position: 'absolute', top: 12, right: -3, bottom: 12, width: 6, cursor: 'ew-resize', borderRadius: 3 }}
        title="Drag to resize"
      />

      {/* Image hover preview */}
      {imagePreview && (() => {
        const previewW = 220;
        const spaceRight = window.innerWidth - (pos.x + width + 8);
        const left = spaceRight >= previewW ? pos.x + width + 8 : pos.x - previewW - 8;
        const top = Math.max(8, Math.min(imagePreview.clientY - 70, window.innerHeight - 220));
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              zIndex: 200,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div style={{ background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, maxHeight: 160, overflow: 'hidden' }}>
              <img
                src={imagePreview.url}
                style={{ maxWidth: '100%', maxHeight: 160, display: 'block', objectFit: 'contain' }}
                alt=""
              />
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--c-text-hi)' }}>
                {imagePreview.natW} × {imagePreview.natH}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-off)' }}>
                {formatSize(imagePreview.size)}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
