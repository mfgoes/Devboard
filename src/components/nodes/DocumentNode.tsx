import { useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { DocumentNode, AnchorSide } from '../../types';
import { PreviewLine, htmlToPreviewStructured } from '../../utils/richText';
import { IconGrip, IconExpand, IconDoc } from '../icons';
import { useDocumentAutoSave } from '../../hooks/useDocumentAutoSave';

const CARD_WIDTH  = 280;
const CARD_HEIGHT = 176;

const ANCHOR_SIDES: { side: AnchorSide; sx: (w: number) => number; sy: (h: number) => number; ox: number; oy: number }[] = [
  { side: 'top',    sx: (w) => w / 2, sy: () => 0,    ox: 0,   oy: -28 },
  { side: 'bottom', sx: (w) => w / 2, sy: (h) => h,   ox: 0,   oy:  28 },
  { side: 'left',   sx: () => 0,      sy: (h) => h/2, ox: -28, oy: 0   },
  { side: 'right',  sx: (w) => w,     sy: (h) => h/2, ox:  28, oy: 0   },
];

const btnBase: React.CSSProperties = {
  height: 22,
  padding: '0 7px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 5,
  color: 'var(--c-text-lo)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10.5,
  fontFamily: 'inherit',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

interface Props {
  node: DocumentNode;
  isSelected: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
}

function renderPreviewLine(line: PreviewLine, idx: number): React.ReactNode {
  const renderSegs = (segments: PreviewLine['segments']) =>
    segments.map((s, i) => (
      <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined }}>
        {s.text}
      </span>
    ));

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
  return (
    <div key={idx} style={{ ...ellipsis, color: 'var(--c-text-md)' }}>
      {renderSegs(line.segments)}
    </div>
  );
}

export default function DocumentNodeComponent({ node, isSelected, isDrawingLine, onAnchorDown, onAnchorEnter, onAnchorLeave, snapAnchor }: Props) {
  const { camera, updateNode, selectIds, setFocusDocument, openDocument, openDocumentWithMorph, activeTool, documents } = useBoardStore();

  // Post-migration: read title/content from Document entity; fall back to inline fields
  const doc = node.docId ? documents.find((d) => d.id === node.docId) : undefined;
  const displayTitle = doc?.title ?? node.title ?? '';
  const displayContent = doc?.content ?? node.content ?? '';

  const dragRef = useRef<{ startMX: number; startMY: number; startNX: number; startNY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);

  useDocumentAutoSave(node);

  const isLineTool  = activeTool === 'line';
  const showAnchors = isSelected || isLineTool || isDrawingLine === true;

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startMX) / camera.scale;
    const dy = (e.clientY - dragRef.current.startMY) / camera.scale;
    updateNode(node.id, { x: dragRef.current.startNX + dx, y: dragRef.current.startNY + dy });
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

  const handleHeaderDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('input') || target.closest('button')) return;
    e.stopPropagation();
    if (activeTool !== 'pan') selectIds([node.id]);
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startNX: node.x, startNY: node.y };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
    }, { once: true });
  };

  const handleFocusMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectIds([node.id]);
    if (node.docId) {
      const rect = cardRef.current?.getBoundingClientRect();
      openDocumentWithMorph(node.docId, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
    } else {
      setFocusDocument(node.id);
    }
  };

  const screenX = camera.x + node.x * camera.scale;
  const screenY = camera.y + node.y * camera.scale;

  const previewLines = htmlToPreviewStructured(displayContent, 5);

  return (
    <>
      <div
        ref={cardRef}
        onMouseDown={handleCardMouseDown}
        style={{
          position: 'fixed',
          left: screenX,
          top: screenY,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
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
          onMouseDown={handleHeaderDragStart}
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
              letterSpacing: '-0.01em',
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

          <button
            type="button"
            onClick={handleFocusMode}
            onMouseDown={(e) => e.stopPropagation()}
            title="Open note"
            style={btnBase}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.11)'; e.currentTarget.style.color = 'var(--c-text-hi)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--c-text-lo)'; }}
          >
            <IconExpand />
            <span style={{ letterSpacing: 0.2 }}>Edit</span>
          </button>
        </div>

        {/* Preview body */}
        <div
          onClick={handleFocusMode}
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
            cursor: 'pointer',
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
        }}>
          <span style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.04em',
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
      </div>

      {showAnchors && ANCHOR_SIDES.map(({ side, sx, sy, ox, oy }) => {
        const ax = screenX + sx(CARD_WIDTH)  * camera.scale + ox;
        const ay = screenY + sy(CARD_HEIGHT) * camera.scale + oy;
        const isSnapped = snapAnchor === side;
        return (
          <div
            key={side}
            onMouseDown={(e) => {
              e.stopPropagation();
              onAnchorDown?.(node.id, side, node.x + sx(CARD_WIDTH), node.y + sy(CARD_HEIGHT));
            }}
            onMouseEnter={() => { setHoveredAnchor(side); onAnchorEnter?.(node.id, side); }}
            onMouseLeave={() => { setHoveredAnchor(null); onAnchorLeave?.(); }}
            style={{
              position: 'fixed',
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
