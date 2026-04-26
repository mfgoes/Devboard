import { useBoardStore } from '../store/boardStore';
import { useTheme } from '../theme';
import type { TextDraw, ShapeDraw, MarqueeDraw } from '../hooks/useCanvasInteraction';

interface Props {
  textCursorPos: { x: number; y: number } | null;
  textDraw: TextDraw | null;
  shapeDraw: ShapeDraw | null;
  sectionDraw: ShapeDraw | null;
  tableDraw: ShapeDraw | null;
  stickerCursorPos: { x: number; y: number } | null;
  taskCursorPos: { x: number; y: number } | null;
  documentCursorPos: { x: number; y: number } | null;
  marqueeDraw: MarqueeDraw | null;
}

export default function CanvasToolPreviews({
  textCursorPos, textDraw, shapeDraw, sectionDraw, tableDraw,
  stickerCursorPos, taskCursorPos, documentCursorPos, marqueeDraw,
}: Props) {
  const t             = useTheme();
  const activeTool    = useBoardStore((s) => s.activeTool);
  const activeShapeKind = useBoardStore((s) => s.activeShapeKind);
  const activeSticker   = useBoardStore((s) => s.activeSticker);
  const camera          = useBoardStore((s) => s.camera);

  const ghostFontSize = Math.round(20 * camera.scale);
  const ghostWidth    = Math.round(240 * camera.scale);
  const ghostLineH    = Math.round(ghostFontSize * 1.5);

  return (
    <>
      {/* Text ghost: hover preview before clicking */}
      {activeTool === 'text' && textCursorPos && !textDraw && (
        <div
          style={{
            position: 'absolute',
            left: textCursorPos.x + 10,
            top: textCursorPos.y - ghostLineH / 2,
            width: ghostWidth,
            height: ghostLineH,
            border: `1px dashed ${t.connectorColor}`,
            borderRadius: 3,
            pointerEvents: 'none',
            opacity: 0.55,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 4,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: ghostFontSize,
              color: t.textOff,
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            Type something…
          </span>
        </div>
      )}

      {/* Text drag-to-width preview */}
      {activeTool === 'text' && textDraw && (
        <>
          <div
            style={{
              position: 'absolute',
              left: Math.min(textDraw.startScreenX, textDraw.currentScreenX),
              top: textDraw.startScreenY - ghostLineH / 2,
              width: Math.max(2, Math.abs(textDraw.currentScreenX - textDraw.startScreenX)),
              height: ghostLineH,
              border: `1px dashed ${t.connectorColor}`,
              borderRadius: 3,
              background: 'rgba(99,102,241,0.06)',
              pointerEvents: 'none',
            }}
          />
          {Math.abs(textDraw.currentScreenX - textDraw.startScreenX) > 40 && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(textDraw.startScreenX, textDraw.currentScreenX),
                top: textDraw.startScreenY + ghostLineH / 2 + 6,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: t.connectorColor,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(Math.abs(textDraw.currentWorldX - textDraw.startWorldX))}px
            </div>
          )}
        </>
      )}

      {/* Shape drag-to-size preview */}
      {activeTool === 'shape' && shapeDraw && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(shapeDraw.startScreenX, shapeDraw.currentScreenX),
            top: Math.min(shapeDraw.startScreenY, shapeDraw.currentScreenY),
            width: Math.max(2, Math.abs(shapeDraw.currentScreenX - shapeDraw.startScreenX)),
            height: Math.max(2, Math.abs(shapeDraw.currentScreenY - shapeDraw.startScreenY)),
            border: `1.5px dashed ${t.connectorColor}`,
            borderRadius: activeShapeKind === 'rect' ? 4 : activeShapeKind === 'ellipse' ? '50%' : 2,
            background: 'rgba(99,102,241,0.08)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Section drag-to-size preview */}
      {activeTool === 'section' && sectionDraw && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(sectionDraw.startScreenX, sectionDraw.currentScreenX),
            top: Math.min(sectionDraw.startScreenY, sectionDraw.currentScreenY),
            width: Math.max(2, Math.abs(sectionDraw.currentScreenX - sectionDraw.startScreenX)),
            height: Math.max(2, Math.abs(sectionDraw.currentScreenY - sectionDraw.startScreenY)),
            border: `1.5px dashed ${t.connectorColor}`,
            borderRadius: 12,
            background: 'rgba(99,102,241,0.06)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Table drag-to-size preview */}
      {activeTool === 'table' && tableDraw && (() => {
        const pdW = Math.abs(tableDraw.currentScreenX - tableDraw.startScreenX);
        const pdH = Math.abs(tableDraw.currentScreenY - tableDraw.startScreenY);
        const pIsDrag = pdW > 8 || pdH > 8;
        const pwW = Math.abs(tableDraw.currentWorldX - tableDraw.startWorldX);
        const pwH = Math.abs(tableDraw.currentWorldY - tableDraw.startWorldY);
        const pCols = pIsDrag ? Math.max(1, Math.round(pwW / 120)) : 3;
        const pRows = pIsDrag ? Math.max(1, Math.round(pwH / 36)) : 3;
        const colPct = 100 / pCols;
        const rowPct = 100 / pRows;
        return (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tableDraw.startScreenX, tableDraw.currentScreenX),
              top: Math.min(tableDraw.startScreenY, tableDraw.currentScreenY),
              width: Math.max(2, pdW),
              height: Math.max(2, pdH),
              border: `1.5px dashed ${t.connectorColor}`,
              borderRadius: 2,
              background: 'rgba(99,102,241,0.07)',
              pointerEvents: 'none',
              backgroundImage: [
                `repeating-linear-gradient(to right, ${t.connectorColor}55 0, ${t.connectorColor}55 1px, transparent 1px, transparent ${colPct}%)`,
                `repeating-linear-gradient(to bottom, ${t.connectorColor}55 0, ${t.connectorColor}55 1px, transparent 1px, transparent ${rowPct}%)`,
              ].join(', '),
            }}
          />
        );
      })()}

      {/* Sticker hover placeholder */}
      {activeTool === 'sticker' && stickerCursorPos && (
        <img
          src={activeSticker}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: stickerCursorPos.x - (50 * camera.scale) / 2,
            top: stickerCursorPos.y - (50 * camera.scale) / 2,
            width: 100 * camera.scale,
            height: 100 * camera.scale,
            opacity: 0.6,
            pointerEvents: 'none',
            objectFit: 'contain',
          }}
        />
      )}

      {/* Task card placement ghost */}
      {activeTool === 'task' && taskCursorPos && (() => {
        const W = 280 * camera.scale;
        const left = taskCursorPos.x - W / 2;
        const top  = taskCursorPos.y - 20 * camera.scale;
        const fs   = 13 * camera.scale;
        const dotS = 10 * camera.scale;
        const pad  = 12 * camera.scale;
        const accent = 'var(--c-line)';
        return (
          <div
            style={{
              position: 'absolute', left, top, width: W,
              pointerEvents: 'none', opacity: 0.55, borderRadius: 12,
              border: `2px solid ${accent}`, background: 'var(--c-panel)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.18)', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: pad * 0.6, padding: `${pad * 0.8}px ${pad}px`, borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ width: dotS, height: dotS, borderRadius: '50%', background: accent, flexShrink: 0 }} />
              <span style={{ color: 'var(--c-text-hi)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: fs, flex: 1 }}>
                New Task Card
              </span>
            </div>
            <div style={{ padding: `${pad * 0.5}px ${pad}px ${pad * 0.8}px`, display: 'flex', alignItems: 'center', gap: pad * 0.5 }}>
              <span style={{ color: 'var(--c-text-lo)', fontSize: fs * 0.9, fontFamily: "'JetBrains Mono', monospace" }}>+</span>
              <span style={{ color: 'var(--c-text-lo)', fontSize: fs * 0.9, fontFamily: "'JetBrains Mono', monospace" }}>Add task…</span>
            </div>
          </div>
        );
      })()}

      {/* Document placement ghost */}
      {activeTool === 'document' && documentCursorPos && (() => {
        const W = 280 * camera.scale;
        const H = 176 * camera.scale;
        const left = documentCursorPos.x - W / 2;
        const top  = documentCursorPos.y - H / 2;
        return (
          <div
            style={{
              position: 'absolute', left, top, width: W, height: H,
              pointerEvents: 'none', opacity: 0.4, borderRadius: 10,
              border: `2px solid var(--c-line)`, background: 'var(--c-panel)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            }}
          />
        );
      })()}

      {/* Marquee selection rect */}
      {marqueeDraw && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(marqueeDraw.startScreenX, marqueeDraw.currentScreenX),
            top:  Math.min(marqueeDraw.startScreenY, marqueeDraw.currentScreenY),
            width:  Math.max(1, Math.abs(marqueeDraw.currentScreenX - marqueeDraw.startScreenX)),
            height: Math.max(1, Math.abs(marqueeDraw.currentScreenY - marqueeDraw.startScreenY)),
            border: `1px dashed ${t.connectorColor}`,
            borderRadius: 2,
            background: 'rgba(99,102,241,0.07)',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
