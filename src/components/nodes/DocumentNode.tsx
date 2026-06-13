import { useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { DocumentNode, AnchorSide } from '../../types';
import { PreviewLine, htmlToPreviewStructured } from '../../utils/richText';
import { IconGrip, IconExpand, IconDoc, IconPencil } from '../icons';
import { useDocumentAutoSave } from '../../hooks/useDocumentAutoSave';

const CARD_WIDTH  = 280;
const CARD_HEIGHT = 176;
const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 132;

const ANCHOR_SIDES: { side: AnchorSide; sx: (w: number) => number; sy: (h: number) => number; ox: number; oy: number }[] = [
  { side: 'top',    sx: (w) => w / 2, sy: () => 0,    ox: 0,   oy: -28 },
  { side: 'bottom', sx: (w) => w / 2, sy: (h) => h,   ox: 0,   oy:  28 },
  { side: 'left',   sx: () => 0,      sy: (h) => h/2, ox: -28, oy: 0   },
  { side: 'right',  sx: (w) => w,     sy: (h) => h/2, ox:  28, oy: 0   },
];

const btnBase: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(138,117,95,0.22)',
  borderRadius: 7,
  color: 'var(--c-text-md)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  flexShrink: 0,
  boxShadow: '0 1px 6px rgba(31,24,18,0.08)',
};

interface Props {
  node: DocumentNode;
  isSelected: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorUp?: (nodeId: string, side: AnchorSide) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
  onContextMenu?: (nodeId: string, x: number, y: number) => void;
}

function renderPreviewLine(line: PreviewLine, idx: number): React.ReactNode {
  const renderSegs = (segments: PreviewLine['segments']) =>
    segments.map((s, i) => {
      if (s.wikiTitle) {
        return (
          <span
            key={i}
            title={s.wikiTitle}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              maxWidth: '100%',
              margin: '0 2px',
              padding: '1px 7px',
              borderRadius: 7,
              border: s.wikiMissing ? '1px dashed rgba(138,117,95,0.4)' : '1px solid rgba(184,119,80,0.28)',
              background: s.wikiMissing ? 'rgba(138,117,95,0.08)' : 'rgba(184,119,80,0.1)',
              color: s.wikiMissing ? 'var(--c-text-lo)' : 'var(--c-line)',
              fontWeight: 650,
              lineHeight: 1.35,
              verticalAlign: 'baseline',
            }}
          >
            <span style={{ display: 'flex', flexShrink: 0 }}>
              <IconDoc />
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text}</span>
          </span>
        );
      }
      return (
        <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined }}>
          {s.text}
        </span>
      );
    });

  const ellipsis: React.CSSProperties = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };

  if (line.kind === 'h1') return (
    <div key={idx} style={{ ...ellipsis, fontWeight: 700, fontSize: 12.5, color: 'var(--c-text-hi)', marginBottom: 1 }}>
      {renderSegs(line.segments)}
    </div>
  );
  if (line.kind === 'h2') return (
    <div key={idx} style={{ ...ellipsis, fontWeight: 600, fontSize: 12, color: 'var(--c-text-md)' }}>
      {renderSegs(line.segments)}
    </div>
  );
  if (line.kind === 'h3') return (
    <div key={idx} style={{ ...ellipsis, fontWeight: 600, fontSize: 11.5, color: 'var(--c-text-md)' }}>
      {renderSegs(line.segments)}
    </div>
  );
  if (line.kind === 'bullet' || line.kind === 'numbered') return (
    <div key={idx} style={{ display: 'flex', gap: 5, overflow: 'hidden', color: 'var(--c-text-md)' }}>
      <span style={{ flexShrink: 0, color: 'var(--c-text-lo)', fontSize: 10, lineHeight: '1.7' }}>•</span>
      <span style={{ ...ellipsis }}>{renderSegs(line.segments)}</span>
    </div>
  );
  if (line.kind === 'task') return (
    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', color: line.checked ? 'var(--c-text-lo)' : 'var(--c-text-md)' }}>
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 2.5,
          border: line.checked ? '1px solid var(--c-line)' : '1px solid var(--c-text-lo)',
          background: line.checked ? 'var(--c-line)' : 'transparent',
          color: 'white',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          lineHeight: 1,
          marginTop: 1,
        }}
      >
        {line.checked ? '✓' : ''}
      </span>
      <span style={{ ...ellipsis, textDecoration: line.checked ? 'line-through' : undefined }}>{renderSegs(line.segments)}</span>
    </div>
  );
  if (line.kind === 'callout') return (
    <div
      key={idx}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        margin: '2px 0',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--c-text-hi)',
        overflow: 'hidden',
      }}
    >
      {line.emoji && (
        <span style={{ flexShrink: 0, lineHeight: 1.35, fontSize: 14 }}>
          {line.emoji}
        </span>
      )}
      <span style={{ ...ellipsis, fontStyle: 'italic' }}>{renderSegs(line.segments)}</span>
    </div>
  );
  return (
    <div key={idx} style={{ ...ellipsis, color: 'var(--c-text-md)' }}>
      {renderSegs(line.segments)}
    </div>
  );
}

export default function DocumentNodeComponent({ node, isSelected, isDrawingLine, onAnchorDown, onAnchorUp, onAnchorEnter, onAnchorLeave, snapAnchor, onContextMenu }: Props) {
  const { camera, updateNode, selectIds, setFocusDocument, openDocument, openDocumentWithMorph, activeTool, documents, activeDocId, focusDocumentId, noteAutosaveEnabled, saveHistory, setDocViewMode } = useBoardStore();

  // Post-migration: read title/content from Document entity; fall back to inline fields
  const doc = node.docId ? documents.find((d) => d.id === node.docId) : undefined;
  const displayTitle = doc?.title ?? node.title ?? '';
  const displayContent = doc?.content ?? node.content ?? '';

  const cardWidth = node.width ?? CARD_WIDTH;
  const cardHeight = node.height ?? CARD_HEIGHT;
  const dragRef = useRef<{ startMX: number; startMY: number; startNX: number; startNY: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ startMX: number; startMY: number; startW: number; startH: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);

  useDocumentAutoSave({
    node,
    enabled: noteAutosaveEnabled,
    suspended: !!doc?.id && (activeDocId === doc.id || focusDocumentId === node.id),
  });

  const isLineTool  = activeTool === 'line';
  const showAnchors = isSelected || isLineTool || isDrawingLine === true;

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startMX) / camera.scale;
    const dy = (e.clientY - dragRef.current.startMY) / camera.scale;
    if (Math.hypot(e.clientX - dragRef.current.startMX, e.clientY - dragRef.current.startMY) > 3) {
      dragRef.current.moved = true;
    }
    updateNode(node.id, { x: dragRef.current.startNX + dx, y: dragRef.current.startNY + dy });
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const dx = (e.clientX - resizeRef.current.startMX) / camera.scale;
    const dy = (e.clientY - resizeRef.current.startMY) / camera.scale;
    updateNode(node.id, {
      width: Math.max(MIN_CARD_WIDTH, resizeRef.current.startW + dx),
      height: Math.max(MIN_CARD_HEIGHT, resizeRef.current.startH + dy),
    });
  };

  const handleResizeEnd = () => {
    resizeRef.current = null;
    setIsResizing(false);
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (activeTool === 'pan') return;
    selectIds([node.id]);
    saveHistory();
    resizeRef.current = { startMX: e.clientX, startMY: e.clientY, startW: cardWidth, startH: cardHeight };
    setIsResizing(true);
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  const handleCardMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('input') || target.closest('button')) {
      if (activeTool !== 'pan') selectIds([node.id]);
      return;
    }
    e.stopPropagation();
    if (activeTool !== 'pan') selectIds([node.id]);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT'
      || target.closest('input')
      || target.closest('button')
      || target.closest('[data-card-resize-handle="true"]')
    ) return;
    e.stopPropagation();
    if (activeTool !== 'pan') selectIds([node.id]);
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startNX: node.x, startNY: node.y, moved: false };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', () => {
      if (dragRef.current?.moved) suppressNextClickRef.current = true;
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
    }, { once: true });
  };

  const handleFocusMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    selectIds([node.id]);
    if (node.docId) {
      setDocViewMode('fullscreen');
      const rect = cardRef.current?.getBoundingClientRect();
      openDocumentWithMorph(node.docId, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
    } else {
      setFocusDocument(node.id);
    }
  };

  const handleEditMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectIds([node.id]);
    if (node.docId) {
      setDocViewMode('panel');
      openDocument(node.docId);
    } else {
      setFocusDocument(node.id);
    }
  };

  const screenX = camera.x + node.x * camera.scale;
  const screenY = camera.y + node.y * camera.scale;

  const previewLines = htmlToPreviewStructured(displayContent, 5);
  const showCardActions = isHovered || isResizing;

  return (
    <>
      <div
        ref={cardRef}
        onMouseDown={handleCardMouseDown}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          selectIds([node.id]);
          onContextMenu?.(node.id, e.clientX, e.clientY);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: 'absolute',
          left: screenX,
          top: screenY,
          width: cardWidth,
          height: cardHeight,
          transformOrigin: 'top left',
          transform: `scale(${camera.scale})`,
          borderRadius: 10,
          border: `1.5px solid ${isSelected ? 'var(--c-line)' : 'rgba(255,255,255,0.09)'}`,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(184,119,80,0.18), 0 8px 32px rgba(0,0,0,0.55)'
            : '0 4px 24px rgba(0,0,0,0.5)',
          background: 'var(--c-panel)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
          zIndex: isSelected ? 10 : 5,
        }}
      >
        {/* Title header — drag handle */}
        <div
          onMouseDown={handleDragStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 11px 8px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            cursor: 'grab',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.18)', flexShrink: 0, display: 'flex' }}>
            <IconGrip />
          </span>
          <span style={{ color: 'var(--c-line)', flexShrink: 0, display: 'flex', opacity: 0.8 }}>
            <IconDoc />
          </span>
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => {
              if (doc) {
                useBoardStore.getState().updateDocument(doc.id, { title: e.target.value });
              } else {
                updateNode(node.id, { title: e.target.value });
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Untitled note"
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0,
              color: 'var(--c-text-hi)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          {node.orderIndex != null && (
            <span style={{
              fontSize: 10,
              color: 'var(--c-text-lo)',
              background: 'rgba(184,119,80,0.15)',
              padding: '1px 5px',
              borderRadius: 3,
              flexShrink: 0,
              fontWeight: 500,
            }}>
              {node.orderIndex}
            </span>
          )}

          <div
            aria-hidden={!showCardActions}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              opacity: showCardActions ? 1 : 0,
              transform: showCardActions ? 'translateY(0)' : 'translateY(-2px)',
              pointerEvents: showCardActions ? 'auto' : 'none',
              transition: 'opacity 120ms ease, transform 120ms ease',
            }}
          >
            <button
              type="button"
              tabIndex={showCardActions ? 0 : -1}
              onClick={handleFocusMode}
              onMouseDown={(e) => e.stopPropagation()}
              title="Expand note"
              style={btnBase}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--c-text-hi)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.72)'; e.currentTarget.style.color = 'var(--c-text-md)'; }}
            >
              <IconExpand />
            </button>
            <button
              type="button"
              tabIndex={showCardActions ? 0 : -1}
              onClick={handleEditMode}
              onMouseDown={(e) => e.stopPropagation()}
              title="Edit note"
              style={btnBase}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--c-text-hi)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.72)'; e.currentTarget.style.color = 'var(--c-text-md)'; }}
            >
              <IconPencil />
            </button>
          </div>
        </div>

        {/* Preview body */}
        <div
          onClick={handleFocusMode}
          onMouseDown={handleDragStart}
          style={{
            flex: 1,
            padding: '9px 12px 6px',
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            cursor: activeTool === 'pan' ? 'grab' : 'move',
          }}
        >
          {previewLines.length > 0
            ? previewLines.map((line, i) => renderPreviewLine(line, i))
            : <span style={{ color: 'var(--c-text-off)', fontStyle: 'italic' }}>Empty note…</span>
          }
        </div>

        {/* Footer — .md badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '0 10px 8px',
          flexShrink: 0,
          opacity: showCardActions ? 0 : 1,
          transition: 'opacity 120ms ease',
        }}>
          <span style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: 0,
            color: 'var(--c-text-lo)',
            background: 'rgba(184,119,80,0.1)',
            border: '1px solid rgba(184,119,80,0.2)',
            padding: '1px 5px',
            borderRadius: 3,
            fontFamily: 'monospace',
          }}>
            .md
          </span>
        </div>

        <div
          data-card-resize-handle="true"
          onMouseDown={handleResizeStart}
          title="Resize note"
          style={{
            position: 'absolute',
            right: 7,
            bottom: 7,
            width: 18,
            height: 18,
            cursor: 'nwse-resize',
            opacity: showCardActions ? 0.95 : 0,
            pointerEvents: showCardActions ? 'auto' : 'none',
            transition: 'opacity 120ms ease',
          }}
        >
          <span style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 15,
            height: 15,
            borderRight: '3px solid rgba(138,117,95,0.58)',
            borderBottom: '3px solid rgba(138,117,95,0.58)',
            borderRadius: '0 0 4px 0',
          }} />
        </div>
      </div>

      {showAnchors && ANCHOR_SIDES.map(({ side, sx, sy, ox, oy }) => {
        const ax = screenX + sx(cardWidth)  * camera.scale + ox;
        const ay = screenY + sy(cardHeight) * camera.scale + oy;
        const isSnapped = snapAnchor === side;
        return (
          <div
            key={side}
            onMouseDown={(e) => {
              e.stopPropagation();
              onAnchorDown?.(node.id, side, node.x + sx(cardWidth), node.y + sy(cardHeight));
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              onAnchorUp?.(node.id, side);
            }}
            onMouseEnter={() => { setHoveredAnchor(side); onAnchorEnter?.(node.id, side); }}
            onMouseLeave={() => { setHoveredAnchor(null); onAnchorLeave?.(); }}
            style={{
              position: 'absolute',
              left: ax - 4,
              top: ay - 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isSnapped ? 'var(--c-line)' : hoveredAnchor === side ? 'rgba(184,119,80,0.6)' : 'rgba(184,119,80,0.4)',
              border: '1.5px solid white',
              cursor: 'crosshair',
              zIndex: 100,
              transition: 'background 0.15s',
              pointerEvents: 'auto',
            }}
          />
        );
      })}
    </>
  );
}
