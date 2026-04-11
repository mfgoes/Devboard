import { useRef, useEffect, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { CodeBlockNode, AnchorSide } from '../../types';
import { tokenizeLine, TOKEN_COLORS, CodeLanguage } from '../../utils/syntaxHighlight';

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace";
const FONT_SIZE = 13;
const LINE_HEIGHT = 1.65;
const CODE_PADDING = '10px 14px';
const MIN_WIDTH = 320;
// 3 lines × (fontSize × lineHeight) + top/bottom padding
const MIN_HEIGHT = Math.ceil(3 * FONT_SIZE * LINE_HEIGHT) + 20;

// ── Syntax-highlighted code renderer ────────────────────────────────────────

function HighlightedCode({
  code,
  language,
  showLineNumbers,
}: {
  code: string;
  language: CodeLanguage;
  showLineNumbers: boolean;
}) {
  const lines = code.split('\n');

  return (
    <div style={{ display: 'flex', minWidth: 0, flex: 1 }}>
      {showLineNumbers && (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            color: '#3d3d5a',
            textAlign: 'right',
            userSelect: 'none',
            padding: CODE_PADDING,
            paddingRight: 10,
            paddingLeft: 14,
            borderRight: '1px solid rgba(255,255,255,0.05)',
            minWidth: 36,
            flexShrink: 0,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}
      <pre
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          margin: 0,
          padding: CODE_PADDING,
          paddingLeft: showLineNumbers ? 10 : 14,
          whiteSpace: 'pre',
          overflowX: 'hidden',
          flex: 1,
          color: '#c9d1d9',
        }}
      >
        {lines.map((line, idx) => (
          <div key={idx}>
            {tokenizeLine(line, language).map((tok, ti) => (
              <span key={ti} style={{ color: TOKEN_COLORS[tok.type] }}>
                {tok.text}
              </span>
            ))}
            {idx < lines.length - 1 && '\n'}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ── Icon buttons ─────────────────────────────────────────────────────────────

function IconGrip() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
      <circle cx="7.5" cy="4.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const ANCHOR_SIDES: { side: AnchorSide; sx: (w: number) => number; sy: (h: number) => number; ox: number; oy: number }[] = [
  { side: 'top',    sx: (w) => w / 2, sy: () => 0,    ox: 0,   oy: -28 },
  { side: 'bottom', sx: (w) => w / 2, sy: (h) => h,   ox: 0,   oy:  28 },
  { side: 'left',   sx: () => 0,      sy: (h) => h/2, ox: -28, oy: 0   },
  { side: 'right',  sx: (w) => w,     sy: (h) => h/2, ox:  28, oy: 0   },
];

interface Props {
  node: CodeBlockNode;
  isSelected: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
}

export default function CodeBlock({ node, isSelected, isDrawingLine, onAnchorDown, onAnchorEnter, onAnchorLeave, snapAnchor }: Props) {
  const { camera, updateNode, selectIds, activeTool } = useBoardStore();

  const dragRef = useRef<{ startMX: number; startMY: number; startNX: number; startNY: number } | null>(null);
  const resizeRef = useRef<{ startMX: number; startMY: number; startW: number; startH: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);

  const isLineTool = activeTool === 'line';
  const showAnchors = isSelected || isLineTool || isDrawingLine === true;

  // Global mouse handlers for drag/resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startMX) / camera.scale;
        const dy = (e.clientY - dragRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          x: dragRef.current.startNX + dx,
          y: dragRef.current.startNY + dy,
        } as Partial<CodeBlockNode>);
      }
      if (resizeRef.current) {
        const dx = (e.clientX - resizeRef.current.startMX) / camera.scale;
        const dy = (e.clientY - resizeRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          width: Math.max(MIN_WIDTH, resizeRef.current.startW + dx),
          height: Math.max(MIN_HEIGHT, resizeRef.current.startH + dy),
        } as Partial<CodeBlockNode>);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [camera.scale, node.id, updateNode]);

  const handleCardMouseDown = (e: React.MouseEvent) => {
    // Don't interfere with interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input')
    ) return;
    e.stopPropagation();
    if (useBoardStore.getState().activeTool !== 'pan') selectIds([node.id]);
  };

  const handleHeaderDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'SELECT' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input')
    ) return;
    e.stopPropagation();
    if (useBoardStore.getState().activeTool !== 'pan') selectIds([node.id]);
    dragRef.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      startNX: node.x,
      startNY: node.y,
    };
  };

  const screenX = camera.x + node.x * camera.scale;
  const screenY = camera.y + node.y * camera.scale;

  return (
    <>
    <div
      onMouseDown={handleCardMouseDown}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: node.width,
        transformOrigin: 'top left',
        transform: `scale(${camera.scale})`,
        borderRadius: 10,
        border: `1.5px solid ${isSelected ? 'var(--c-line)' : 'rgba(255,255,255,0.09)'}`,
        boxShadow: isSelected
          ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 32px rgba(0,0,0,0.55)'
          : '0 4px 24px rgba(0,0,0,0.5)',
        background: '#13131e',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: MIN_WIDTH,
        userSelect: 'none',
        zIndex: isSelected ? 10 : 5,
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        onMouseDown={handleHeaderDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          background: '#0d0d18',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        {/* Grip dots */}
        <span style={{ color: '#3a3a5a', flexShrink: 0, marginRight: 2 }}>
          <IconGrip />
        </span>

        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            value={node.title}
            onChange={(e) => updateNode(node.id, { title: e.target.value } as Partial<CodeBlockNode>)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontFamily: FONT_FAMILY,
              fontSize: 12,
              fontWeight: 500,
              color: '#c9d1d9',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(99,102,241,0.5)',
              borderRadius: 4,
              padding: '2px 6px',
              outline: 'none',
              minWidth: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={() => { selectIds([node.id]); setEditingTitle(true); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Double-click to rename"
            style={{
              flex: 1,
              fontFamily: FONT_FAMILY,
              fontSize: 12,
              fontWeight: 500,
              color: '#8888aa',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              cursor: 'text',
            }}
          >
            {node.title || 'Untitled'}
          </span>
        )}

      </div>

      {/* ── Code area ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#0c0c17',
          display: 'flex',
          height: node.height ?? 220,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Scrollable inner — line numbers + code scroll together */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {node.showLineNumbers && (
            <div
              aria-hidden
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                color: '#3a3a58',
                textAlign: 'right',
                userSelect: 'none',
                padding: CODE_PADDING,
                paddingRight: 10,
                borderRight: '1px solid rgba(255,255,255,0.05)',
                minWidth: 36,
                flexShrink: 0,
                pointerEvents: 'none',
              }}
            >
              {node.code.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}

          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            {/* Highlighted code — sits behind textarea */}
            <pre
              aria-hidden
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                margin: 0,
                padding: CODE_PADDING,
                whiteSpace: 'pre',
                color: '#c9d1d9',
                pointerEvents: 'none',
              }}
            >
              {node.code.split('\n').map((line, idx, arr) => (
                <div key={idx}>
                  {tokenizeLine(line, node.language).map((tok, ti) => (
                    <span key={ti} style={{ color: TOKEN_COLORS[tok.type] }}>{tok.text}</span>
                  ))}
                  {idx < arr.length - 1 && '\n'}
                </div>
              ))}
            </pre>

            {/* Textarea overlay — captures input, transparent text */}
            <textarea
              ref={textareaRef}
              value={node.code}
              onChange={(e) => {
                updateNode(node.id, { code: e.target.value } as Partial<CodeBlockNode>);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                selectIds([node.id]);
              }}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                padding: CODE_PADDING,
                margin: 0,
                background: 'transparent',
                color: 'transparent',
                caretColor: '#c9d1d9',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                whiteSpace: 'pre',
                tabSize: 2,
                zIndex: 2,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {(node.result || node.description) && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            background: '#0f0f1a',
            flexWrap: 'wrap',
          }}
        >
          {node.result && (
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 11,
                color: '#5a9e6f',
                fontStyle: 'italic',
                flexShrink: 0,
              }}
            >
              ▶ {node.result}
            </span>
          )}
          {node.description && (
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 11,
                color: '#5a5a7a',
              }}
            >
              <span style={{ color: '#3a3a5a', marginRight: 4 }}>What it does:</span>
              {node.description}
            </span>
          )}
        </div>
      )}

      {/* ── Resize handle (bottom-right) ────────────────────────────────────── */}
      <div
        title="Drag to resize"
        onMouseDown={(e) => {
          e.stopPropagation();
          resizeRef.current = {
            startMX: e.clientX,
            startMY: e.clientY,
            startW: node.width,
            startH: node.height,
          };
        }}
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 16,
          height: 16,
          zIndex: 20,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isSelected ? 'var(--c-line)' : '#3a3a5a',
          opacity: 0.8,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>

    {/* Anchor dots — positioned in screen space around the card */}
    {showAnchors && ANCHOR_SIDES.map(({ side, sx, sy, ox, oy }) => {
      const scale = camera.scale;
      const dotX = screenX + sx(node.width) * scale + ox * scale;
      const dotY = screenY + sy(node.height) * scale + oy * scale;
      const worldX = node.x + sx(node.width);
      const worldY = node.y + sy(node.height);
      const active = snapAnchor === side || hoveredAnchor === side;
      const DOT = active ? 9 : 6;
      return (
        <div
          key={side}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAnchorDown?.(node.id, side, worldX, worldY);
          }}
          onMouseEnter={() => { setHoveredAnchor(side); onAnchorEnter?.(node.id, side); }}
          onMouseLeave={() => { setHoveredAnchor(null); onAnchorLeave?.(); }}
          style={{
            position: 'absolute',
            left: dotX - DOT,
            top:  dotY - DOT,
            width:  DOT * 2,
            height: DOT * 2,
            borderRadius: '50%',
            background: active ? 'var(--c-line)' : '#ffffff',
            border: '2px solid var(--c-line)',
            boxShadow: active ? '0 0 10px rgba(99,102,241,0.7)' : 'none',
            cursor: 'crosshair',
            zIndex: 300,
            pointerEvents: 'auto',
            transition: 'width 0.1s, height 0.1s, left 0.1s, top 0.1s',
          }}
        />
      );
    })}
    </>
  );
}
