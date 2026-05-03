/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; opens note files and places assets on canvas.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import type { CanvasNode, Document, PageMeta } from '../types';
import { listDirectory, readWorkspaceFile, readWorkspaceFileAsUrl, readWorkspaceFileInfo, getWorkspaceName, openWorkspace, createWorkspace, renameEntry, createDirectory, deleteEntry, FSA_DIR_SUPPORTED, IN_IFRAME, IS_TAURI, revealInFinder, saveTextFileToWorkspace, saveWorkspace } from '../utils/workspaceManager';
import { FONTS } from '../utils/fonts';
import { placeCodeFile, placeImageFile, placeDocumentFile, openDocumentFile } from '../utils/canvasPlacement';
import { generateMarkdownFilename, htmlToMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { toast } from '../utils/toast';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import { useFilePreview } from '../hooks/useFilePreview';
import { useTreeState } from '../hooks/useTreeState';
import { IconFreeformPage, IconStackPage } from './icons';
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
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--c-text-hi)',
};

const explorerFocusedRowStyle: React.CSSProperties = {
  background: 'rgba(184,119,80,0.12)',
  outline: '1px solid rgba(184,119,80,0.26)',
  outlineOffset: -1,
};

const ADVANCED_FILES_STORAGE_KEY = 'devboard-advanced-files-visible';

const HIDDEN_ASSET_ROOTS = new Set(['notes', 'documents', 'pages']);
const HIDDEN_ASSET_FILES = new Set(['workspace.json']);

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

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generatePlainTextFilename(title?: string): string {
  return generateMarkdownFilename(title).replace(/\.md$/i, '.txt');
}

function exportDocumentAsMarkdownFile(doc: Document): void {
  const md = [`# ${doc.title || 'Untitled note'}`, '', htmlToMarkdown(doc.content ?? '')].join('\n').trim() + '\n';
  saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), generateMarkdownFilename(doc.title));
}

function exportDocumentAsTextFile(doc: Document): void {
  const text = stripHtmlPreview(doc.content ?? '');
  const body = text ? `${doc.title || 'Untitled note'}\n\n${text}\n` : `${doc.title || 'Untitled note'}\n`;
  saveAs(new Blob([body], { type: 'text/plain;charset=utf-8' }), generatePlainTextFilename(doc.title));
}

function exportDocumentAsPdf(doc: Document): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=720');
  if (!printWindow) {
    toast('Allow pop-ups to export as PDF');
    return;
  }

  const safeTitle = doc.title || 'Untitled note';
  const content = doc.content?.trim() || '<p></p>';
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 48px; color: #1f1a16; line-height: 1.65; }
          h1 { font-size: 30px; margin: 0 0 24px; }
          h2, h3 { margin-top: 24px; }
          p, li, blockquote, pre { font-size: 14px; }
          blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid #b87750; background: #f5ede3; border-radius: 10px; }
          pre { background: #f6f1ea; padding: 14px 16px; border-radius: 10px; overflow: auto; white-space: pre-wrap; }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
          hr { border: none; border-top: 1px solid #d7cdbf; margin: 24px 0; }
          a { color: #8b4f2d; }
          .doc-wrap { max-width: 760px; margin: 0 auto; }
          @media print {
            body { margin: 24px; }
          }
        </style>
      </head>
      <body>
        <div class="doc-wrap">
          <h1>${safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
          ${content}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

function isVisibleInAssets(entry: TreeEntry): boolean {
  if (entry.path.length === 0) return true;
  const root = entry.path[0];
  if (!root) return true;
  if (HIDDEN_ASSET_ROOTS.has(root)) return false;
  if (entry.path.length === 1 && HIDDEN_ASSET_FILES.has(entry.name)) return false;
  return true;
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
          if (!isNotesFolder) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(true);
        }}
        onDragOver={(e) => {
          if (!isNotesFolder) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDragLeave={() => {
          if (isNotesFolder) setDropActive(false);
        }}
        onDrop={(e) => {
          if (!isNotesFolder) return;
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
    <div style={{ marginBottom: 4 }}>
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
          minHeight: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 6,
          ...(isActive ? explorerFocusedRowStyle : {}),
          ...(pageFocused ? {
            background: 'rgba(184,119,80,0.16)',
            outline: '1px solid rgba(184,119,80,0.38)',
            outlineOffset: -1,
          } : {}),
          ...(!isActive && !pageFocused && pageHovered ? {
            background: 'rgba(184,119,80,0.08)',
            outline: '1px solid rgba(184,119,80,0.16)',
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
              width: 14,
              height: 14,
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
          title={`Open "${page.name}" page overview`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--c-line)' : 'var(--c-text-lo)' }}>
            {page.layoutMode === 'stack' ? (
              <IconStackPage />
            ) : (
              <IconFreeformPage />
            )}
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
                height: 22,
                padding: '0 6px',
                background: 'var(--c-canvas)',
                border: '1px solid rgba(184,119,80,0.28)',
                borderRadius: 5,
                outline: 'none',
                fontFamily: FONTS.ui,
                fontSize: 10.5,
                color: 'var(--c-text-hi)',
              }}
            />
          ) : (
            <span style={{
              fontFamily: FONTS.ui, fontSize: 10, fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1,
            }}>
              {page.name}
            </span>
          )}
          <span style={{
            fontFamily: FONTS.ui,
            fontSize: 9,
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
              width: 18,
              height: 18,
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
                fontSize: 14,
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
              width: 18,
              height: 18,
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
                <span>By updated date</span>
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
                <span>Rename page</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
                style={{ fontFamily: FONTS.ui, color: '#f87171' }}
                onClick={() => {
                  onDeletePage(page);
                  setPageMenu(null);
                }}
              >
                <span>Delete page</span>
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
            marginLeft: 22,
            paddingLeft: 8,
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
              No notes on this page
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
                    minHeight: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginTop: 2,
                    padding: '4px 8px',
	                    background: isDragged
                        ? 'rgba(184,119,80,0.08)'
                        : (isFocused || isSelected)
                          ? 'rgba(184,119,80,0.14)'
                          : isHovered
                            ? 'rgba(184,119,80,0.08)'
                            : 'none',
	                    border: 'none',
	                    outline: isDropTarget
	                      ? '1px solid rgba(184,119,80,0.42)'
	                      : (isFocused || isSelected)
	                        ? '1px solid rgba(184,119,80,0.26)'
                          : isHovered
                            ? '1px solid rgba(184,119,80,0.16)'
	                        : 'none',
                    outlineOffset: -1,
                    borderRadius: 6,
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
                      'display:flex',
                      'align-items:center',
                      'gap:8px',
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

                    const grip = document.createElement('span');
                    grip.textContent = '⋮⋮';
                    grip.style.cssText = 'font-size:10px;color:#8a755f;flex-shrink:0;';
                    ghost.appendChild(grip);

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
                  <span
                    title="Drag note to reorder"
                    style={{
                      width: 12,
                      display: 'flex',
                      justifyContent: 'center',
                      color: isDropTarget || isDragged ? 'var(--c-line)' : 'var(--c-text-off)',
                      cursor: isRenaming ? 'text' : 'grab',
                      flexShrink: 0,
                      fontSize: 10,
                      lineHeight: 1,
                      opacity: isDragged ? 1 : 0.72,
                      transition: 'color 0.12s ease, opacity 0.12s ease',
                    }}
                  >
                    ⋮⋮
                  </span>
                  <span style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0, color: isSelected ? 'var(--c-line)' : 'var(--c-text-lo)' }}>
                    {doc.emoji ? (
                      <span style={{ fontSize: 12, lineHeight: 1 }}>{doc.emoji}</span>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <rect x="1.5" y="1.5" width="9" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.1" />
                        <path d="M3.5 4h5M3.5 6h5M3.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
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
                        flex: 1,
                        minWidth: 0,
                        height: 22,
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
                      fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: isSelected ? 600 : 500,
                      color: 'var(--c-text-hi)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {doc.title || 'Untitled note'}
                    </span>
                  )}
                  <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: isSelected ? 'var(--c-text-md)' : 'var(--c-text-lo)', flexShrink: 0 }}>
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
}

export default function WorkspaceExplorer({ onClose, onCollapse, canClose = true }: Props) {
  const imageAssetFolder = useBoardStore((s) => s.imageAssetFolder);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const exportData = useBoardStore((s) => s.exportData);
  const setWorkspaceName = useBoardStore((s) => s.setWorkspaceName);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const markLocalSaved = useBoardStore((s) => s.markLocalSaved);
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
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const storeNodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const isDark = useBoardStore((s) => s.theme) === 'dark';

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
  const [assetsSectionOpen, setAssetsSectionOpen] = useState(true);
  const [advancedFilesVisible, setAdvancedFilesVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ADVANCED_FILES_STORAGE_KEY) === '1';
  });
  const [collapsedPageIds, setCollapsedPageIds] = useState<Record<string, boolean>>({});
  const [pageSectionHeight, setPageSectionHeight] = useState(320);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const workspaceNameInputRef = useRef<HTMLInputElement>(null);
  const workspaceNameBlurCancelledRef = useRef(false);
  const [workspaceNameEditing, setWorkspaceNameEditing] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
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
  // Explorer context menu (right-click)
  type ExplorerMenu = { entry: TreeEntry; x: number; y: number };
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const explorerMenuRef = useRef<HTMLDivElement>(null);
  const [filesSectionMenu, setFilesSectionMenu] = useState<{ x: number; y: number } | null>(null);
  const filesSectionMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const workspaceDisplayName = useMemo(() => {
    const title = boardTitle.trim();
    return title || cloudBoardTitle || storeWorkspaceName || getWorkspaceName() || 'Untitled Workspace';
  }, [boardTitle, cloudBoardTitle, storeWorkspaceName]);

  const startWorkspaceNameEdit = useCallback(() => {
    workspaceNameBlurCancelledRef.current = false;
    setWorkspaceNameDraft(workspaceDisplayName);
    setWorkspaceNameEditing(true);
  }, [workspaceDisplayName]);

  const cancelWorkspaceNameEdit = useCallback(() => {
    workspaceNameBlurCancelledRef.current = true;
    setWorkspaceNameDraft('');
    setWorkspaceNameEditing(false);
  }, []);

  const commitWorkspaceNameEdit = useCallback(() => {
    workspaceNameBlurCancelledRef.current = false;
    const nextName = workspaceNameDraft.trim() || workspaceDisplayName;
    setWorkspaceNameEditing(false);
    setWorkspaceNameDraft('');
    if (nextName === workspaceDisplayName) return;

    setBoardTitle(nextName);
    if (cloudBoardId) markLocalSaved();

    const data = { ...useBoardStore.getState().exportData(), boardTitle: nextName };
    void saveWorkspace(data, { notify: false })
      .then((result) => {
        if (result.saved) {
          toast(`Renamed workspace · ${nextName}`);
        } else if (cloudBoardId) {
          toast('Workspace renamed locally. Sync to update the online copy.');
        }
      })
      .catch((err) => {
        console.warn('Workspace rename save failed:', err);
        toast('Workspace renamed locally. Save again to update the folder.');
      });
  }, [cloudBoardId, markLocalSaved, setBoardTitle, workspaceDisplayName, workspaceNameDraft]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
  }, []);

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
    if (!workspaceNameEditing) return;
    const raf = window.requestAnimationFrame(() => {
      workspaceNameInputRef.current?.focus();
      workspaceNameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [workspaceNameEditing]);

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

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? window.innerHeight;
      const minHeight = 120;
      const maxHeight = Math.max(minHeight, Math.min(520, panelHeight * 0.62));
      const nextHeight = resizeState.startHeight + (e.clientY - resizeState.startY);
      setPageSectionHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    };

    const onPointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
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

    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : stem;
    const linkedFile = `notes/${filename}`;
    const existingDoc = useBoardStore.getState().documents.find((doc) => doc.linkedFile === linkedFile);
    const docId = existingDoc?.id ?? addDocument({ title, content: markdownToHtml(content), linkedFile });
    openDocumentWithMorph(docId);
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
  }, [addDocument, openDocumentWithMorph, setTree, updateEntry]);

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

  // ── Rename ───────────────────────────────────────────────────────────────
  const [renameExtWarning, setRenameExtWarning] = useState<{ entry: TreeEntry; newName: string } | null>(null);

  const startRename = useCallback((entry: TreeEntry) => {
    setRenamingPath(entry.path.join('/'));
    setRenameDraft(entry.name);
    renamingEntryRef.current = entry;
    setExplorerMenu(null);
  }, []);

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
    setDeleteConfirm(entry);
    setExplorerMenu(null);
  }, []);

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
    openDocumentWithMorph(docId);
  }, [activePageId, addDocument, documents, openDocumentWithMorph, pages, switchPage]);

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

  const startPageSectionResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = { startY: e.clientY, startHeight: pageSectionHeight };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [pageSectionHeight]);

  const handleCreateWorkspace = useCallback(async () => {
    const result = await createWorkspace(exportData(), boardTitle.trim() || 'DevBoard Workspace');
    if (!result) return;
    setWorkspaceName(result.name);
  }, [boardTitle, exportData, setWorkspaceName]);

  const assetTree = useMemo(
    () => advancedFilesVisible ? tree : tree.filter(isVisibleInAssets),
    [advancedFilesVisible, tree]
  );

  const assetSearchResults = useMemo(
    () => searchResults?.filter((entry) => advancedFilesVisible || isVisibleInAssets(entry)) ?? null,
    [advancedFilesVisible, searchResults]
  );

  const assetVisibleEntries = useMemo(
    () => assetSearchResults ?? flatVisible(assetTree),
    [assetSearchResults, assetTree]
  );

  const keyboardItems = useMemo<ExplorerKeyboardItem[]>(() => {
    const items: ExplorerKeyboardItem[] = [];
    if (getWorkspaceName() && pages.length > 0 && pagesSectionOpen) {
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
  }, [activePageId, assetVisibleEntries, assetsSectionOpen, collapsedPageIds, pageDocs, pages, pagesSectionOpen]);

  visibleEntriesRef.current = visibleEntries;
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
        openDocumentWithMorph(item.docId);
      } else {
        const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === item.path.join('/'));
        if (!entry) return;
        if (entry.kind === 'directory') {
          handleToggle(entry.path);
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
  }, [activePageId, assetVisibleEntries, clearPagePreview, clearPreview, focusedIdx, focusedItem, handleToggle, keyboardItems, openDocumentWithMorph, openFile, placeFile, searchOpen, startDelete, startRename, switchPage]);

  return (
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--c-panel)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <button
            onClick={onCollapse}
            title="Collapse sidebar"
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.75 2.25 4 6l3.75 3.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 2.25 6.25 6 10 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {!searchOpen ? (
            workspaceNameEditing ? (
              <input
                ref={workspaceNameInputRef}
                value={workspaceNameDraft}
                onChange={(e) => setWorkspaceNameDraft(e.target.value)}
                onBlur={() => {
                  if (workspaceNameBlurCancelledRef.current) {
                    workspaceNameBlurCancelledRef.current = false;
                    return;
                  }
                  commitWorkspaceNameEdit();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitWorkspaceNameEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelWorkspaceNameEdit();
                  }
                  e.stopPropagation();
                }}
                aria-label="Workspace name"
                className="select-text"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 24,
                  padding: '0 7px',
                  background: 'var(--c-canvas)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 6,
                  outline: 'none',
                  fontFamily: FONTS.ui,
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--c-text-hi)',
                  letterSpacing: 0,
                }}
              />
            ) : (
              <button
                type="button"
                onClick={startWorkspaceNameEdit}
                title="Rename workspace"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                  maxWidth: '100%',
                  padding: '2px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  cursor: 'text',
                  color: 'var(--c-text-hi)',
                }}
                className="group/workspace-name hover:bg-[var(--c-hover)]"
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: FONTS.ui,
                    fontSize: 12,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {workspaceDisplayName}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  className="opacity-0 group-hover/workspace-name:opacity-60 group-focus/workspace-name:opacity-60 transition-opacity"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M6.6 1.3 8.7 3.4 3.2 8.9H1.1V6.8L6.6 1.3Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              </button>
            )
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                flex: 1,
                height: 24,
                padding: '0 8px',
                border: '1px solid var(--c-border)',
                borderRadius: 8,
                background: 'var(--c-panel)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
                <circle cx="4.5" cy="4.5" r="3.5" stroke="var(--c-text-hi)" strokeWidth="1.3" />
                <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="var(--c-text-hi)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchOpen(false);
                    setSearchQuery('');
                    return;
                  }
                  if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) handleKeyDown(e as unknown as React.KeyboardEvent);
                }}
                placeholder="Search assets..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: FONTS.ui,
                  fontSize: 10,
                  color: 'var(--c-text-hi)',
                  caretColor: 'var(--c-line)',
                }}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {confirmingClose ? (
            /* Two-step close confirmation */
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', whiteSpace: 'nowrap' }}>Close?</span>
              <button
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  onClose();
                }}
                style={{ padding: '1px 7px', background: 'var(--c-line)', border: 'none', borderRadius: 4, fontFamily: FONTS.ui, fontSize: 10, color: 'white', cursor: 'pointer', lineHeight: 1.6 }}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  setConfirmingClose(false);
                }}
                style={{ padding: '1px 7px', background: 'none', border: '1px solid var(--c-border)', borderRadius: 4, fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-lo)', cursor: 'pointer', lineHeight: 1.6 }}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  setSearchOpen((current) => {
                    const next = !current;
                    if (!next) setSearchQuery('');
                    return next;
                  });
                }}
                title={searchOpen ? 'Close search' : 'Search'}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                  <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              {canClose && (
                <button
                  onClick={() => {
                    setConfirmingClose(true);
                    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                    confirmCloseTimerRef.current = setTimeout(() => setConfirmingClose(false), 3000);
                  }}
                  title="Close explorer"
                  className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── BOARDS section ─────────────────────────────────────────────────── */}
      {getWorkspaceName() && pages.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          {/* Section header */}
          <div
            onClick={() => setPagesSectionOpen((v) => !v)}
            className="group"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 4,
              minHeight: 24,
              padding: '4px 10px', background: 'none', border: 'none',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 9, color: 'var(--c-text-off)',
              transform: pagesSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.12s',
              display: 'inline-block',
            }}>▾</span>
            <span style={explorerSectionHeaderStyle}>Pages</span>
            <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-lo)' }}>{pages.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addPage();
              }}
              title="New page"
              style={{
                width: 18,
                height: 18,
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
                fontSize: 14,
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
                padding: '0 6px 0',
                height: pageSectionHeight,
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
	                    onCreateNote={() => createNoteForPage(page.id)}
	                    onOpenDocument={(docId) => {
	                      if (!isActive) switchPage(page.id);
	                      openDocumentWithMorph(docId);
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

      {getWorkspaceName() && pages.length > 0 && pagesSectionOpen && (
        <div
          onPointerDown={startPageSectionResize}
          title="Resize pages section"
          style={{
            height: 8,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'ns-resize',
            borderBottom: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 3,
              borderRadius: 999,
              background: 'rgba(138, 117, 95, 0.26)',
            }}
          />
        </div>
      )}

      {/* Files section */}
      <div style={{ borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <button
          onClick={() => setAssetsSectionOpen((v) => !v)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFilesSectionMenu({ x: e.clientX, y: e.clientY });
          }}
          className="group"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 4,
            minHeight: 24,
            padding: '4px 10px', background: 'none', border: 'none',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span style={{
            fontSize: 9, color: 'var(--c-text-off)',
            transform: assetsSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.12s',
            display: 'inline-block',
          }}>▾</span>
          <span style={explorerSectionHeaderStyle}>Assets</span>
          <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-lo)' }}>{assetTree.length}</span>
          {advancedFilesVisible && (
            <span
              style={{
                fontFamily: FONTS.ui,
                fontSize: 8,
                color: 'var(--c-line)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginRight: 6,
                flexShrink: 0,
              }}
            >
              Advanced
            </span>
          )}
          {getWorkspaceName() && (
            <span
              role="button"
              tabIndex={0}
              title="New folder at root"
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors group-hover:opacity-100 focus:opacity-100"
              style={{ flexShrink: 0, opacity: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                setAssetsSectionOpen(true);
                startNewFolder([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setAssetsSectionOpen(true);
                  startNewFolder([]);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3a1 1 0 0 1 1-1h2.5L5.5 3H10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                <line x1="6" y1="5.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="4.5" y1="7" x2="7.5" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </button>
      </div>

      {filesSectionMenu && (() => {
        const MENU_W = 190;
        const left = Math.min(filesSectionMenu.x, window.innerWidth - MENU_W - 8);
        const top = Math.min(filesSectionMenu.y, window.innerHeight - 80);
        return (
          <div
            ref={filesSectionMenuRef}
            style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => {
                setAdvancedFilesVisible((current) => !current);
                setFilesSectionMenu(null);
              }}
            >
              <span>{advancedFilesVisible ? 'Hide advanced files' : 'Show advanced files'}</span>
              <span className="text-[10px] text-[var(--c-text-off)] ml-3">{advancedFilesVisible ? 'on' : 'off'}</span>
            </button>
          </div>
        );
      })()}

      {/* File tree */}
      {assetsSectionOpen && (
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-0.5" style={{ scrollbarWidth: 'thin', overflowX: 'hidden' }}>
        {/* Inline new-folder input at root */}
        {newFolderParent !== null && newFolderParent.length === 0 && (
          <div className="flex items-center gap-1.5 h-[26px] px-2 mx-1 rounded" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
              <path d="M1 3a1 1 0 0 1 1-1h2.5L5.5 3H10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" stroke="var(--c-line)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(); }
                if (e.key === 'Escape') { e.preventDefault(); setNewFolderParent(null); }
                e.stopPropagation();
              }}
              onBlur={() => { if (!newFolderName.trim()) setNewFolderParent(null); }}
              placeholder="folder name…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', caretColor: 'var(--c-line)' }}
            />
          </div>
        )}
        {rootLoading ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading…</div>
        ) : rootError ? (
          <div style={{ padding: '10px 16px', fontSize: 10.5, color: '#c96a6a', fontFamily: FONTS.ui, lineHeight: 1.5 }}>{rootError}</div>
        ) : !getWorkspaceName() ? (
          <NoWorkspaceState onOpen={handleOpenFolder} onCreate={IS_TAURI ? handleCreateWorkspace : undefined} />
        ) : assetSearchResults !== null ? (
          assetSearchResults.length === 0 ? (
            <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>No matches</div>
          ) : (
            assetSearchResults.map((entry) => (
              <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileOpen={handleFileOpen} onMarkdownDrop={importMarkdownToNotes} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} onFocus={focusAssetPath} />
            ))
          )
        ) : assetTree.length === 0 ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>Folder is empty</div>
        ) : (
          assetTree.map((entry) => (
            <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileOpen={handleFileOpen} onMarkdownDrop={importMarkdownToNotes} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} onFocus={focusAssetPath} />
          ))
        )}
      </div>
      )}

      <div style={{ padding: '7px 10px 8px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
        <p style={{ fontSize: 9, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, lineHeight: 1.3, margin: 0 }}>
          ⌘K to jump anywhere
        </p>
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

      {/* Page delete confirmation */}
      {deletePageConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete page?
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
          </div>
        );
      })()}

      {/* Page preview panel */}
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
                {pagePreview.page.layoutMode === 'stack' ? 'stack page' : 'canvas page'}
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
                press ↵ to open page overview
              </span>
            </div>
          </div>
        );
      })()}

      {/* Note preview panel */}
      {notePreview && (() => {
        const previewW = 240;
        const rect = panelRef.current?.getBoundingClientRect();
        const panelLeft = rect?.left ?? 0;
        const panelRight = rect?.right ?? WORKSPACE_EXPLORER_WIDTH;
        const spaceRight = window.innerWidth - (panelRight + 8);
        const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
        const top = Math.max(8, Math.min(notePreview.anchorY - 80, window.innerHeight - 220));
        const previewText = stripHtmlPreview(notePreview.doc.content) || 'No preview text yet';
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              maxHeight: 300,
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
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)', lineHeight: 1.5 }}>
                {previewText.slice(0, 220)}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
                updated {relativeTime(notePreview.doc.updatedAt)}
              </span>
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
  );
}
