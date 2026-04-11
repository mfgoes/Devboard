import { useRef, useEffect, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { LinkNode as LinkNodeType, AnchorSide } from '../../types';
import { useTheme } from '../../theme';
import { fetchMeta } from '../../utils/fetchMeta';

const MIN_WIDTH = 260;
const MIN_HEIGHT = 56;

const ANCHOR_SIDES: { side: AnchorSide; sx: (w: number) => number; sy: (h: number) => number; ox: number; oy: number }[] = [
  { side: 'top',    sx: (w) => w / 2, sy: () => 0,    ox: 0,   oy: -28 },
  { side: 'bottom', sx: (w) => w / 2, sy: (h) => h,   ox: 0,   oy:  28 },
  { side: 'left',   sx: () => 0,      sy: (h) => h/2, ox: -28, oy: 0   },
  { side: 'right',  sx: (w) => w,     sy: (h) => h/2, ox:  28, oy: 0   },
];

// Best-effort favicon URL
function faviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return '';
  }
}

// Detect service from URL for accent color
function detectService(url: string): { label: string; color: string } | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('github.com'))     return { label: 'GitHub',  color: '#238636' };
    if (host.includes('gitlab.com'))     return { label: 'GitLab',  color: '#fc6d26' };
    if (host.includes('jira') || host.includes('atlassian')) return { label: 'Jira', color: '#0052cc' };
    if (host.includes('asana.com'))      return { label: 'Asana',   color: '#f06a6a' };
    if (host.includes('linear.app'))     return { label: 'Linear',  color: '#5e6ad2' };
    if (host.includes('notion.'))        return { label: 'Notion',  color: '#000000' };
    if (host.includes('figma.com'))      return { label: 'Figma',   color: '#a259ff' };
    if (host.includes('trello.com'))     return { label: 'Trello',  color: '#0079bf' };
    if (host.includes('slack.com'))      return { label: 'Slack',   color: '#4a154b' };
    if (host.includes('discord'))        return { label: 'Discord', color: '#5865f2' };
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { label: 'YouTube', color: '#ff0000' };
    if (host.includes('stackoverflow')) return { label: 'Stack Overflow', color: '#f48024' };
  } catch { /* ignore */ }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface Props {
  node: LinkNodeType;
  isSelected: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
  onContextMenu?: (nodeId: string, x: number, y: number) => void;
}

export default function LinkNodeComponent({ node, isSelected, isDrawingLine, onAnchorDown, onAnchorEnter, onAnchorLeave, snapAnchor, onContextMenu }: Props) {
  const t = useTheme();
  const isDark = useBoardStore((s) => s.theme) !== 'light';
  const { camera, updateNode, selectIds, activeTool } = useBoardStore();

  const dragRef = useRef<{ startMX: number; startMY: number; startNX: number; startNY: number } | null>(null);
  const resizeRef = useRef<{ startMX: number; startMY: number; startW: number; startH: number } | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(node.url);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);

  // Auto-fetch metadata when node is created with a real URL but no title
  const fetchedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (node.url && node.url !== 'https://' && !node.title && fetchedUrlRef.current !== node.url) {
      fetchedUrlRef.current = node.url;
      fetchMeta(node.url).then((meta) => {
        if (meta.title || meta.description || meta.image || meta.siteName) {
          updateNode(node.id, {
            title: meta.title,
            description: meta.description,
            image: meta.image,
            siteName: meta.siteName,
          } as Partial<LinkNodeType>);
        }
      });
    }
  }, [node.url, node.title, node.id, updateNode]);

  const isLineTool = activeTool === 'line';
  const showAnchors = isSelected || isLineTool || isDrawingLine === true;

  const service = detectService(node.url);
  const accent = service?.color ?? 'var(--c-line)';
  const favicon = node.favicon || faviconUrl(node.url);
  const isEmbed = node.displayMode === 'embed';

  // Global mouse handlers for drag/resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startMX) / camera.scale;
        const dy = (e.clientY - dragRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          x: dragRef.current.startNX + dx,
          y: dragRef.current.startNY + dy,
        } as Partial<LinkNodeType>);
      }
      if (resizeRef.current) {
        const dx = (e.clientX - resizeRef.current.startMX) / camera.scale;
        const dy = (e.clientY - resizeRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          width: Math.max(MIN_WIDTH, resizeRef.current.startW + dx),
          height: Math.max(MIN_HEIGHT, resizeRef.current.startH + dy),
        } as Partial<LinkNodeType>);
      }
    };
    const onUp = () => { dragRef.current = null; resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [camera.scale, node.id, updateNode]);

  const handleCardMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('a')) return;
    e.stopPropagation();
    if (useBoardStore.getState().activeTool !== 'pan') selectIds([node.id]);
  };

  const handleHeaderDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('a')) return;
    e.stopPropagation();
    if (useBoardStore.getState().activeTool !== 'pan') selectIds([node.id]);
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startNX: node.x, startNY: node.y };
  };

  const commitUrl = async () => {
    const trimmed = urlDraft.trim();
    if (trimmed && trimmed !== node.url) {
      updateNode(node.id, { url: trimmed, title: undefined, description: undefined, image: undefined, siteName: undefined } as Partial<LinkNodeType>);
      // Auto-fetch metadata for the new URL
      const meta = await fetchMeta(trimmed);
      if (meta.title || meta.description || meta.image || meta.siteName) {
        updateNode(node.id, {
          title: meta.title,
          description: meta.description,
          image: meta.image,
          siteName: meta.siteName,
        } as Partial<LinkNodeType>);
      }
    }
    setEditingUrl(false);
  };

  const screenX = camera.x + node.x * camera.scale;
  const screenY = camera.y + node.y * camera.scale;

  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const headerBg = isDark ? '#13131e' : '#f8f8fc';
  const borderColor = isSelected ? 'var(--c-line)' : isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)';
  const textHi = isDark ? '#e2e8f0' : '#1e293b';
  const textLo = isDark ? '#8888aa' : '#64748b';

  return (
    <>
      <div
        onMouseDown={handleCardMouseDown}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          selectIds([node.id]);
          onContextMenu?.(node.id, e.clientX, e.clientY);
        }}
        style={{
          position: 'absolute',
          left: screenX,
          top: screenY,
          width: node.width,
          transformOrigin: 'top left',
          transform: `scale(${camera.scale})`,
          borderRadius: 10,
          border: `1.5px solid ${borderColor}`,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 32px rgba(0,0,0,0.25)'
            : '0 4px 24px rgba(0,0,0,0.15)',
          background: cardBg,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: MIN_WIDTH,
          userSelect: 'none',
          zIndex: isSelected ? 10 : 5,
        }}
      >
        {/* Accent stripe */}
        <div style={{ height: 3, background: accent, flexShrink: 0 }} />

        {/* Header — draggable */}
        <div
          onMouseDown={handleHeaderDragStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: headerBg,
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            cursor: 'grab',
            flexShrink: 0,
          }}
        >
          {/* Favicon */}
          {favicon && (
            <img
              src={favicon}
              alt=""
              width={16}
              height={16}
              style={{ flexShrink: 0, borderRadius: 2 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}

          {/* Domain / service label */}
          <span style={{ fontSize: 11, fontWeight: 600, color: textLo, flexShrink: 0 }}>
            {service?.label ?? displayDomain(node.url)}
          </span>

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Open link button */}
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            title="Open link"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 4,
              color: textLo,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M9 6.5V9.5C9 10.05 8.55 10.5 8 10.5H2.5C1.95 10.5 1.5 10.05 1.5 9.5V4C1.5 3.45 1.95 3 2.5 3H5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M7 1.5H10.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 1.5L5.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </a>
        </div>

        {/* Body */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {/* Title — editable on double-click shows URL editor */}
          {editingUrl ? (
            <input
              autoFocus
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => { if (e.key === 'Enter') commitUrl(); if (e.key === 'Escape') { setUrlDraft(node.url); setEditingUrl(false); } }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="https://..."
              style={{
                width: '100%',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                color: textHi,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${accent}`,
                borderRadius: 4,
                padding: '4px 8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div
              onDoubleClick={() => { setUrlDraft(node.url); setEditingUrl(true); }}
              title="Double-click to edit URL"
              style={{ cursor: 'text' }}
            >
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: textHi,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}>
                {node.title || displayDomain(node.url)}
              </div>

              {/* URL line */}
              <div style={{
                fontSize: 11,
                color: textLo,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 2,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {truncate(node.url, 80)}
              </div>
            </div>
          )}

          {/* Embed extras: description + image */}
          {isEmbed && node.description && (
            <div style={{
              fontSize: 12,
              color: textLo,
              lineHeight: 1.45,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}>
              {node.description}
            </div>
          )}

          {isEmbed && node.image && (
            <img
              src={node.image}
              alt=""
              style={{
                width: '100%',
                maxHeight: 160,
                objectFit: 'cover',
                borderRadius: 6,
                marginTop: 4,
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>

        {/* Resize handle */}
        {isSelected && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              resizeRef.current = { startMX: e.clientX, startMY: e.clientY, startW: node.width, startH: node.height };
            }}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 16,
              height: 16,
              cursor: 'nwse-resize',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ position: 'absolute', right: 3, bottom: 3 }}>
              <path d="M8 2L2 8M8 5L5 8" stroke={textLo} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Connector anchor dots */}
      {showAnchors && ANCHOR_SIDES.map(({ side, sx, sy, ox, oy }) => {
        const cx = screenX + sx(node.width) * camera.scale;
        const cy = screenY + sy(node.height) * camera.scale;
        const isSnap = snapAnchor === side;
        const isHover = hoveredAnchor === side;
        return (
          <div
            key={side}
            onMouseDown={(e) => {
              e.stopPropagation();
              onAnchorDown?.(node.id, side, node.x + sx(node.width), node.y + sy(node.height));
            }}
            onMouseEnter={() => { setHoveredAnchor(side); onAnchorEnter?.(node.id, side); }}
            onMouseLeave={() => { setHoveredAnchor(null); onAnchorLeave?.(); }}
            style={{
              position: 'absolute',
              left: cx - 6,
              top: cy - 6,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: isSnap ? 'var(--c-line)' : isHover ? 'var(--c-line-pre)' : isDark ? '#334155' : '#cbd5e1',
              border: `2px solid ${isSnap || isHover ? 'var(--c-line)' : isDark ? '#475569' : '#94a3b8'}`,
              cursor: 'crosshair',
              zIndex: 15,
              transform: `scale(${isSnap ? 1.4 : 1})`,
              transition: 'transform 0.1s, background 0.1s',
            }}
          />
        );
      })}
    </>
  );
}
