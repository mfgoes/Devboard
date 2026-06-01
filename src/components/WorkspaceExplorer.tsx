/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; opens note files and places assets on canvas.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useAuth } from '../contexts/AuthContext';
import type { Camera, CanvasNode, Document, ImageNode, PageMeta } from '../types';
import { listDirectory, readWorkspaceFile, readWorkspaceFileAsUrl, readWorkspaceFileInfo, getWorkspaceName, openWorkspace, renameEntry, createDirectory, deleteEntry, FSA_DIR_SUPPORTED, IN_IFRAME, IS_TAURI, revealInFinder, saveTextFileToWorkspace, saveWorkspace, loadImageAsset, findImageInWorkspace, hasWorkspaceHandle } from '../utils/workspaceManager';
import { FONTS } from '../utils/fonts';
import { placeCodeFile, placeImageFile, placeDocumentFile, openDocumentFile } from '../utils/canvasPlacement';
import { markdownBodyToHtml, titleFromMarkdown } from '../utils/exportMarkdown';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile, stripHtmlPreview } from '../utils/documentExport';
import { toast } from '../utils/toast';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import devboardIconUrl from '../assets/devboard_icon.png';
import { useFilePreview } from '../hooks/useFilePreview';
import { useTreeState } from '../hooks/useTreeState';
import { IconCloud, IconFolder, IconSidebarToggle, IconStar } from './icons';
import { DARK_MENU_COLORS } from './darkMenuTheme';
import {
  SKIP_DIRS,
  IMAGE_EXTS,
  CODE_EXTS,
  DOC_EXTS,
  ext,
  generateId,
  formatSize,
  fileColor,
  FileIcon,
  TreeEntry,
  buildEntry,
  flatVisible,
} from './explorer/fileTreeUtils';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ms).toLocaleDateString();
}

const explorerSectionHeaderStyle: React.CSSProperties = {
  fontFamily: FONTS.ui,
  fontSize: 9.5,
  fontWeight: 650,
  letterSpacing: '0.02em',
  color: 'var(--c-text-md)',
};

const explorerFocusedRowStyle: React.CSSProperties = {
  background: 'rgba(184,119,80,0.12)',
  outline: '1px solid rgba(184,119,80,0.26)',
  outlineOffset: -1,
};

const SIDEBAR_SELECTABLE_ROW_HEIGHT = 32;

function SectionChevron({ open }: { open: boolean }) {
  return (
    <span
      className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-hover:bg-[var(--c-hover)] group-focus:bg-[var(--c-hover)] transition-opacity"
      style={{
        width: 18,
        height: 18,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 5,
        fontSize: 14,
        fontWeight: 800,
        lineHeight: 1,
        color: 'var(--c-text-md)',
        transition: 'opacity 0.14s ease, background 0.14s ease',
        marginLeft: 4,
        transform: 'translateY(0.5px)',
      }}
      aria-hidden="true"
    >
      <span
        style={{
          display: 'block',
          lineHeight: 1,
          transform: `${open ? 'rotate(0deg)' : 'rotate(-90deg)'} translateY(-0.5px)`,
          transition: 'transform 0.14s ease',
        }}
      >
        ▾
      </span>
    </span>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


function CommandIcon({ kind }: { kind: 'search' | 'folder' | 'file' | 'edit' | 'view' | 'export' | 'settings' | 'download' | 'help' }) {
  if (kind === 'search') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <circle cx="7.2" cy="7.2" r="4.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10.8 10.8 14.3 14.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'folder') return <IconFolder size={13} />;
  if (kind === 'file') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M4.2 2.5h5.1l3.5 3.5v8.5H4.2V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.2 2.8v3.5h3.3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'edit') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M4 12.3 4.6 9.5l6.8-6.8 2.2 2.2-6.8 6.8-2.8.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10.5 3.6 12.7 5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'view') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M2.2 8.5s2.3-4 6.3-4 6.3 4 6.3 4-2.3 4-6.3 4-6.3-4-6.3-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="8.5" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === 'export') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 3v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5.8 7.8 8.5 10.5l2.7-2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'settings') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 5.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 2.2v1.7M8.5 13.1v1.7M2.2 8.5h1.7M13.1 8.5h1.7M4.1 4.1l1.2 1.2M11.7 11.7l1.2 1.2M4.1 12.9l1.2-1.2M11.7 5.3l1.2-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'download') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 2.5v8M5.6 7.9l2.9 2.9 2.9-2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.2 14.2h10.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.8 6.5a1.8 1.8 0 0 1 3.4.8c0 1.7-1.8 1.7-1.8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.5" cy="12.6" r=".6" fill="currentColor" />
    </svg>
  );
}

function CommandMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 31,
        display: 'grid',
        gridTemplateColumns: '17px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px',
        border: 'none',
        background: 'transparent',
        color: DARK_MENU_COLORS.text,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: FONTS.ui,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = DARK_MENU_COLORS.hover;
        e.currentTarget.style.color = DARK_MENU_COLORS.textHi;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = DARK_MENU_COLORS.text;
      }}
    >
      <span style={{ display: 'inline-flex', color: DARK_MENU_COLORS.accent }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 560 }}>{label}</span>
    </button>
  );
}

function CommandMenuDivider() {
  return <div style={{ height: 1, margin: '4px 10px', background: DARK_MENU_COLORS.border }} />;
}

const ADVANCED_FILES_STORAGE_KEY = 'devboard-advanced-files-visible';

const HIDDEN_ASSET_ROOTS = new Set(['notes', 'documents', 'pages']);
const HIDDEN_ASSET_FILES = new Set(['workspace.json']);
const WORKSPACE_MANAGED_ROOTS = new Set(['notes', 'documents', 'pages']);
const WORKSPACE_MANAGED_FILES = new Set(['workspace.json']);

type ExplorerKeyboardItem =
  | { kind: 'page'; pageId: string }
  | { kind: 'doc'; pageId: string; docId: string }
  | { kind: 'asset'; path: string[] };

type PagePreview = {
  kind: 'page';
  page: PageMeta;
  docs: Document[];
  nodes: CanvasNode[];
  anchorY: number;
};

type NotePreview = {
  kind: 'note';
  page: PageMeta;
  doc: Document;
  anchorY: number;
};

function sortTreeEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

function buildVirtualCloudTree({
  pages,
  documents,
  nodes,
  pageSnapshots,
  expandedPaths,
}: {
  pages: PageMeta[];
  documents: Document[];
  nodes: CanvasNode[];
  pageSnapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }>;
  expandedPaths: Set<string>;
}): TreeEntry[] {
  const roots = new Map<string, TreeEntry>();
  const ensureDir = (path: string[]): TreeEntry => {
    const name = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const target = path.join('/');
    const parent = parentPath.length ? ensureDir(parentPath) : null;
    const siblings = parent ? (parent.children ??= []) : Array.from(roots.values());
    let entry = siblings.find((item) => item.name === name && item.kind === 'directory');
    if (!entry) {
      entry = {
        ...buildEntry(name, 'directory', parentPath),
        expanded: expandedPaths.has(target),
        loading: false,
        children: [],
      };
      if (parent) parent.children = sortTreeEntries([...(parent.children ?? []), entry]);
      else roots.set(name, entry);
    } else {
      entry.expanded = expandedPaths.has(target);
      entry.children ??= [];
    }
    return entry;
  };
  const addFile = (path: string[]) => {
    if (path.length === 0) return;
    const fileName = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const parent = parentPath.length ? ensureDir(parentPath) : null;
    const entry = buildEntry(fileName, 'file', parentPath);
    if (parent) {
      if (!(parent.children ?? []).some((item) => item.path.join('/') === entry.path.join('/'))) {
        parent.children = sortTreeEntries([...(parent.children ?? []), entry]);
      }
    } else if (!roots.has(fileName)) {
      roots.set(fileName, entry);
    }
  };

  addFile(['workspace.json']);
  for (const page of pages) addFile(['pages', `${page.id}.json`]);
  for (const doc of documents) {
    if (!doc.linkedFile) continue;
    addFile(doc.linkedFile.split('/').filter(Boolean));
  }

  const allNodes = [
    ...nodes,
    ...Object.values(pageSnapshots).flatMap((snapshot) => snapshot.nodes),
  ];
  for (const node of allNodes) {
    if (node.type !== 'image' || !node.assetName) continue;
    const folder = node.assetFolder || 'assets';
    addFile([...folder.split('/').filter(Boolean), node.assetName]);
  }

  return sortTreeEntries(Array.from(roots.values()));
}

function isVisibleInAssets(entry: TreeEntry): boolean {
  if (entry.path.length === 0) return true;
  const root = entry.path[0];
  if (!root) return true;
  if (HIDDEN_ASSET_ROOTS.has(root)) return false;
  if (entry.path.length === 1 && HIDDEN_ASSET_FILES.has(entry.name)) return false;
  return true;
}

function isWorkspaceManagedEntry(entry: TreeEntry): boolean {
  const root = entry.path[0];
  if (!root) return false;
  return WORKSPACE_MANAGED_ROOTS.has(root) || (entry.path.length === 1 && WORKSPACE_MANAGED_FILES.has(entry.name));
}

function nodeBounds(node: CanvasNode): { x: number; y: number; w: number; h: number } | null {
  if (node.type === 'connector') {
    const x = Math.min(node.fromX, node.toX);
    const y = Math.min(node.fromY, node.toY);
    return { x, y, w: Math.max(8, Math.abs(node.toX - node.fromX)), h: Math.max(8, Math.abs(node.toY - node.fromY)) };
  }
  if (node.type === 'sticker') return { x: node.x - node.width / 2, y: node.y - node.height / 2, w: node.width, h: node.height };
  if (node.type === 'textblock') return { x: node.x, y: node.y, w: node.width, h: Math.max(40, node.fontSize * 3.2) };
  if (node.type === 'table') return { x: node.x, y: node.y, w: node.colWidths.reduce((a, b) => a + b, 0), h: node.rowHeights.reduce((a, b) => a + b, 0) };
  if (node.type === 'taskcard') return { x: node.x, y: node.y, w: node.width, h: node.height ?? 160 };
  if (node.type === 'sticky' || node.type === 'shape' || node.type === 'section' || node.type === 'codeblock' || node.type === 'image' || node.type === 'link' || node.type === 'document') {
    return { x: node.x, y: node.y, w: node.width, h: node.height };
  }
  return null;
}

function PageMiniMap({ nodes }: { nodes: CanvasNode[] }) {
  const drawableNodes = nodes.slice(0, 28);
  const bounds = drawableNodes
    .map(nodeBounds)
    .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;
  const minX = bounds.length ? Math.min(...bounds.map((b) => b.x)) : 0;
  const minY = bounds.length ? Math.min(...bounds.map((b) => b.y)) : 0;
  const maxX = bounds.length ? Math.max(...bounds.map((b) => b.x + b.w)) : 320;
  const maxY = bounds.length ? Math.max(...bounds.map((b) => b.y + b.h)) : 220;
  const pad = 32;
  const viewBox = `${minX - pad} ${minY - pad} ${Math.max(220, maxX - minX + pad * 2)} ${Math.max(150, maxY - minY + pad * 2)}`;

  return (
    <svg viewBox={viewBox} width="100%" height="150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={minX - pad} y={minY - pad} width={Math.max(220, maxX - minX + pad * 2)} height={Math.max(150, maxY - minY + pad * 2)} rx="20" fill="rgba(212,131,90,0.05)" />
      {drawableNodes.map((node) => {
        if (node.type === 'connector') {
          return (
            <line
              key={node.id}
              x1={node.fromX}
              y1={node.fromY}
              x2={node.toX}
              y2={node.toY}
              stroke={node.color || '#b87750'}
              strokeWidth={Math.max(1.5, Math.min(4, node.strokeWidth))}
              strokeLinecap="round"
              opacity="0.75"
            />
          );
        }
        const box = nodeBounds(node);
        if (!box) return null;
        const common = {
          key: node.id,
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 14,
          opacity: 0.9,
        };
        if (node.type === 'sticky') return <rect {...common} fill={node.color || '#f5e2b8'} stroke="rgba(74,53,37,0.14)" strokeWidth="2" />;
        if (node.type === 'shape') return <rect {...common} fill={node.fill || 'rgba(212,131,90,0.18)'} stroke={node.stroke || 'rgba(138,117,95,0.45)'} strokeWidth={Math.max(1, node.strokeWidth ?? 1)} />;
        if (node.type === 'section') return <rect {...common} fill="transparent" stroke={node.color || '#d4835a'} strokeWidth="3" strokeDasharray="8 6" />;
        if (node.type === 'image' || node.type === 'sticker') return <rect {...common} fill="rgba(212,131,90,0.14)" stroke="rgba(212,131,90,0.3)" strokeWidth="2" />;
        if (node.type === 'codeblock') return <rect {...common} fill="rgba(44,36,31,0.8)" stroke="rgba(138,117,95,0.35)" strokeWidth="2" />;
        if (node.type === 'document' || node.type === 'textblock') return <rect {...common} fill="rgba(255,255,255,0.82)" stroke="rgba(138,117,95,0.22)" strokeWidth="2" />;
        if (node.type === 'link') return <rect {...common} fill="rgba(133,186,156,0.16)" stroke="rgba(133,186,156,0.38)" strokeWidth="2" />;
        if (node.type === 'table') return <rect {...common} fill="rgba(212,131,90,0.08)" stroke="rgba(138,117,95,0.3)" strokeWidth="2" />;
        if (node.type === 'taskcard') return <rect {...common} fill="rgba(255,247,237,0.95)" stroke="rgba(212,131,90,0.32)" strokeWidth="2" />;
        return <rect {...common} fill="rgba(212,131,90,0.12)" stroke="rgba(138,117,95,0.28)" strokeWidth="2" />;
      })}
    </svg>
  );
}

function sortDocumentsForExplorer(docs: Document[], sortMode: PageMeta['noteSort'] = 'updated'): Document[] {
  if (sortMode === 'custom') {
    return [...docs].sort((a, b) => {
      if (a.orderIndex != null && b.orderIndex != null) return a.orderIndex - b.orderIndex;
      if (a.orderIndex != null) return -1;
      if (b.orderIndex != null) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }
  return [...docs].sort((a, b) => {
    return b.updatedAt - a.updatedAt;
  });
}

function NoteHoverThumbnail({ doc }: { doc: Document }) {
  const plain = stripHtmlPreview(doc.content);

  return (
    <div
      style={{
        height: 156,
        borderRadius: 8,
        border: '1px solid rgba(138,117,95,0.22)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.86), rgba(245,237,227,0.96))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
        padding: '14px 16px',
        overflow: 'hidden',
        color: '#2c241f',
      }}
    >
      {doc.emoji && <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 8 }}>{doc.emoji}</div>}
      <div style={{ fontFamily: FONTS.ui, fontSize: 15, fontWeight: 800, lineHeight: 1.2, color: '#2c241f', marginBottom: 10 }}>
        {(doc.title || 'Untitled note').slice(0, 70)}
      </div>
      <div
        style={{
          fontFamily: FONTS.ui,
          fontSize: 10.5,
          fontWeight: 500,
          lineHeight: 1.48,
          color: 'rgba(44,36,31,0.72)',
          display: '-webkit-box',
          WebkitLineClamp: doc.emoji ? 5 : 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {plain || 'No preview text yet'}
      </div>
    </div>
  );
}

function NoteShortcutRow({
  doc,
  active,
  onOpen,
  onToggleFavorite,
  onPreview,
  onPreviewEnd,
}: {
  doc: Document;
  active: boolean;
  onOpen: (doc: Document) => void;
  onToggleFavorite: (doc: Document) => void;
  onPreview: (doc: Document, clientY: number) => void;
  onPreviewEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favorite = !!doc.isFavorite;
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      onMouseEnter={(e) => {
        setHovered(true);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => onPreview(doc, e.clientY), 380);
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
        onPreviewEnd();
      }}
      title={doc.title || 'Untitled note'}
      style={{
        width: '100%',
        minHeight: SIDEBAR_SELECTABLE_ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        marginTop: 2,
        border: 'none',
        borderRadius: 6,
        background: active ? 'rgba(184,119,80,0.16)' : hovered ? 'rgba(184,119,80,0.09)' : 'transparent',
        outline: active ? '1px solid rgba(184,119,80,0.32)' : hovered ? '1px solid rgba(184,119,80,0.18)' : 'none',
        outlineOffset: -1,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(doc);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(doc);
        }}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={favorite ? `Remove ${doc.title || 'Untitled note'} from favorites` : `Add ${doc.title || 'Untitled note'} to favorites`}
        style={{
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: favorite ? '#d6a045' : 'var(--c-text-off)',
          opacity: favorite || hovered ? 1 : 0,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--c-hover)';
          e.currentTarget.style.color = favorite ? '#d6a045' : 'var(--c-text-md)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = favorite ? '#d6a045' : 'var(--c-text-off)';
        }}
      >
        <IconStar filled={favorite} size={12} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: FONTS.ui,
          fontSize: 10,
          fontWeight: active ? 650 : 550,
          color: active ? 'var(--c-text-hi)' : 'var(--c-text-md)',
        }}
      >
        {doc.title || 'Untitled note'}
      </span>
    </button>
  );
}

// ── TreeRow ───────────────────────────────────────────────────────────────────
function TreeRow({
  entry,
  depth,
  focusedPath,
  renamingPath,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onToggle,
  onFileSingleClick,
  onFileOpen,
  onMarkdownDrop,
  onContextMenu,
  onFileDragStart,
  onFileHover,
  usedOnCanvas,
  isDark,
  onFocus,
}: {
  entry: TreeEntry;
  depth: number;
  focusedPath: string | null;
  renamingPath: string | null;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onRenameCommit: (entry: TreeEntry) => void;
  onRenameCancel: () => void;
  onToggle: (path: string[]) => void;
  onFileSingleClick: (entry: TreeEntry, clientY: number) => void;
  onFileOpen: (entry: TreeEntry) => void;
  onMarkdownDrop: (pathParts: string[]) => void;
  onContextMenu: (entry: TreeEntry, x: number, y: number) => void;
  onFileDragStart: (entry: TreeEntry, e: React.DragEvent) => void;
  onFileHover: (entry: TreeEntry, clientY: number) => void;
  usedOnCanvas: Set<string>;
  isDark: boolean;
  onFocus: (path: string[]) => void;
}) {
  const isDir = entry.kind === 'directory';
  const isImage = !isDir && IMAGE_EXTS.has(ext(entry.name));
  const isDoc = !isDir && DOC_EXTS.has(ext(entry.name));
  const canOpen = !isDir && (CODE_EXTS[ext(entry.name)] !== undefined || isImage || isDoc);
  const isNotesFolder = isDir && entry.path.join('/') === 'notes';
  const isWorkspaceManaged = isWorkspaceManagedEntry(entry);
  const acceptsNoteDrop = isNotesFolder && !isWorkspaceManaged;
  const primaryAction = isDoc ? 'open note' : 'place on canvas';
  const isFocused = focusedPath === entry.path.join('/');
  const isRenaming = renamingPath === entry.path.join('/');
  const [dropActive, setDropActive] = useState(false);
  const tooltip = canOpen
    ? isImage
      ? `${entry.path.join('/')} — hover to preview · drag or double-click to place`
      : isDoc
        ? `${entry.path.join('/')} — single-click to preview · double-click or ↵ to open note · drag to place`
        : `${entry.path.join('/')} — single-click to preview · double-click or ↵ to place`
    : isWorkspaceManaged
      ? `${entry.path.join('/')} — managed by DevBoard`
      : entry.path.join('/');

  // Distinguish single vs double click without a 300ms delay penalty
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hover preview for image files
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = (clientY: number) => {
    // Cancel rename on any other item when clicking this one
    if (renamingPath && renamingPath !== entry.path.join('/')) {
      onRenameCancel();
    }

    if (isRenaming) return;
    if (isDir) { onToggle(entry.path); return; }
    if (!canOpen) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onFileOpen(entry);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        onFileSingleClick(entry, clientY);
      }, 220);
    }
  };

  const sharedRowProps = {
    depth,
    focusedPath,
    renamingPath,
    renameDraft,
    onRenameDraftChange,
    onRenameCommit,
    onRenameCancel,
    onToggle,
    onFileSingleClick,
    onFileOpen,
    onMarkdownDrop,
    onContextMenu,
    onFileDragStart,
    onFileHover,
    usedOnCanvas,
    isDark,
    onFocus,
  };

  return (
    <>
      <div
        className="group mx-1 flex items-center gap-1.5 h-[24px] pr-2 rounded-md cursor-pointer"
        style={{
          paddingLeft: 8 + depth * 14,
          ...(dropActive ? { background: 'rgba(184,119,80,0.16)', outline: '1px solid var(--c-line)', outlineOffset: -1 } : {}),
          ...(isFocused ? explorerFocusedRowStyle : {}),
        }}
        data-focused={isFocused ? 'true' : undefined}
        draggable={(isImage || isDoc) && !isRenaming}
        onClick={(e) => {
          onFocus(entry.path);
          handleClick(e.clientY);
        }}
        onDragStart={(e) => { if ((isImage || isDoc) && !isRenaming) onFileDragStart(entry, e); else e.preventDefault(); }}
        onDragEnter={(e) => {
          if (!acceptsNoteDrop) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(true);
        }}
        onDragOver={(e) => {
          if (!acceptsNoteDrop) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDragLeave={() => {
          if (acceptsNoteDrop) setDropActive(false);
        }}
        onDrop={(e) => {
          if (!acceptsNoteDrop) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(false);
          const raw = e.dataTransfer.getData('application/x-devboard-entry');
          if (!raw) return;
          try {
            onMarkdownDrop(JSON.parse(raw) as string[]);
          } catch {
            toast('Could not import note');
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFocus(entry.path);
          onContextMenu(entry, e.clientX, e.clientY);
        }}
        onMouseEnter={(e) => {
          if ((!isImage && !isDoc) || isRenaming) return;
          const y = e.clientY;
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => { onFileHover(entry, y); }, 380);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        }}
        title={isRenaming ? undefined : tooltip}
      >
        {/* Expand arrow for directories */}
        <span className="w-3 flex items-center justify-center shrink-0 text-[var(--c-text-off)]" style={{ fontSize: 9 }}>
          {isDir ? (entry.loading ? '…' : entry.expanded ? '▾' : '▸') : ' '}
        </span>

        <FileIcon name={entry.name} kind={entry.kind} />

        {isRenaming ? (
          // ── Inline rename input ───────────────────────────────────────
          <input
            autoFocus
            data-rename-input="true"
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.stopPropagation(); onRenameCommit(entry); }
              if (e.key === 'Escape') { e.stopPropagation(); onRenameCancel(); }
              e.stopPropagation();
            }}
            onBlur={() => onRenameCancel()}
            onClick={(e) => e.stopPropagation()}
            ref={(el) => {
              if (el) {
                // Select only the stem (before the last dot) so extension stays intact
                const dotIdx = entry.kind === 'file' ? entry.name.lastIndexOf('.') : -1;
                const end = dotIdx > 0 ? dotIdx : entry.name.length;
                el.setSelectionRange(0, end);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--c-canvas)',
              border: '1px solid var(--c-line)',
              borderRadius: 4,
              outline: 'none',
              fontFamily: FONTS.ui,
              fontSize: 11,
              color: 'var(--c-text-hi)',
              caretColor: 'var(--c-line)',
              padding: '0 4px',
              height: 18,
            }}
          />
        ) : (
          // ── Normal name display ───────────────────────────────────────
          (() => {
            const color = isDir ? 'var(--c-text-hi)' : canOpen ? fileColor(entry.name, isDark) : 'var(--c-text-lo)';
            const dotIdx = isDir ? -1 : entry.name.lastIndexOf('.');
            const base = dotIdx > 0 ? entry.name.slice(0, dotIdx) : entry.name;
            const extn = dotIdx > 0 ? entry.name.slice(dotIdx) : '';
            return (
              <span className="flex-1 min-w-0 flex text-[11px]" style={{ color, fontFamily: FONTS.ui }}>
                <span className="truncate">{base}</span>
                {extn && <span className="shrink-0">{extn}</span>}
              </span>
            );
          })()
        )}

        {!isRenaming && canOpen && usedOnCanvas.has(entry.path.join('/')) && (
          <span
            style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: isImage ? (isDark ? '#22d3ee' : '#0891b2') : 'var(--c-line)',
              display: 'inline-block',
            }}
            title="On canvas"
          />
        )}
        {!isRenaming && isWorkspaceManaged && (
          <svg
            className="hidden group-hover:block shrink-0"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            <title>Managed by DevBoard</title>
            <rect x="2" y="4.25" width="6" height="4.25" rx="1" stroke="var(--c-text-off)" strokeWidth="1" />
            <path d="M3.25 4.25V3a1.75 1.75 0 0 1 3.5 0v1.25" stroke="var(--c-text-off)" strokeWidth="1" strokeLinecap="round" />
          </svg>
        )}
        {!isRenaming && canOpen && (
          <span className="hidden group-hover:inline text-[9px] text-[var(--c-line)] shrink-0" title={`Double-click to ${primaryAction}`}>↵</span>
        )}
      </div>

      {isDir && entry.expanded && entry.children && (
        <>
          {entry.children.map((child) => (
            <TreeRow
              key={child.path.join('/')}
              entry={child}
              {...sharedRowProps}
              depth={depth + 1}
            />
          ))}
          {entry.children.length === 0 && (
            <div
              className="text-[10px] text-[var(--c-text-lo)] font-sans italic"
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
function NoWorkspaceState({ onOpen, onCreate }: { onOpen: () => void; onCreate?: () => void }) {
  const [isBrave, setIsBrave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const braveApi = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
    if (!braveApi?.isBrave) return;
    braveApi.isBrave().then((value) => {
      if (!cancelled) setIsBrave(Boolean(value));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const browserWorkspaceUnavailable = !IS_TAURI && !FSA_DIR_SUPPORTED;
  const title = browserWorkspaceUnavailable
    ? 'Folder access is unavailable here'
    : isBrave
      ? 'Open a folder to start'
      : 'No folder open';
  const body = browserWorkspaceUnavailable
    ? IN_IFRAME
      ? 'This embedded browser view cannot grant folder access. Open DevBoard in its own tab or use the desktop app to work with workspace folders.'
      : 'This browser session cannot open workspace folders. Use the desktop app or a desktop Chromium browser with File System Access support.'
    : isBrave
      ? 'Brave desktop can usually open workspace folders, but Shields or privacy settings may block the folder picker on some setups.'
      : 'A workspace is a normal folder where DevBoard keeps your pages, notes, and assets so everything reopens together later.';
  const tip = browserWorkspaceUnavailable
    ? 'Workspace folders need desktop browser support or the desktop app.'
    : isBrave
      ? 'If Open folder does nothing in Brave, click the lion icon in the address bar, disable Shields for this page, and try again.'
      : 'Tip: use a dedicated project folder so workspace.json, pages/, notes/, and assets/ stay together.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 12, textAlign: 'center' }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.35 }}>
        <path d="M3 9a3 3 0 0 1 3-3h8l4 4H30a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinejoin="round" />
        <line x1="18" y1="16" x2="18" y2="24" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="20" x2="22" y2="20" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div>
        <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', fontWeight: 600, margin: '0 0 4px' }}>{title}</p>
        <p style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-lo)', margin: 0, lineHeight: 1.5 }}>
          {body}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 220 }}>
        {onCreate && !browserWorkspaceUnavailable && (
          <button
            onClick={onCreate}
            style={{
              marginTop: 4,
              padding: '7px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--c-line)',
              color: '#fff',
              fontFamily: FONTS.ui,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            Create workspace…
          </button>
        )}
        <button
          onClick={onOpen}
          disabled={browserWorkspaceUnavailable}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: onCreate ? '1px solid var(--c-border)' : 'none',
            background: browserWorkspaceUnavailable ? 'var(--c-hover)' : onCreate ? 'transparent' : 'var(--c-line)',
            color: browserWorkspaceUnavailable ? 'var(--c-text-lo)' : onCreate ? 'var(--c-text-hi)' : '#fff',
            fontFamily: FONTS.ui,
            fontSize: 11,
            fontWeight: 600,
            cursor: browserWorkspaceUnavailable ? 'default' : 'pointer',
            opacity: browserWorkspaceUnavailable ? 0.7 : 1,
            letterSpacing: '0.02em',
          }}
        >
          {onCreate ? 'Open existing folder…' : 'Open folder…'}
        </button>
      </div>
      <p style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)', margin: 0, lineHeight: 1.5, maxWidth: 240 }}>
        {tip}
      </p>
    </div>
  );
}

function PageGroup({
  page,
  docs,
  coarsePointer,
  isActive,
  isCollapsed,
  activeDocId,
  onRenameDocument,
  onToggleFavoriteDocument,
  onReorderDocuments,
  onDeleteDocument,
  onRevealDocument,
  onRenamePage,
  onDeletePage,
  onRevealPage,
  onChangeSortMode,
  onEnsureCustomSort,
  onToggleCollapsed,
  onOpenPageOverview,
  onCreateFolder,
  onCreateNote,
  onOpenDocument,
  pageFocused,
  focusedDocId,
  onFocusPage,
  onFocusDocument,
  onPageHover,
  onPageLeave,
  onNoteHover,
  onNoteLeave,
}: {
  page: PageMeta;
  docs: Document[];
  coarsePointer: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  activeDocId: string | null;
  onRenameDocument: (docId: string, title: string) => void;
  onToggleFavoriteDocument: (doc: Document) => void;
  onReorderDocuments: (docIds: string[]) => void;
  onDeleteDocument: (doc: Document) => void;
  onRevealDocument: (doc: Document) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (page: PageMeta) => void;
  onRevealPage: (page: PageMeta) => void;
  onChangeSortMode: (page: PageMeta, sort: 'updated' | 'custom') => void;
  onEnsureCustomSort: (page: PageMeta) => void;
  onToggleCollapsed: () => void;
  onOpenPageOverview: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onOpenDocument: (docId: string) => void;
  pageFocused: boolean;
  focusedDocId: string | null;
  onFocusPage: (pageId: string) => void;
  onFocusDocument: (pageId: string, docId: string) => void;
  onPageHover: (page: PageMeta, clientY: number) => void;
  onPageLeave: () => void;
  onNoteHover: (page: PageMeta, doc: Document, clientY: number) => void;
  onNoteLeave: () => void;
}) {
  const [renamingPage, setRenamingPage] = useState(false);
  const [pageRenameDraft, setPageRenameDraft] = useState(page.name);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dropTargetDocId, setDropTargetDocId] = useState<string | null>(null);
  const [noteMenu, setNoteMenu] = useState<{ doc: Document; x: number; y: number } | null>(null);
  const [noteMenuExportOpen, setNoteMenuExportOpen] = useState(false);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  const noteMenuExportRef = useRef<HTMLDivElement>(null);
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number } | null>(null);
  const [pageHovered, setPageHovered] = useState(false);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const pageHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHoverPreview = !isActive;

  const beginRename = useCallback((doc: Document) => {
    setRenamingDocId(doc.id);
    setRenameDraft(doc.title || 'Untitled note');
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingDocId) return;
    const nextTitle = renameDraft.trim() || 'Untitled note';
    onRenameDocument(renamingDocId, nextTitle);
    setRenamingDocId(null);
  }, [onRenameDocument, renameDraft, renamingDocId]);

  const cancelRename = useCallback(() => {
    setRenamingDocId(null);
    setRenameDraft('');
  }, []);

  const handleDropOnDoc = useCallback((targetDocId: string) => {
    if (!draggedDocId || draggedDocId === targetDocId) return;
    const ids = docs.map((doc) => doc.id);
    const from = ids.indexOf(draggedDocId);
    const to = ids.indexOf(targetDocId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderDocuments(next);
    setDraggedDocId(null);
    setDropTargetDocId(null);
  }, [docs, draggedDocId, onReorderDocuments]);

  useEffect(() => {
    if (!noteMenu) return;
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (noteMenuRef.current?.contains(target) || noteMenuExportRef.current?.contains(target)) return;
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [noteMenu]);

  useEffect(() => {
    if (!noteMenu) setNoteMenuExportOpen(false);
  }, [noteMenu]);

  useEffect(() => {
    setPageRenameDraft(page.name);
  }, [page.name]);

  useEffect(() => {
    if (!pageMenu) return;
    const handleWindowClick = () => setPageMenu(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [pageMenu]);

  useEffect(() => () => {
    if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
  }, []);

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onMouseEnter={(e) => {
          setPageHovered(true);
          if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
          if (canHoverPreview) {
            pageHoverTimerRef.current = setTimeout(() => onPageHover(page, e.clientY), 380);
          }
        }}
        onMouseLeave={() => {
          setPageHovered(false);
          if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
          onPageLeave();
        }}
        style={{
          width: '100%',
          minHeight: SIDEBAR_SELECTABLE_ROW_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 8px',
          borderRadius: 5,
          ...(isActive ? explorerFocusedRowStyle : {}),
          ...(pageFocused ? {
            background: 'rgba(184,119,80,0.18)',
            outline: '1px solid rgba(184,119,80,0.42)',
            outlineOffset: -1,
          } : {}),
          ...(!isActive && !pageFocused && pageHovered ? {
            background: 'rgba(184,119,80,0.09)',
            outline: '1px solid rgba(184,119,80,0.18)',
            outlineOffset: -1,
          } : {}),
        }}
        data-focused={pageFocused ? 'true' : undefined}
        className="group transition-colors"
      >
        <button
          onClick={onToggleCollapsed}
          title={isCollapsed ? `Expand "${page.name}"` : `Collapse "${page.name}"`}
            style={{
              width: 12,
              height: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: isActive ? 'var(--c-text-md)' : 'var(--c-text-lo)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              fontSize: 9,
              lineHeight: 1,
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </button>

        <button
          onClick={onOpenPageOverview}
          onFocus={() => onFocusPage(page.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFocusPage(page.id);
            setPageMenu({ x: e.clientX, y: e.clientY });
          }}
          title={`Open "${page.name}" folder overview`}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--c-line)' : 'var(--c-text-lo)' }}>
            <IconFolder size={12} />
          </span>
          {renamingPage ? (
            <input
              autoFocus
              value={pageRenameDraft}
              onChange={(e) => setPageRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                const nextName = pageRenameDraft.trim() || page.name;
                onRenamePage(page.id, nextName);
                setRenamingPage(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const nextName = pageRenameDraft.trim() || page.name;
                  onRenamePage(page.id, nextName);
                  setRenamingPage(false);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamingPage(false);
                  setPageRenameDraft(page.name);
                }
                e.stopPropagation();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 20,
                padding: '0 6px',
                background: 'var(--c-canvas)',
                border: '1px solid rgba(184,119,80,0.28)',
                borderRadius: 5,
                outline: 'none',
                fontFamily: FONTS.ui,
                fontSize: 10,
                color: 'var(--c-text-hi)',
              }}
            />
          ) : (
            <span style={{
              fontFamily: FONTS.ui, fontSize: 10.5, fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1,
            }}>
              {page.name}
            </span>
          )}
          <span style={{
            fontFamily: FONTS.ui,
            fontSize: 8.5,
            color: isActive ? 'var(--c-text-md)' : 'var(--c-text-lo)',
            flexShrink: 0,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'center',
          }}>
            {docs.length}
          </span>
        </button>
        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateNote();
            }}
            title={`New note in ${page.name}`}
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--c-text-lo)',
              borderRadius: 4,
              cursor: 'pointer',
              lineHeight: 1,
              opacity: coarsePointer ? 0.72 : (pageHovered || pageFocused || isActive ? 0.72 : 0.36),
              transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
            }}
            className="group-hover:opacity-100 focus:opacity-100"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-lo)';
              e.currentTarget.style.opacity = coarsePointer || pageHovered || pageFocused || isActive ? '0.72' : '0.36';
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 12,
                lineHeight: 1,
                transform: 'translateY(-1px)',
              }}
            >
              +
            </span>
          </button>
        </div>
        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setPageMenu((current) => current ? null : { x: rect.right - 180, y: rect.bottom + 4 });
            }}
            title={`${page.name} menu`}
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--c-text-off)',
              borderRadius: 4,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1, display: 'block', transform: 'translateY(-0.5px)' }}>⋯</span>
          </button>
          {pageMenu && (() => {
            const MENU_W = 180;
            const left = Math.min(pageMenu.x, window.innerWidth - MENU_W - 8);
            const top = Math.min(pageMenu.y, window.innerHeight - 110);
            return (
            <div
              style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
              className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  onCreateFolder();
                  setPageMenu(null);
                }}
              >
                <span>New folder</span>
                <span className="text-[10px] ml-3 text-[var(--c-text-off)]">+</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  onCreateNote();
                  setPageMenu(null);
                }}
              >
                <span>New note</span>
                <span className="text-[10px] ml-3 text-[var(--c-text-off)]">+</span>
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <div style={{ padding: '2px 10px 4px', fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Sort notes
              </div>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
                style={{ fontFamily: FONTS.ui, color: page.noteSort !== 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
                onClick={() => {
                  onChangeSortMode(page, 'updated');
                  setPageMenu(null);
                }}
              >
                <span>Newest first</span>
                {page.noteSort !== 'custom' && <span className="text-[10px] ml-3">✓</span>}
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
                style={{ fontFamily: FONTS.ui, color: page.noteSort === 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
                onClick={() => {
                  onChangeSortMode(page, 'custom');
                  setPageMenu(null);
                }}
              >
                <span>Custom order</span>
                {page.noteSort === 'custom' && <span className="text-[10px] ml-3">✓</span>}
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              {IS_TAURI && (
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => {
                    onRevealPage(page);
                    setPageMenu(null);
                  }}
                >
                  <span>Show in Folder</span>
                </button>
              )}
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  setRenamingPage(true);
                  setPageMenu(null);
                }}
              >
                <span>Rename folder</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
                style={{ fontFamily: FONTS.ui, color: '#f87171' }}
                onClick={() => {
                  onDeletePage(page);
                  setPageMenu(null);
                }}
              >
                <span>Delete folder</span>
              </button>
            </div>
            );
          })()}
        </div>
      </div>

      {!isCollapsed && (
        <div
              style={{
            marginTop: 2,
            marginLeft: 18,
            paddingLeft: 10,
            borderLeft: '1px solid rgba(184,119,80,0.18)',
            maxHeight: 520,
            opacity: 1,
            overflow: 'hidden',
            transform: 'translateY(0)',
            transition: 'max-height 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.14s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.18s ease',
          }}
        >
          {docs.length === 0 ? (
            <div style={{ padding: '6px 8px 2px', fontSize: 9.5, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>
              No notes in this folder
            </div>
          ) : (
	            docs.map((doc) => {
	              const isSelected = doc.id === activeDocId;
	              const isFocused = doc.id === focusedDocId;
	              const isRenaming = doc.id === renamingDocId;
	              const isDragged = doc.id === draggedDocId;
	              const isDropTarget = doc.id === dropTargetDocId && draggedDocId !== doc.id;
                const isHovered = hoveredDocId === doc.id;
              return (
                <button
                  key={doc.id}
	                  onClick={() => {
	                    if (isRenaming) return;
	                    onFocusDocument(page.id, doc.id);
	                    onOpenDocument(doc.id);
	                  }}
	                  onFocus={() => onFocusDocument(page.id, doc.id)}
                    onMouseEnter={(e) => {
                      setHoveredDocId(doc.id);
                      if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                      noteHoverTimerRef.current = setTimeout(() => onNoteHover(page, doc, e.clientY), 380);
                    }}
                    onMouseLeave={() => {
                      setHoveredDocId((current) => (current === doc.id ? null : current));
                      if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                      onNoteLeave();
                    }}
	                  onContextMenu={(e) => {
	                    e.preventDefault();
	                    e.stopPropagation();
	                    onFocusDocument(page.id, doc.id);
	                    setNoteMenu({ doc, x: e.clientX, y: e.clientY });
	                  }}
	                  style={{
                    width: '100%',
                    minHeight: SIDEBAR_SELECTABLE_ROW_HEIGHT,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) auto',
                    alignItems: 'center',
                    columnGap: 10,
                    marginTop: 2,
                    padding: '4px 8px',
	                    background: isDragged
                        ? 'rgba(184,119,80,0.09)'
                        : (isFocused || isSelected)
                          ? 'rgba(184,119,80,0.16)'
                          : isHovered
                            ? 'rgba(184,119,80,0.09)'
                            : 'none',
	                    border: 'none',
	                    outline: isDropTarget
	                      ? '1px solid rgba(184,119,80,0.48)'
	                      : (isFocused || isSelected)
	                        ? '1px solid rgba(184,119,80,0.32)'
                          : isHovered
                            ? '1px solid rgba(184,119,80,0.18)'
	                        : 'none',
                    outlineOffset: -1,
                    borderRadius: 5,
                    cursor: isRenaming ? 'text' : 'pointer',
                    textAlign: 'left',
                    boxShadow: isDropTarget ? 'inset 0 2px 0 rgba(184,119,80,0.55)' : 'none',
	                    opacity: isDragged ? 0.72 : 1,
	                  }}
	                  data-focused={isFocused ? 'true' : undefined}
                  className="hover:bg-[var(--c-hover)]"
                  draggable={!isRenaming}
                  onDragStart={(e) => {
                    if (isRenaming) {
                      e.preventDefault();
                      return;
                    }
                    onEnsureCustomSort(page);
                    setDraggedDocId(doc.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', doc.id);

                    const ghost = document.createElement('div');
                    ghost.style.cssText = [
                      'position:fixed',
                      'top:-999px',
                      'left:-999px',
                      'min-width:180px',
                      'max-width:280px',
                      'padding:8px 10px',
                      'background:#f5ede3',
                      'border:1px solid rgba(184,119,80,0.35)',
                      'border-radius:10px',
                      'box-shadow:0 10px 28px rgba(74,53,37,0.18)',
                      'color:#2c241f',
                      `font:600 12px/1.2 ${FONTS.ui}`,
                      'pointer-events:none',
                      'white-space:nowrap',
                    ].join(';');

                    const textWrap = document.createElement('div');
                    textWrap.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

                    const title = document.createElement('span');
                    title.textContent = doc.title || 'Untitled note';
                    title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
                    textWrap.appendChild(title);

                    const subtitle = document.createElement('span');
                    subtitle.textContent = page.name;
                    subtitle.style.cssText = 'font-size:10px;font-weight:500;color:#8a755f;margin-top:2px;';
                    textWrap.appendChild(subtitle);

                    ghost.appendChild(textWrap);
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 18, 14);
                    requestAnimationFrame(() => ghost.remove());
                  }}
                  onDragEnd={() => {
                    setDraggedDocId(null);
                    setDropTargetDocId(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggedDocId || draggedDocId === doc.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropTargetDocId !== doc.id) setDropTargetDocId(doc.id);
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    if (dropTargetDocId === doc.id) setDropTargetDocId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnDoc(doc.id);
                  }}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                        e.stopPropagation();
                      }}
                      style={{
                        minWidth: 0,
                        height: 20,
                        padding: '0 6px',
                        background: 'var(--c-canvas)',
                        border: '1px solid rgba(184,119,80,0.28)',
                        borderRadius: 5,
                        outline: 'none',
                        fontFamily: FONTS.ui,
                        fontSize: 10.25,
                        color: 'var(--c-text-hi)',
                      }}
                    />
                  ) : (
                    <span style={{
                      fontFamily: FONTS.ui, fontSize: 10.25, fontWeight: isSelected ? 600 : 500,
                      color: 'var(--c-text-hi)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {doc.title || 'Untitled note'}
                    </span>
                  )}
                  <span style={{ fontFamily: FONTS.ui, fontSize: 8.75, color: isSelected ? 'var(--c-text-md)' : 'var(--c-text-lo)', flexShrink: 0, minWidth: 26, textAlign: 'right' }}>
                    {relativeTime(doc.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
      {noteMenu && (() => {
        const MENU_W = 160;
        const left = Math.min(noteMenu.x, window.innerWidth - MENU_W - 8);
        const top = Math.min(noteMenu.y, window.innerHeight - 64);
        const exportMenuLeft = Math.min(left + MENU_W - 8, window.innerWidth - 172 - 8);
        const exportMenuTop = Math.min(top + 48, window.innerHeight - 110);
        return (
          <>
            <div
              ref={noteMenuRef}
              style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
              className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  exportDocumentAsMarkdownFile(noteMenu.doc);
                  setNoteMenu(null);
                  setNoteMenuExportOpen(false);
                }}
              >
                <span>Export .md</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onMouseEnter={() => setNoteMenuExportOpen(true)}
                onClick={() => setNoteMenuExportOpen((current) => !current)}
              >
                <span>Export as</span>
                <span className="text-[10px] ml-3 text-[var(--c-text-off)]">›</span>
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  onToggleFavoriteDocument(noteMenu.doc);
                  setNoteMenu(null);
                  setNoteMenuExportOpen(false);
                }}
              >
                <span>{noteMenu.doc.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                <span className="text-[10px] ml-3" style={{ color: noteMenu.doc.isFavorite ? '#d6a045' : 'var(--c-text-off)' }}>★</span>
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              {IS_TAURI && (
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => {
                    onRevealDocument(noteMenu.doc);
                    setNoteMenu(null);
                    setNoteMenuExportOpen(false);
                  }}
                >
                  <span>Show in Folder</span>
                </button>
              )}
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  beginRename(noteMenu.doc);
                  setNoteMenu(null);
                  setNoteMenuExportOpen(false);
                }}
              >
                <span>Rename</span>
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
                style={{ fontFamily: FONTS.ui, color: '#f87171' }}
                onClick={() => {
                  onDeleteDocument(noteMenu.doc);
                  setNoteMenu(null);
                  setNoteMenuExportOpen(false);
                }}
              >
                <span>Delete</span>
                <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
              </button>
            </div>

            {noteMenuExportOpen && (
              <div
                ref={noteMenuExportRef}
                style={{ position: 'fixed', left: exportMenuLeft, top: exportMenuTop, zIndex: 9101, minWidth: 172 }}
                className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
                onMouseLeave={() => setNoteMenuExportOpen(false)}
              >
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => {
                    exportDocumentAsPdf(noteMenu.doc);
                    setNoteMenu(null);
                    setNoteMenuExportOpen(false);
                  }}
                >
                  <span>PDF…</span>
                </button>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => {
                    exportDocumentAsTextFile(noteMenu.doc);
                    setNoteMenu(null);
                    setNoteMenuExportOpen(false);
                  }}
                >
                  <span>Plain text (.txt)</span>
                </button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

export const WORKSPACE_EXPLORER_WIDTH = 340;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  onCollapse: () => void;
  canClose?: boolean;
  collapseIcon?: 'close' | 'open';
}

export default function WorkspaceExplorer({ onClose, onCollapse, canClose = true, collapseIcon = 'close' }: Props) {
  const isPreviewPanel = collapseIcon === 'open';
  const { isConfigured: authConfigured, isLoading: authLoading, user, signOut } = useAuth();
  const imageAssetFolder = useBoardStore((s) => s.imageAssetFolder);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const pages = useBoardStore((s) => s.pages);
  const addPage = useBoardStore((s) => s.addPage);
  const deletePage = useBoardStore((s) => s.deletePage);
  const renamePage = useBoardStore((s) => s.renamePage);
  const setPageNoteSort = useBoardStore((s) => s.setPageNoteSort);
  const activePageId = useBoardStore((s) => s.activePageId);
  const activeDocId = useBoardStore((s) => s.activeDocId);
  const switchPage = useBoardStore((s) => s.switchPage);
  const documents = useBoardStore((s) => s.documents);
  const addDocument = useBoardStore((s) => s.addDocument);
  const updateNode = useBoardStore((s) => s.updateNode);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const toggleFavoriteDocument = useBoardStore((s) => s.toggleFavoriteDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
  const openDocument = useBoardStore((s) => s.openDocument);
  const storeNodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const theme = useBoardStore((s) => s.theme);
  const toggleTheme = useBoardStore((s) => s.toggleTheme);
  const noteAutosaveEnabled = useBoardStore((s) => s.noteAutosaveEnabled);
  const setNoteAutosaveEnabled = useBoardStore((s) => s.setNoteAutosaveEnabled);
  const isDark = theme === 'dark';

  const panelRef = useRef<HTMLDivElement>(null);
  const { filePreview, showFilePreview, handleFileHover, clearPreview } = useFilePreview(panelRef);
  const {
    tree,
    setTree,
    rootLoading,
    setRootLoading,
    rootError,
    setRootError,
    reloadRoot,
    newFolderParent,
    setNewFolderParent,
    newFolderName,
    setNewFolderName,
    newFolderInputRef,
    visibleEntriesRef,
    updateEntry,
    handleToggle,
    startNewFolder,
    commitNewFolder,
  } = useTreeState(imageAssetFolder);

  // Reload tree when workspace is opened externally (e.g. via TopBar)
  const storeWorkspaceName = useBoardStore((s) => s.workspaceName);
  const workspaceSavedAt = useBoardStore((s) => s.workspaceSavedAt);
  const prevStoreWorkspaceRef = useRef(storeWorkspaceName);
  const prevWorkspaceSavedAtRef = useRef(workspaceSavedAt);
  useEffect(() => {
    if (storeWorkspaceName === prevStoreWorkspaceRef.current) return;
    prevStoreWorkspaceRef.current = storeWorkspaceName;
    if (storeWorkspaceName) reloadRoot();
  }, [storeWorkspaceName, reloadRoot]);
  useEffect(() => {
    if (workspaceSavedAt === prevWorkspaceSavedAtRef.current) return;
    prevWorkspaceSavedAtRef.current = workspaceSavedAt;
    if (workspaceSavedAt) reloadRoot();
  }, [workspaceSavedAt, reloadRoot]);

  // Local state
  const [pagesSectionOpen, setPagesSectionOpen] = useState(true);
  const [favoritesSectionOpen, setFavoritesSectionOpen] = useState(true);
  const [assetsSectionOpen] = useState(false);
  const [cloudExpandedPaths, setCloudExpandedPaths] = useState<Record<string, boolean>>({
    assets: true,
    notes: true,
    pages: false,
  });
  const [advancedFilesVisible, setAdvancedFilesVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ADVANCED_FILES_STORAGE_KEY) === '1';
  });
  const [collapsedPageIds, setCollapsedPageIds] = useState<Record<string, boolean>>({});
  const [confirmingClose, setConfirmingClose] = useState(false);
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [commandMenuAnchor, setCommandMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [pagePreview, setPagePreview] = useState<PagePreview | null>(null);
  const [notePreview, setNotePreview] = useState<NotePreview | null>(null);
  const clearPagePreview = useCallback(() => {
    setPagePreview(null);
  }, []);
  const clearNotePreview = useCallback(() => {
    setNotePreview(null);
  }, []);
  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renamingEntryRef = useRef<TreeEntry | null>(null);
  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<TreeEntry | null>(null);
  const [deletePageConfirm, setDeletePageConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<Document | null>(null);
  const [missingImagesOpen, setMissingImagesOpen] = useState(false);
  const [missingImagesFixing, setMissingImagesFixing] = useState(false);
  const missingImagesPopoverRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  // Explorer context menu (right-click)
  type ExplorerMenu = { entry: TreeEntry; x: number; y: number };
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const explorerMenuRef = useRef<HTMLDivElement>(null);
  const [filesSectionMenu, setFilesSectionMenu] = useState<{ x: number; y: number } | null>(null);
  const filesSectionMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const workspaceDisplayName = useMemo(() => {
    const workspaceTitle = storeWorkspaceName || getWorkspaceName() || cloudBoardTitle;
    return workspaceTitle || boardTitle.trim() || 'Untitled Workspace';
  }, [boardTitle, cloudBoardTitle, storeWorkspaceName]);
  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocId) ?? null,
    [activeDocId, documents]
  );
  const hasLocalWorkspace = !!getWorkspaceName();
  const hasWorkspaceContext = hasLocalWorkspace || !!cloudBoardId;
  const cloudOnlyWorkspace = !hasLocalWorkspace && !!cloudBoardId;
  const missingImages = useMemo(
    () => storeNodes.filter((node): node is ImageNode => node.type === 'image' && !!node.assetName && !node.src),
    [storeNodes]
  );
  const accountLabel = String(user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Local workspace');
  const accountInitials = accountLabel
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'DB';
  const avatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const hasUnsyncedSyncChanges = !!user && !!cloudBoardId && !!lastLocalSavedAt && !!cloudSyncedAt && lastLocalSavedAt > cloudSyncedAt + 1000;
  const accountStatus = authLoading
    ? 'Checking...'
    : hasUnsyncedSyncChanges
      ? 'Unsynced'
      : cloudBoardId
        ? 'Saved'
        : 'Saved';
  const openCloudModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal'));
  }, []);

  const handleAccountSignOut = useCallback(async () => {
    try {
      await signOut();
      setAccountMenuOpen(false);
      toast('Signed out.');
    } catch (err) {
      console.warn('Sign-out failed', err);
      toast('Could not sign out right now.');
    }
  }, [signOut]);

  const missingImagePath = useCallback((image: ImageNode): string => {
    const folder = image.assetFolder ?? imageAssetFolder ?? 'assets';
    return folder ? `${folder}/${image.assetName}` : image.assetName ?? 'missing image';
  }, [imageAssetFolder]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!commandMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target as Node)) {
        setCommandMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [commandMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADVANCED_FILES_STORAGE_KEY, advancedFilesVisible ? '1' : '0');
  }, [advancedFilesVisible]);

  useEffect(() => {
    if (!searchOpen) return;
    const raf = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [searchOpen]);

  useEffect(() => {
    if (!missingImagesOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (missingImagesPopoverRef.current?.contains(e.target as Node)) return;
      setMissingImagesOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMissingImagesOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [missingImagesOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (accountMenuRef.current?.contains(e.target as Node)) return;
      setAccountMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (missingImages.length === 0) setMissingImagesOpen(false);
  }, [missingImages.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarsePointer(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  // ── File actions ─────────────────────────────────────────────────────────
  const placeFile = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (IMAGE_EXTS.has(e)) {
      await placeImageFile(entry.path);
    } else if (DOC_EXTS.has(e)) {
      await placeDocumentFile(entry.path);
    } else if (CODE_EXTS[e] !== undefined) {
      await placeCodeFile(entry.path);
    }
  }, []);

  const openFile = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (DOC_EXTS.has(e)) {
      if (isWorkspaceManagedEntry(entry)) {
        toast('Opening from Folders. Notes are read-only in Asset files; edit them from the Folders section above.');
      }
      await openDocumentFile(entry.path);
    } else {
      await placeFile(entry);
    }
  }, [placeFile]);

  const importMarkdownToNotes = useCallback(async (pathParts: string[]) => {
    const e = ext(pathParts[pathParts.length - 1] ?? '');
    if (!DOC_EXTS.has(e)) {
      toast('Drop a Markdown file to add it to notes');
      return;
    }

    if (pathParts[0] === 'notes') {
      await openDocumentFile(pathParts);
      toast('Already in notes');
      return;
    }

    const content = await readWorkspaceFile(pathParts.join('/'));
    if (content === null) {
      toast('Could not read Markdown file');
      return;
    }

    const sourceName = pathParts[pathParts.length - 1];
    const dotIdx = sourceName.lastIndexOf('.');
    const stem = dotIdx > 0 ? sourceName.slice(0, dotIdx) : sourceName;
    const extn = dotIdx > 0 ? sourceName.slice(dotIdx) : '.md';
    let existing = new Set<string>();
    try {
      existing = new Set((await listDirectory(['notes'])).filter((entry) => entry.kind === 'file').map((entry) => entry.name.toLowerCase()));
    } catch {
      existing = new Set();
    }

    let filename = `${stem}${extn}`;
    let suffix = 2;
    while (existing.has(filename.toLowerCase())) {
      filename = `${stem}-${suffix}${extn}`;
      suffix += 1;
    }

    const ok = await saveTextFileToWorkspace('notes', filename, content);
    if (!ok) {
      toast('Could not copy note into notes/');
      return;
    }

    const linkedFile = `notes/${filename}`;
    const existingDoc = useBoardStore.getState().documents.find((doc) => doc.linkedFile === linkedFile);
    const noteTitle = titleFromMarkdown(filename, content);
    const docId = existingDoc?.id ?? addDocument({ title: noteTitle, content: markdownBodyToHtml(content, noteTitle), linkedFile });
    openDocument(docId);
    void saveWorkspace(useBoardStore.getState().exportData());
    try {
      const rawChildren = await listDirectory(['notes']);
      const children = rawChildren
        .filter((entry) => !entry.name.startsWith('.') && !(entry.kind === 'directory' && SKIP_DIRS.has(entry.name)))
        .map((entry) => buildEntry(entry.name, entry.kind, ['notes']));
      setTree((prev) => {
        const hasNotesFolder = prev.some((entry) => entry.path.join('/') === 'notes');
        if (!hasNotesFolder) {
          const next = [...prev, { ...buildEntry('notes', 'directory', []), expanded: true, children }];
          return next.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
          });
        }
        return updateEntry(prev, ['notes'], (entry) => ({
          ...entry,
          expanded: true,
          loading: false,
          children,
        }));
      });
    } catch {
      // Keep existing expanded tree state even if the folder refresh fails.
    }
    toast(`Added note · ${linkedFile}`);
  }, [addDocument, openDocument, setTree, updateEntry]);

  const handleFileSingleClick = useCallback((entry: TreeEntry, clientY: number) => {
    const idx = visibleEntriesRef.current.findIndex((e) => e.path.join('/') === entry.path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
    setPagePreview(null);
    setNotePreview(null);
    showFilePreview(entry, clientY);
  }, [showFilePreview]);

  const handleFileOpen = useCallback((entry: TreeEntry) => {
    setPagePreview(null);
    setNotePreview(null);
    clearPreview();
    openFile(entry);
  }, [openFile, clearPreview]);

  const handleFileDragStart = useCallback((entry: TreeEntry, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-devboard-entry', JSON.stringify(entry.path));
    e.dataTransfer.effectAllowed = 'copy';

    // Build a ghost drag image
    const ghost = document.createElement('div');
    ghost.style.cssText = [
      'position:fixed', 'top:-999px', 'left:-999px',
      'display:flex', 'align-items:center', 'gap:6px',
      'padding:5px 10px 5px 6px',
      'background:#1e1e2e', 'border:1px solid var(--c-line)',
      'border-radius:8px', 'color:#e2e8f0',
      'font:11px/1 \'JetBrains Mono\',monospace',
      'pointer-events:none', 'white-space:nowrap',
      'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    ].join(';');

    // Thumbnail if the image is currently previewed
    if (filePreview?.kind === 'image' && filePreview.entry.path.join('/') === entry.path.join('/')) {
      const img = document.createElement('img');
      img.src = filePreview.url;
      img.style.cssText = 'width:36px;height:36px;object-fit:contain;border-radius:4px;opacity:0.9;flex-shrink:0;';
      ghost.appendChild(img);
    }

    const label = document.createElement('span');
    label.textContent = entry.name;
    ghost.appendChild(label);

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    requestAnimationFrame(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); });
  }, [filePreview]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    const result = await openWorkspace();
    if (result) {
      setMissingImagesOpen(false);
      useBoardStore.getState().setWorkspaceName?.(result.name);
      if (result.data) useBoardStore.getState().loadBoard(result.data);
      applyWorkspaceSyncFromOpenResult(result);
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

  const handleFindMissingImages = useCallback(async () => {
    if (missingImagesFixing || missingImages.length === 0) return;
    setMissingImagesFixing(true);
    let restored = 0;

    try {
      for (const image of missingImages) {
        if (!image.assetName) continue;
        let src = await loadImageAsset(image.assetName, image.assetFolder);
        let assetFolder = image.assetFolder;

        if (!src) {
          const found = await findImageInWorkspace(image.assetName);
          if (found) {
            src = found.url;
            assetFolder = found.folder;
          }
        }

        if (src) {
          updateNode(image.id, { src, assetFolder } as Partial<ImageNode>);
          restored += 1;
        }
      }

      const remaining = missingImages.length - restored;
      if (restored === missingImages.length) {
        toast(`Restored ${restored} image${restored === 1 ? '' : 's'}`);
        setMissingImagesOpen(false);
      } else if (restored > 0) {
        toast(`Restored ${restored} image${restored === 1 ? '' : 's'}. ${remaining} still missing.`);
      } else {
        toast('Could not find the missing image files. Reopen the workspace folder or place them back in assets/.');
      }
    } finally {
      setMissingImagesFixing(false);
    }
  }, [missingImages, missingImagesFixing, updateNode]);

  // ── Rename ───────────────────────────────────────────────────────────────
  const [renameExtWarning, setRenameExtWarning] = useState<{ entry: TreeEntry; newName: string } | null>(null);

  const startRename = useCallback((entry: TreeEntry) => {
    if (cloudOnlyWorkspace) {
      toast('Cloud files are read-only here. Download to a folder to edit filenames.');
      setExplorerMenu(null);
      return;
    }
    if (isWorkspaceManagedEntry(entry)) {
      toast('Workspace files are read-only here');
      setExplorerMenu(null);
      return;
    }
    setRenamingPath(entry.path.join('/'));
    setRenameDraft(entry.name);
    renamingEntryRef.current = entry;
    setExplorerMenu(null);
  }, [cloudOnlyWorkspace]);

  const doRename = useCallback(async (entry: TreeEntry, newName: string) => {
    try {
      await renameEntry(entry.path, newName);
      const newPath = [...entry.path.slice(0, -1), newName];
      setTree((prev) =>
        updateEntry(prev, entry.path, (e) => ({ ...e, name: newName, path: newPath }))
      );
    } catch (err) {
      console.warn('Rename failed:', err);
    }
  }, [updateEntry]);

  const commitRename = useCallback((entry: TreeEntry) => {
    const newName = renameDraft.trim();
    setRenamingPath(null);
    renamingEntryRef.current = null;
    if (!newName || newName === entry.name) return;
    // Warn if extension changed on a file
    if (entry.kind === 'file') {
      const oldExt = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : '';
      const newExt = newName.includes('.') ? newName.split('.').pop()!.toLowerCase() : '';
      if (oldExt && oldExt !== newExt) {
        setRenameExtWarning({ entry, newName });
        return;
      }
    }
    doRename(entry, newName);
  }, [renameDraft, doRename]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const removeFromTree = useCallback((pathParts: string[]) => {
    const remove = (entries: TreeEntry[], path: string[]): TreeEntry[] => {
      if (path.length === 1) return entries.filter((e) => e.name !== path[0]);
      return entries.map((e) =>
        e.name === path[0] && e.children
          ? { ...e, children: remove(e.children, path.slice(1)) }
          : e
      );
    };
    setTree((prev) => remove(prev, pathParts));
  }, [setTree]);

  const doDelete = useCallback(async (entry: TreeEntry) => {
    try {
      await deleteEntry(entry.path);
      removeFromTree(entry.path);
      setFocusedIdx(null);
    } catch (err) {
      console.warn('Delete failed:', err);
    }
  }, [removeFromTree]);

  const startDelete = useCallback((entry: TreeEntry) => {
    if (cloudOnlyWorkspace) {
      toast('Cloud files are read-only here. Download to a folder to delete files.');
      setExplorerMenu(null);
      return;
    }
    if (isWorkspaceManagedEntry(entry)) {
      toast('Workspace files are read-only here');
      setExplorerMenu(null);
      return;
    }
    setDeleteConfirm(entry);
    setExplorerMenu(null);
  }, [cloudOnlyWorkspace]);

  // Cancel rename when clicking outside the inline input
  useEffect(() => {
    if (!renamingPath) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target.dataset.renameInput) return;
      setRenamingPath(null);
      renamingEntryRef.current = null;
    };
    // Use click instead of mousedown since panel's onMouseDown stops propagation
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [renamingPath]);

  // Dismiss explorer context menu on outside click
  useEffect(() => {
    if (!explorerMenu) return;
    const handler = (e: MouseEvent) => {
      if (explorerMenuRef.current && !explorerMenuRef.current.contains(e.target as Node)) {
        setExplorerMenu(null);
      }
    };
    // Use click instead of mousedown since panel's onMouseDown stops propagation
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [explorerMenu]);

  useEffect(() => {
    if (!filesSectionMenu) return;
    const handler = (e: MouseEvent) => {
      if (filesSectionMenuRef.current && !filesSectionMenuRef.current.contains(e.target as Node)) {
        setFilesSectionMenu(null);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [filesSectionMenu]);

  const handleEntryContextMenu = useCallback((entry: TreeEntry, x: number, y: number) => {
    setExplorerMenu({ entry, x, y });
    // Also set keyboard focus to this entry
    const idx = visibleEntriesRef.current.findIndex((e) => e.path.join('/') === entry.path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
  }, []);


  // Flatten entire loaded tree for search results (includes collapsed dirs)
  const flattenTree = useCallback((entries: TreeEntry[]): TreeEntry[] => {
    const result: TreeEntry[] = [];
    for (const e of entries) {
      result.push(e);
      if (e.children) result.push(...flattenTree(e.children));
    }
    return result;
  }, []);

  const searchResults = useMemo(
    () => searchQuery.trim()
      ? flattenTree(tree).filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : null,
    [searchQuery, tree, flattenTree]
  );

  // Flat list of currently visible rows (for keyboard nav)
  const visibleEntries = useMemo(
    () => searchResults ?? flatVisible(tree),
    [searchResults, tree]
  );

  // Set of workspace-relative file paths currently placed on any canvas page
  const usedOnCanvas = useMemo(() => {
    const paths = new Set<string>();
    const allNodes = [
      ...storeNodes,
      ...Object.values(pageSnapshots).flatMap((s) => s.nodes),
    ];
    for (const n of allNodes) {
      if (n.type === 'image') {
        const img = n as import('../types').ImageNode;
        if (img.assetName) {
          const folder = img.assetFolder ?? '';
          paths.add(folder ? `${folder}/${img.assetName}` : img.assetName);
        }
      }
      if (n.type === 'codeblock') {
        const cb = n as import('../types').CodeBlockNode;
        if (cb.linkedFile) paths.add(cb.linkedFile);
      }
      if (n.type === 'document') {
        const doc = n as import('../types').DocumentNode;
        if (doc.linkedFile) paths.add(doc.linkedFile);
      }
    }
    return paths;
  }, [storeNodes, pageSnapshots]);

  const pageDocs = useMemo(() => {
    const docsByPage = new Map<string, typeof documents>();
    for (const page of pages) docsByPage.set(page.id, []);
    for (const doc of documents) {
      if (!doc.pageId) continue;
      const list = docsByPage.get(doc.pageId);
      if (list) list.push(doc);
    }
    for (const [pageId, list] of docsByPage.entries()) {
      const page = pages.find((entry) => entry.id === pageId);
      const sorted = sortDocumentsForExplorer(list, page?.noteSort ?? 'updated');
      list.splice(0, list.length, ...sorted);
    }
    return docsByPage;
  }, [documents, pages]);

  const favoriteDocs = useMemo(
    () => documents.filter((doc) => doc.isFavorite).sort((a, b) => b.updatedAt - a.updatedAt),
    [documents]
  );
  const visibleFavoriteDocs = useMemo(() => favoriteDocs.slice(0, 5), [favoriteDocs]);

  const getPageNodes = useCallback((pageId: string) => {
    if (pageId === activePageId) return storeNodes;
    return pageSnapshots[pageId]?.nodes ?? [];
  }, [activePageId, pageSnapshots, storeNodes]);
  const createNoteForPage = useCallback((pageId: string) => {
    if (pageId !== activePageId) switchPage(pageId);
    const page = pages.find((entry) => entry.id === pageId);
    const pageDocList = sortDocumentsForExplorer(
      documents.filter((doc) => doc.pageId === pageId),
      page?.noteSort ?? 'updated'
    );
    const docId = addDocument({
      title: 'Untitled note',
      pageId,
      orderIndex: (page?.noteSort ?? 'updated') === 'custom' ? pageDocList.length : undefined,
    });
    useBoardStore.getState().ensureDocumentNode(docId, pageId);
    openDocument(docId);
  }, [activePageId, addDocument, documents, openDocument, pages, switchPage]);

  const openDocumentFromShortcut = useCallback((doc: Document) => {
    if (doc.pageId && doc.pageId !== activePageId) switchPage(doc.pageId);
    openDocument(doc.id);
  }, [activePageId, openDocument, switchPage]);

  const toggleFavoriteFromExplorer = useCallback((doc: Document) => {
    toggleFavoriteDocument(doc.id);
    if (getWorkspaceName()) {
      window.setTimeout(() => {
        void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      }, 0);
    }
  }, [toggleFavoriteDocument]);

  const renameDocumentFromExplorer = useCallback((docId: string, title: string) => {
    updateDocument(docId, { title });
  }, [updateDocument]);

  const reorderDocumentsForPage = useCallback((pageId: string, docIds: string[]) => {
    docIds.forEach((docId, index) => {
      updateDocument(docId, { orderIndex: index });
    });
  }, [updateDocument]);

  const changePageNoteSort = useCallback((page: PageMeta, sort: 'updated' | 'custom') => {
    if (sort === 'custom') {
      const orderedDocs = sortDocumentsForExplorer(
        documents.filter((doc) => doc.pageId === page.id),
        page.noteSort ?? 'updated'
      );
      orderedDocs.forEach((doc, index) => {
        if (doc.orderIndex !== index) updateDocument(doc.id, { orderIndex: index });
      });
    }
    setPageNoteSort(page.id, sort);
  }, [documents, setPageNoteSort, updateDocument]);

  const ensureCustomSortForPage = useCallback((page: PageMeta) => {
    if (page.noteSort === 'custom') return;
    changePageNoteSort(page, 'custom');
  }, [changePageNoteSort]);

  const deleteDocumentFromExplorer = useCallback((doc: Document) => {
    setDeleteNoteConfirm(doc);
  }, []);

  const revealPageInFinder = useCallback((page: PageMeta) => {
    void revealInFinder(`pages/${page.id}.json`);
  }, []);

  const revealDocumentInFinder = useCallback((doc: Document) => {
    if (!doc.linkedFile) {
      toast('Save this note to the workspace first');
      return;
    }
    void revealInFinder(doc.linkedFile);
  }, []);

  const togglePageCollapsed = useCallback((pageId: string) => {
    setCollapsedPageIds((prev) => ({ ...prev, [pageId]: !prev[pageId] }));
  }, []);

  const showPagePreview = useCallback((page: PageMeta, anchorY: number) => {
    clearPreview();
    setNotePreview(null);
    setPagePreview({
      kind: 'page',
      page,
      docs: pageDocs.get(page.id) ?? [],
      nodes: getPageNodes(page.id),
      anchorY,
    });
  }, [clearPreview, getPageNodes, pageDocs]);

  const showNotePreview = useCallback((page: PageMeta, doc: Document, anchorY: number) => {
    clearPreview();
    setPagePreview(null);
    setNotePreview({
      kind: 'note',
      page,
      doc,
      anchorY,
    });
  }, [clearPreview]);

  const showShortcutNotePreview = useCallback((doc: Document, anchorY: number) => {
    const page = pages.find((entry) => entry.id === doc.pageId) ?? pages.find((entry) => entry.id === activePageId) ?? pages[0];
    if (!page) return;
    showNotePreview(page, doc, anchorY);
  }, [activePageId, pages, showNotePreview]);

  const cloudTree = useMemo(() => buildVirtualCloudTree({
    pages,
    documents,
    nodes: storeNodes,
    pageSnapshots,
    expandedPaths: new Set(
      Object.entries(cloudExpandedPaths)
        .filter(([, expanded]) => expanded)
        .map(([path]) => path)
    ),
  }), [cloudExpandedPaths, documents, pageSnapshots, pages, storeNodes]);

  const handleAssetToggle = useCallback((path: string[]) => {
    if (!cloudOnlyWorkspace) {
      handleToggle(path);
      return;
    }
    const key = path.join('/');
    setCloudExpandedPaths((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [cloudOnlyWorkspace, handleToggle]);

  const assetTree = useMemo(
    () => {
      const sourceTree = cloudOnlyWorkspace ? cloudTree : tree;
      if (cloudOnlyWorkspace) return sourceTree;
      return advancedFilesVisible ? sourceTree : sourceTree.filter(isVisibleInAssets);
    },
    [advancedFilesVisible, cloudOnlyWorkspace, cloudTree, tree]
  );

  const assetSearchResults = useMemo(
    () => {
      if (!searchQuery.trim()) return null;
      const results = flattenTree(cloudOnlyWorkspace ? cloudTree : tree)
        .filter((entry) => entry.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (cloudOnlyWorkspace || advancedFilesVisible) return results;
      return results.filter(isVisibleInAssets);
    },
    [advancedFilesVisible, cloudOnlyWorkspace, cloudTree, flattenTree, searchQuery, tree]
  );

  const assetVisibleEntries = useMemo(
    () => assetSearchResults ?? flatVisible(assetTree),
    [assetSearchResults, assetTree]
  );

  const keyboardItems = useMemo<ExplorerKeyboardItem[]>(() => {
    const items: ExplorerKeyboardItem[] = [];
    if (hasWorkspaceContext && pages.length > 0 && pagesSectionOpen) {
      for (const page of pages) {
        items.push({ kind: 'page', pageId: page.id });
        const isCollapsed = collapsedPageIds[page.id] ?? !(page.id === activePageId);
        if (isCollapsed) continue;
        const docsForPage = pageDocs.get(page.id) ?? [];
        for (const doc of docsForPage) items.push({ kind: 'doc', pageId: page.id, docId: doc.id });
      }
    }
    if (assetsSectionOpen) {
      for (const entry of assetVisibleEntries) items.push({ kind: 'asset', path: entry.path });
    }
    return items;
  }, [activePageId, assetVisibleEntries, assetsSectionOpen, collapsedPageIds, hasWorkspaceContext, pageDocs, pages, pagesSectionOpen]);

  visibleEntriesRef.current = assetVisibleEntries;
  const focusedItem = focusedIdx !== null ? keyboardItems[focusedIdx] ?? null : null;
  const focusedPath = focusedItem?.kind === 'asset' ? focusedItem.path.join('/') : null;
  const focusedPageId = focusedItem?.kind === 'page' ? focusedItem.pageId : null;
  const focusedDocId = focusedItem?.kind === 'doc' ? focusedItem.docId : null;

  // Reset focus when search changes
  useEffect(() => {
    setFocusedIdx(null);
    clearPagePreview();
  }, [clearPagePreview, searchQuery]);

  useEffect(() => {
    if (focusedIdx === null) return;
    if (keyboardItems[focusedIdx]) return;
    setFocusedIdx(keyboardItems.length ? Math.min(focusedIdx, keyboardItems.length - 1) : null);
  }, [focusedIdx, keyboardItems]);

  // Auto-scroll focused row into view
  useEffect(() => {
    if (focusedIdx === null) return;
    const el = panelRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  // Auto-preview focused file
  useEffect(() => {
    if (focusedIdx === null) { clearPreview(); return; }
    if (!focusedItem || focusedItem.kind !== 'asset') { clearPreview(); return; }
    const entry = assetVisibleEntries.find((item) => item.path.join('/') === focusedItem.path.join('/'));
    if (!entry || entry.kind === 'directory') { clearPreview(); return; }
    const rect = panelRef.current?.getBoundingClientRect();
    const panelMidY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    showFilePreview(entry, panelMidY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetVisibleEntries, focusedIdx, focusedItem]);

  const focusAssetPath = useCallback((path: string[]) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'asset' && item.path.join('/') === path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const focusPage = useCallback((pageId: string) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'page' && item.pageId === pageId);
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const focusDocument = useCallback((pageId: string, docId: string) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'doc' && item.pageId === pageId && item.docId === docId);
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      setSearchOpen(false);
      setSearchQuery('');
      return;
    }
    if (keyboardItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? 0 : Math.min(prev + 1, keyboardItems.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? keyboardItems.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === 'Enter') {
      if (focusedIdx === null) return;
      const item = keyboardItems[focusedIdx];
      if (!item) return;
      e.preventDefault();
      if (item.kind === 'page') {
        clearPagePreview();
        if (item.pageId !== activePageId) switchPage(item.pageId);
        window.dispatchEvent(new CustomEvent('devboard:snap-close-document'));
      } else if (item.kind === 'doc') {
        clearPagePreview();
        if (item.pageId !== activePageId) switchPage(item.pageId);
        openDocument(item.docId);
      } else {
        const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === item.path.join('/'));
        if (!entry) return;
        if (entry.kind === 'directory') {
          handleAssetToggle(entry.path);
        } else if (e.shiftKey) {
          clearPreview();
          placeFile(entry);
        } else {
          clearPreview();
          openFile(entry);
        }
      }
    } else if (e.key === 'F2') {
      if (focusedItem?.kind !== 'asset') return;
      const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === focusedItem.path.join('/'));
      if (entry) { e.preventDefault(); startRename(entry); }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (focusedItem?.kind !== 'asset') return;
      const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === focusedItem.path.join('/'));
      if (entry) { e.preventDefault(); startDelete(entry); }
    } else if (e.key === 'Escape') {
      setExplorerMenu(null);
      setFocusedIdx(null);
      clearPagePreview();
      clearPreview();
    }
  }, [activePageId, assetVisibleEntries, clearPagePreview, clearPreview, focusedIdx, focusedItem, handleAssetToggle, keyboardItems, openDocument, openFile, placeFile, searchOpen, startDelete, startRename, switchPage]);

  return (
    <>
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--c-sidebar)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* App menu + sidebar toggle header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isPreviewPanel ? 6 : 8,
          minHeight: 52,
          padding: '10px 12px 9px',
          flexShrink: 0,
          borderBottom: '1px solid var(--c-border)',
          background: 'color-mix(in srgb, var(--c-sidebar) 96%, var(--c-canvas))',
        }}
      >
        {/* Main app menu button */}
        <div style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flex: isPreviewPanel ? 0 : 1 }}>
          <button
            type="button"
            aria-label="App menu"
            title="App menu"
            onClick={(e) => {
              setCommandMenuOpen((open) => !open);
            }}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: commandMenuOpen ? `1.5px solid ${DARK_MENU_COLORS.border}` : '1px solid var(--c-border)',
              borderRadius: 9,
              background: commandMenuOpen ? DARK_MENU_COLORS.surface : 'color-mix(in srgb, var(--c-canvas) 52%, transparent)',
              cursor: 'pointer',
              color: commandMenuOpen ? DARK_MENU_COLORS.textHi : 'var(--c-text-hi)',
              boxShadow: commandMenuOpen ? '0 10px 24px rgba(0,0,0,0.22)' : 'none',
              flexShrink: 0,
            }}
          >
            <MenuIcon />
          </button>
          {!isPreviewPanel && (
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--c-text-hi)',
                fontFamily: FONTS.ui,
                fontSize: 11.5,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              {workspaceDisplayName}
            </span>
          )}
          {commandMenuOpen && (
            <div
              style={{
                position: 'fixed',
                top: 50,
                left: 10,
                zIndex: 10001,
                width: 220,
                padding: '6px 0',
                border: `1px solid ${DARK_MENU_COLORS.border}`,
                borderRadius: 10,
                background: DARK_MENU_COLORS.surface,
                boxShadow: DARK_MENU_COLORS.shadow,
                overflow: 'hidden',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CommandMenuItem
                icon={<CommandIcon kind="file" />}
                label="File"
                onClick={() => {
                  setCommandMenuOpen(false);
                }}
              />
              <CommandMenuItem
                icon={<CommandIcon kind="edit" />}
                label="Edit"
                onClick={() => {
                  setCommandMenuOpen(false);
                }}
              />
              <CommandMenuItem
                icon={<CommandIcon kind="view" />}
                label="View"
                onClick={() => {
                  setCommandMenuOpen(false);
                }}
              />
              <CommandMenuItem
                icon={<CommandIcon kind="export" />}
                label="Export"
                onClick={() => {
                  setCommandMenuOpen(false);
                }}
              />
              <CommandMenuDivider />
              <CommandMenuItem
                icon={<CommandIcon kind="download" />}
                label="Download desktop app"
                onClick={() => {
                  setCommandMenuOpen(false);
                  window.open('https://devboard.app/download', '_blank');
                }}
              />
              <CommandMenuDivider />
              <CommandMenuItem
                icon={<CommandIcon kind="settings" />}
                label="Preferences..."
                onClick={() => {
                  setCommandMenuOpen(false);
                  setAccountMenuOpen(true);
                }}
              />
              <CommandMenuItem
                icon={<CommandIcon kind="help" />}
                label="Help & about"
                onClick={() => {
                  setCommandMenuOpen(false);
                  window.dispatchEvent(new CustomEvent('devboard:open-get-started'));
                }}
              />
              <CommandMenuDivider />
              <CommandMenuItem
                icon={<CommandIcon kind="folder" />}
                label="Switch workspace..."
                onClick={() => {
                  setCommandMenuOpen(false);
                  void handleOpenFolder();
                }}
              />
            </div>
          )}
        </div>

        {/* Sidebar expand/collapse button - always visible but secondary when expanded */}
        <button
          onClick={onCollapse}
          title={isPreviewPanel ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center transition-all"
          style={{
            width: 32,
            height: 32,
            border: isPreviewPanel ? '1px solid var(--c-border)' : '1px solid transparent',
            borderRadius: 9,
            background: isPreviewPanel ? 'color-mix(in srgb, var(--c-canvas) 42%, transparent)' : 'transparent',
            color: isPreviewPanel ? 'var(--c-text-md)' : 'var(--c-text-off)',
            cursor: 'pointer',
            opacity: isPreviewPanel ? 1 : 0.4,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = isPreviewPanel ? '1' : '0.7';
            if (!isPreviewPanel) {
              e.currentTarget.style.color = 'var(--c-text-md)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = isPreviewPanel ? '1' : '0.4';
            if (!isPreviewPanel) {
              e.currentTarget.style.color = 'var(--c-text-off)';
            }
          }}
        >
          <IconSidebarToggle size={16} />
        </button>
      </div>
      {hasWorkspaceContext && (
        <div
          style={{
            padding: '10px 12px 11px',
            borderBottom: '1px solid var(--c-border)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              height: 30,
              padding: '0 9px',
              border: `1px solid ${searchOpen ? 'rgba(184,119,80,0.32)' : 'transparent'}`,
              borderRadius: 8,
              background: searchOpen ? 'var(--c-canvas)' : 'color-mix(in srgb, var(--c-hover) 58%, transparent)',
              transition: 'border-color 120ms, background 120ms',
            }}
            onMouseDown={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.62 }}>
              <circle cx="4.5" cy="4.5" r="3.5" stroke="var(--c-text-hi)" strokeWidth="1.3" />
              <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="var(--c-text-hi)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearchOpen(false);
                  setSearchQuery('');
                  searchInputRef.current?.blur();
                  return;
                }
                if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) handleKeyDown(e as unknown as React.KeyboardEvent);
              }}
              placeholder="Search folders, notes, files..."
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: FONTS.ui,
                fontSize: 11,
                fontWeight: 550,
                color: 'var(--c-text-hi)',
                caretColor: 'var(--c-line)',
              }}
            />
          </div>
        </div>
      )}

      {hasWorkspaceContext && documents.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          {favoriteDocs.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setFavoritesSectionOpen((v) => !v)}
                className="group"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  minHeight: 22,
                  padding: '4px 10px 3px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <span style={explorerSectionHeaderStyle}>Favorites</span>
                <SectionChevron open={favoritesSectionOpen} />
                <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 8.5, color: 'var(--c-text-lo)' }}>{favoriteDocs.length}</span>
              </button>
              {favoritesSectionOpen && (
                <div style={{ padding: '0 8px 4px' }}>
                  {visibleFavoriteDocs.map((doc) => (
                    <NoteShortcutRow
                      key={doc.id}
                      doc={doc}
                      active={doc.id === activeDocId}
                      onOpen={openDocumentFromShortcut}
                      onToggleFavorite={toggleFavoriteFromExplorer}
                      onPreview={showShortcutNotePreview}
                      onPreviewEnd={clearNotePreview}
                    />
                  ))}
                  {favoriteDocs.length > visibleFavoriteDocs.length && (
                    <div style={{ padding: '5px 8px 2px', fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-lo)' }}>
                      +{favoriteDocs.length - visibleFavoriteDocs.length} more favorites
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* ── FOLDERS section ────────────────────────────────────────────────── */}
      {hasWorkspaceContext && pages.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          {/* Section header */}
          <div
            onClick={() => setPagesSectionOpen((v) => !v)}
            className="group"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 4,
              minHeight: 22,
              padding: '4px 10px 3px', background: 'none', border: 'none',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={explorerSectionHeaderStyle}>Folders</span>
            <SectionChevron open={pagesSectionOpen} />
            <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 8.5, color: 'var(--c-text-lo)' }}>{pages.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addPage();
              }}
              title="New folder"
              style={{
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                color: 'var(--c-text-lo)',
                cursor: 'pointer',
                flexShrink: 0,
                fontFamily: FONTS.ui,
                fontSize: 12,
                lineHeight: 1,
                opacity: 0,
                transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
              }}
              className="group-hover:opacity-100 focus:opacity-100"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-lo)';
              }}
            >
              +
            </button>
          </div>

          {pagesSectionOpen && (
            <div
              style={{
                padding: '0 8px 0',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                scrollbarWidth: 'thin',
              }}
            >
              {pages.map((page) => {
                const isActive = page.id === activePageId;
                const docsForPage = pageDocs.get(page.id) ?? [];
                const isCollapsed = collapsedPageIds[page.id] ?? !isActive;
                return (
	                  <PageGroup
                    key={page.id}
                    page={page}
                    docs={docsForPage}
                    coarsePointer={coarsePointer}
                    isActive={isActive}
                    isCollapsed={isCollapsed}
                    activeDocId={activeDocId}
                    onRenameDocument={renameDocumentFromExplorer}
                    onToggleFavoriteDocument={toggleFavoriteFromExplorer}
                    onReorderDocuments={(docIds) => reorderDocumentsForPage(page.id, docIds)}
                    onDeleteDocument={deleteDocumentFromExplorer}
                    onRevealDocument={revealDocumentInFinder}
                    onRenamePage={renamePage}
                    onDeletePage={(targetPage) => setDeletePageConfirm({ id: targetPage.id, name: targetPage.name })}
                    onRevealPage={revealPageInFinder}
                    onChangeSortMode={changePageNoteSort}
                    onEnsureCustomSort={ensureCustomSortForPage}
                    onToggleCollapsed={() => togglePageCollapsed(page.id)}
                    onOpenPageOverview={() => {
                      if (!isActive) switchPage(page.id);
                      window.dispatchEvent(new CustomEvent('devboard:snap-close-document'));
                    }}
	                    onCreateFolder={() => addPage()}
	                    onCreateNote={() => createNoteForPage(page.id)}
	                    onOpenDocument={(docId) => {
	                      if (!isActive) switchPage(page.id);
	                      openDocument(docId);
	                    }}
	                    pageFocused={focusedPageId === page.id}
	                    focusedDocId={focusedDocId}
	                    onFocusPage={focusPage}
	                    onFocusDocument={focusDocument}
	                    onPageHover={showPagePreview}
	                    onPageLeave={clearPagePreview}
                      onNoteHover={showNotePreview}
                      onNoteLeave={clearNotePreview}
	                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--c-border)',
          flexShrink: 0,
          padding: 10,
          position: 'relative',
        }}
      >
        {missingImages.length > 0 && (
          <div ref={missingImagesPopoverRef} style={{ position: 'relative', marginBottom: 8 }}>
            {missingImagesOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 'calc(100% + 8px)',
                  zIndex: 9200,
                  padding: 12,
                  border: '1px solid rgba(245,158,11,0.38)',
                  borderRadius: 12,
                  background: 'var(--c-panel)',
                  boxShadow: '0 18px 46px rgba(25,18,14,0.22)',
                  fontFamily: FONTS.ui,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--c-text-hi)' }}>
                      {missingImages.length} missing image{missingImages.length === 1 ? '' : 's'}
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 10.5, lineHeight: 1.45, color: 'var(--c-text-lo)' }}>
                      DevBoard has image cards, but the image files are not loaded from this workspace.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMissingImagesOpen(false)}
                    title="Close"
                    aria-label="Close missing images help"
                    style={{
                      width: 22,
                      height: 22,
                      border: 'none',
                      borderRadius: 6,
                      background: 'transparent',
                      color: 'var(--c-text-lo)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {missingImages.slice(0, 4).map((image) => (
                    <div
                      key={image.id}
                      title={missingImagePath(image)}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 10,
                        color: 'var(--c-text-md)',
                        padding: '4px 6px',
                        borderRadius: 6,
                        background: 'color-mix(in srgb, var(--c-hover) 46%, transparent)',
                      }}
                    >
                      {missingImagePath(image)}
                    </div>
                  ))}
                  {missingImages.length > 4 && (
                    <div style={{ fontSize: 10, color: 'var(--c-text-lo)', padding: '2px 6px' }}>
                      +{missingImages.length - 4} more
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={handleFindMissingImages}
                    disabled={missingImagesFixing || !hasWorkspaceHandle()}
                    title={hasWorkspaceHandle() ? 'Search the workspace for missing image files' : 'Reopen the workspace folder first'}
                    style={{
                      flex: 1,
                      height: 32,
                      border: 'none',
                      borderRadius: 8,
                      background: hasWorkspaceHandle() ? 'var(--c-line)' : 'var(--c-hover)',
                      color: hasWorkspaceHandle() ? '#fff' : 'var(--c-text-lo)',
                      cursor: missingImagesFixing || !hasWorkspaceHandle() ? 'default' : 'pointer',
                      fontFamily: FONTS.ui,
                      fontSize: 11,
                      fontWeight: 750,
                      opacity: missingImagesFixing ? 0.72 : 1,
                    }}
                  >
                    {missingImagesFixing ? 'Finding...' : 'Find images'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    style={{
                      flex: 1,
                      height: 32,
                      border: '1px solid var(--c-border)',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--c-text-md)',
                      cursor: 'pointer',
                      fontFamily: FONTS.ui,
                      fontSize: 11,
                      fontWeight: 650,
                    }}
                  >
                    Reopen folder
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                setMissingImagesOpen((open) => !open);
              }}
              title="Fix missing images"
              style={{
                width: '100%',
                minHeight: 34,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 10px',
                border: '1px solid rgba(245,158,11,0.26)',
                borderRadius: 10,
                background: 'rgba(245,158,11,0.09)',
                color: '#b45309',
                cursor: 'pointer',
                fontFamily: FONTS.ui,
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: '#f59e0b', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 750 }}>
                Missing images
              </span>
              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 650, color: 'var(--c-text-lo)' }}>
                {missingImages.length}
              </span>
            </button>
          </div>
        )}

        <div ref={accountMenuRef} style={{ position: 'relative' }}>
          {accountMenuOpen && (() => {
            const rect = accountMenuRef.current?.getBoundingClientRect();
            const menuHeight = 320;
            const left = rect ? Math.max(8, rect.left - 320 + rect.width) : 8;
            const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
            const top = rect ? (spaceBelow >= menuHeight ? rect.bottom + 8 : Math.max(8, rect.top - menuHeight - 8)) : 8;
            return (
              <div
                style={{
                  position: 'fixed',
                  left,
                  top,
                  zIndex: 10000,
                  overflow: 'hidden',
                  border: `1px solid ${DARK_MENU_COLORS.border}`,
                  borderRadius: 14,
                  background: DARK_MENU_COLORS.surface,
                  boxShadow: DARK_MENU_COLORS.shadow,
                  fontFamily: FONTS.ui,
                  width: 320,
                  maxHeight: '80vh',
                  overflowY: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${DARK_MENU_COLORS.border}` }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 750, color: DARK_MENU_COLORS.textHi }}>
                  {accountLabel}
                </div>
                {user?.email && user.email !== accountLabel && (
                  <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, color: DARK_MENU_COLORS.textMuted }}>
                    {user.email}
                  </div>
                )}
              </div>
              <div style={{ padding: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    openCloudModal();
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 9px', border: 'none', borderRadius: 8, background: 'transparent', color: DARK_MENU_COLORS.text, cursor: 'pointer', fontFamily: FONTS.ui, fontSize: 12, textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hover; e.currentTarget.style.color = DARK_MENU_COLORS.textHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DARK_MENU_COLORS.text; }}
                >
                  <span>Workspace Sync...</span>
                  <span style={{ color: authConfigured ? 'var(--c-line)' : DARK_MENU_COLORS.textMuted, fontSize: 10.5 }}>
                    {authConfigured ? accountStatus : 'Off'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setAccountMenuOpen(false);
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '8px 9px', border: 'none', borderRadius: 8, background: 'transparent', color: DARK_MENU_COLORS.text, cursor: 'pointer', fontFamily: FONTS.ui, fontSize: 12, textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hover; e.currentTarget.style.color = DARK_MENU_COLORS.textHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DARK_MENU_COLORS.text; }}
                >
                  {theme === 'light' ? 'Dark mode' : 'Light mode'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteAutosaveEnabled(!noteAutosaveEnabled);
                    setAccountMenuOpen(false);
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '8px 9px', border: 'none', borderRadius: 8, background: 'transparent', color: DARK_MENU_COLORS.text, cursor: 'pointer', fontFamily: FONTS.ui, fontSize: 12, textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hover; e.currentTarget.style.color = DARK_MENU_COLORS.textHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DARK_MENU_COLORS.text; }}
                >
                  {noteAutosaveEnabled ? 'Disable note autosave' : 'Enable note autosave'}
                </button>
                {user && (
                  <>
                    <div style={{ height: 1, margin: '6px 4px', background: DARK_MENU_COLORS.border }} />
                    <button
                      type="button"
                      onClick={() => { void handleAccountSignOut(); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '8px 9px', border: 'none', borderRadius: 8, background: 'transparent', color: DARK_MENU_COLORS.text, cursor: 'pointer', fontFamily: FONTS.ui, fontSize: 12, textAlign: 'left' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hover; e.currentTarget.style.color = DARK_MENU_COLORS.textHi; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DARK_MENU_COLORS.text; }}
                    >
                      Sign out
                    </button>
                  </>
                )}
                </div>
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => {
              setMissingImagesOpen(false);
              setAccountMenuOpen((open) => !open);
            }}
            title="Account and settings"
            className="group"
            style={{
              width: '100%',
              minHeight: 54,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 6px',
              border: 'none',
              borderRadius: 12,
              background: 'transparent',
              color: 'var(--c-text-md)',
              cursor: 'pointer',
              fontFamily: FONTS.ui,
              textAlign: 'left',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-md)';
            }}
          >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              background: 'var(--c-line)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              accountInitials
            )}
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--c-text-hi)',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {accountLabel}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--c-text-lo)', fontSize: 10.5, fontWeight: 600 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: hasUnsyncedSyncChanges ? '#f59e0b' : 'var(--c-border)',
                }}
              />
              {accountStatus}
            </span>
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              borderRadius: 10,
              color: cloudOnlyWorkspace || hasUnsyncedSyncChanges
                  ? 'var(--c-line)'
                  : 'var(--c-text-lo)',
              background: 'color-mix(in srgb, var(--c-hover) 56%, transparent)',
            }}
          >
            <IconCloud size={17} />
          </span>
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete {deleteConfirm.kind === 'directory' ? 'folder' : 'file'}?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deleteConfirm.name}</span>
              {deleteConfirm.kind === 'directory' ? ' and all its contents will be permanently deleted.' : ' will be permanently deleted.'}
              {' '}This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { doDelete(deleteConfirm); setDeleteConfirm(null); }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder delete confirmation */}
      {deletePageConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete folder?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deletePageConfirm.name}</span>
              {' '}will be removed from the workspace. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  deletePage(deletePageConfirm.id);
                  setDeletePageConfirm(null);
                }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeletePageConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note delete confirmation */}
      {deleteNoteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete note?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deleteNoteConfirm.title || 'Untitled note'}</span>
              {' '}will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  deleteDocument(deleteNoteConfirm.id);
                  setDeleteNoteConfirm(null);
                }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteNoteConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extension-change warning */}
      {renameExtWarning && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>Change file extension?</p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Renaming <span style={{ color: 'var(--c-text-md)' }}>{renameExtWarning.entry.name}</span> to{' '}
              <span style={{ color: '#d4835a' }}>{renameExtWarning.newName}</span> changes the extension.
              The file may no longer open correctly.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { doRename(renameExtWarning.entry, renameExtWarning.newName); setRenameExtWarning(null); }}
                style={{ flex: 1, padding: '7px 0', background: '#d4835a', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Rename anyway
              </button>
              <button
                onClick={() => setRenameExtWarning(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explorer entry context menu */}
      {explorerMenu && (() => {
        const MENU_W = 160;
        const left = Math.min(explorerMenu.x, window.innerWidth - MENU_W - 8);
        const top  = Math.min(explorerMenu.y, window.innerHeight - 80);
        const menuExt = ext(explorerMenu.entry.name);
        const canActOnFile = explorerMenu.entry.kind === 'file' && (IMAGE_EXTS.has(menuExt) || DOC_EXTS.has(menuExt) || CODE_EXTS[menuExt] !== undefined);
        const isDocFile = explorerMenu.entry.kind === 'file' && DOC_EXTS.has(menuExt);
        const entryRelativePath = explorerMenu.entry.path.join('/');
        const isReadOnly = cloudOnlyWorkspace || isWorkspaceManagedEntry(explorerMenu.entry);
        return (
          <div
            ref={explorerMenuRef}
            style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {canActOnFile && (
              <>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => { setExplorerMenu(null); openFile(explorerMenu.entry); }}
                >
                  <span>{isDocFile ? 'Open note' : 'Place on canvas'}</span>
                  <span className="text-[10px] text-[var(--c-text-off)] ml-3">↵</span>
                </button>
                {isDocFile && (
                  <button
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                    style={{ fontFamily: FONTS.ui }}
                    onClick={() => { setExplorerMenu(null); placeFile(explorerMenu.entry); }}
                  >
                    <span>Place on canvas</span>
                    <span className="text-[10px] text-[var(--c-text-off)] ml-3">drag</span>
                  </button>
                )}
                <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              </>
            )}
            {IS_TAURI && (
              <>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => {
                    setExplorerMenu(null);
                    void revealInFinder(entryRelativePath);
                  }}
                >
                  <span>Show in Folder</span>
                </button>
                <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              </>
            )}
            {isReadOnly ? (
              <div
                className="px-3 py-1.5 text-[12px]"
                style={{ fontFamily: FONTS.ui, color: 'var(--c-text-off)' }}
              >
                {cloudOnlyWorkspace ? 'Cloud file' : 'Managed by Folders'}
              </div>
            ) : (
              <>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => startRename(explorerMenu.entry)}
                >
                  <span>Rename</span>
                  <span className="text-[10px] text-[var(--c-text-off)] ml-3">F2</span>
                </button>
                <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
                  style={{ fontFamily: FONTS.ui, color: '#f87171' }}
                  onClick={() => startDelete(explorerMenu.entry)}
                >
                  <span>Delete</span>
                  <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Folder preview panel */}
      {pagePreview && (() => {
        const previewW = 240;
        const rect = panelRef.current?.getBoundingClientRect();
        const panelLeft = rect?.left ?? 0;
        const panelRight = rect?.right ?? WORKSPACE_EXPLORER_WIDTH;
        const spaceRight = window.innerWidth - (panelRight + 8);
        const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
        const top = Math.max(8, Math.min(pagePreview.anchorY - 80, window.innerHeight - 320));
        const noteCount = pagePreview.docs.length;
        const canvasNodeCount = pagePreview.nodes.filter((node) => node.type !== 'connector').length;
        const previewDocs = pagePreview.docs.slice(0, 3);
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              maxHeight: 360,
              zIndex: 200,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
              overflow: 'hidden',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: 'var(--c-text-hi)' }}>
                {pagePreview.page.name}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
                {pagePreview.page.layoutMode === 'stack' ? 'notes folder' : 'canvas folder'}
              </span>
            </div>
            <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)', background: 'linear-gradient(180deg, rgba(212,131,90,0.08), rgba(212,131,90,0.02))' }}>
              <PageMiniMap nodes={pagePreview.nodes} />
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', gap: 10, flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 600, color: 'var(--c-text-hi)' }}>{canvasNodeCount} nodes</span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)' }}>{noteCount} notes</span>
            </div>
            {previewDocs.length > 0 && (
              <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {previewDocs.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 700, color: 'var(--c-text-hi)' }}>
                      {doc.title || 'Untitled note'}
                    </span>
                    <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)', lineHeight: 1.4 }}>
                      {(stripHtmlPreview(doc.content) || 'No preview text yet').slice(0, 78)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
                press ↵ to open folder overview
              </span>
            </div>
          </div>
        );
      })()}

      {/* Note preview panel */}
      {notePreview && (() => {
        const previewW = 280;
        const rect = panelRef.current?.getBoundingClientRect();
        const panelLeft = rect?.left ?? 0;
        const panelRight = rect?.right ?? WORKSPACE_EXPLORER_WIDTH;
        const spaceRight = window.innerWidth - (panelRight + 8);
        const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
        const top = Math.max(8, Math.min(notePreview.anchorY - 96, window.innerHeight - 280));
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              maxHeight: 320,
              zIndex: 200,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
              overflow: 'hidden',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: 'var(--c-text-hi)' }}>
                {notePreview.doc.title || 'Untitled note'}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
                {notePreview.page.name}
              </span>
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <NoteHoverThumbnail doc={notePreview.doc} />
            </div>
            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
                click to open note
              </span>
            </div>
          </div>
        );
      })()}

      {/* File preview panel */}
      {filePreview && (() => {
        const previewW = 240;
        const rect = panelRef.current?.getBoundingClientRect();
        const panelLeft = rect?.left ?? 0;
        const panelRight = rect?.right ?? WORKSPACE_EXPLORER_WIDTH;
        const spaceRight = window.innerWidth - (panelRight + 8);
        const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
        const top = Math.max(8, Math.min(filePreview.anchorY - 80, window.innerHeight - 260));
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              maxHeight: 340,
              zIndex: 200,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
              overflow: 'hidden',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Filename bar */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: fileColor(filePreview.entry.name, isDark) }}>
                {filePreview.entry.name}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
                {filePreview.entry.path.slice(0, -1).join('/')}
              </span>
            </div>

            {filePreview.kind === 'image' ? (
              <>
                <div style={{ background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, maxHeight: 180, overflow: 'hidden', flexShrink: 0 }}>
                  <img src={filePreview.url} style={{ maxWidth: '100%', maxHeight: 180, display: 'block', objectFit: 'contain' }} alt="" />
                </div>
                <div style={{ padding: '7px 10px', display: 'flex', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 600, color: 'var(--c-text-hi)' }}>{filePreview.natW} × {filePreview.natH}</span>
                  <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)' }}>{formatSize(filePreview.size)}</span>
                </div>
              </>
            ) : (
              <div style={{ overflow: 'auto', flex: 1, padding: '6px 0' }}>
                <pre style={{ margin: 0, padding: '0 10px', fontFamily: FONTS.ui, fontSize: 10, lineHeight: 1.5, color: 'var(--c-text-hi)', whiteSpace: 'pre', tabSize: 2 }}>
                  {filePreview.content.split('\n').slice(0, 40).join('\n')}
                  {filePreview.content.split('\n').length > 40 && '\n…'}
                </pre>
              </div>
            )}

            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
                {DOC_EXTS.has(ext(filePreview.entry.name))
                  ? 'double-click or ↵ to open note · drag to place'
                  : 'double-click or ↵ to place on canvas'}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}
