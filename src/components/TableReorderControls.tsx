import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { TableNode } from '../types';

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#000000';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#1a1a2e' : '#ffffff';
}

function computeColX(colWidths: number[]): number[] {
  const result: number[] = [];
  let acc = 0;
  for (const w of colWidths) { result.push(acc); acc += w; }
  return result;
}

function computeRowY(rowHeights: number[]): number[] {
  const result: number[] = [];
  let acc = 0;
  for (const h of rowHeights) { result.push(acc); acc += h; }
  return result;
}

const HANDLE_SIZE = 20;
const HANDLE_GAP = 6;
const ACCENT = 'var(--c-line)';

type DragState = {
  kind: 'row' | 'col';
  fromIdx: number;
  mouseX: number;   // canvas-relative px
  mouseY: number;   // canvas-relative px
  dropGap: number;  // 0..numRows or 0..numCols (gap index)
  canvasLeft: number;
  canvasTop: number;
};

function getCanvasRect(): { left: number; top: number } {
  return (document.querySelector('.konvajs-content') as HTMLElement | null)
    ?.getBoundingClientRect() ?? { left: 0, top: 0 };
}

function DragHandleIcon({ vertical }: { vertical?: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      {vertical ? (
        <>
          <line x1="2" y1="3" x2="8" y2="3" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="2" y1="5" x2="8" y2="5" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="2" y1="7" x2="8" y2="7" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="3" y1="2" x2="3" y2="8" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="5" y1="2" x2="5" y2="8" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="7" y1="2" x2="7" y2="8" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default function TableReorderControls({ nodeId }: { nodeId: string }) {
  const { nodes, camera, updateNode, saveHistory, tableHoverCell } = useBoardStore();

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null); // always holds latest drag for stale-closure safety
  const [hovRow, setHovRow] = useState<number | null>(null);
  const [hovCol, setHovCol] = useState<number | null>(null);
  const hideRowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideColRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const node = nodes.find(n => n.id === nodeId) as TableNode | undefined;

  // Debounced hover visibility (same pattern as TableInsertControls)
  useEffect(() => {
    const cell = tableHoverCell?.nodeId === nodeId ? tableHoverCell : null;
    if (cell) {
      if (hideRowRef.current) { clearTimeout(hideRowRef.current); hideRowRef.current = null; }
      if (hideColRef.current) { clearTimeout(hideColRef.current); hideColRef.current = null; }
      setHovRow(cell.row);
      setHovCol(cell.col);
    } else if (!drag) {
      hideRowRef.current = setTimeout(() => setHovRow(null), 150);
      hideColRef.current = setTimeout(() => setHovCol(null), 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableHoverCell, nodeId]);

  // Keep dragRef in sync so onUp/onMove can read the latest dropGap without stale closures
  useEffect(() => { dragRef.current = drag; }, [drag]);

  // Window drag tracking — registered once per drag session
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const cam = useBoardStore.getState().camera;
      const n = useBoardStore.getState().nodes.find(n => n.id === nodeId) as TableNode | undefined;
      if (!n) return;

      const localY = (e.clientY - d.canvasTop - cam.y) / cam.scale - n.y;
      const localX = (e.clientX - d.canvasLeft - cam.x) / cam.scale - n.x;

      const rY = computeRowY(n.rowHeights);
      const cX = computeColX(n.colWidths);

      let dropGap: number;
      if (d.kind === 'row') {
        dropGap = n.rowHeights.length;
        for (let r = 0; r < n.rowHeights.length; r++) {
          if (localY < rY[r] + n.rowHeights[r] / 2) { dropGap = r; break; }
        }
      } else {
        dropGap = n.colWidths.length;
        for (let c = 0; c < n.colWidths.length; c++) {
          if (localX < cX[c] + n.colWidths[c] / 2) { dropGap = c; break; }
        }
      }

      setDrag(prev => prev ? {
        ...prev,
        mouseX: e.clientX - d.canvasLeft,
        mouseY: e.clientY - d.canvasTop,
        dropGap,
      } : null);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d) { setDrag(null); return; }
      const n = useBoardStore.getState().nodes.find(n => n.id === nodeId) as TableNode | undefined;
      if (n && d.dropGap !== d.fromIdx && d.dropGap !== d.fromIdx + 1) {
        saveHistory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update = (patch: Partial<TableNode>) => updateNode(nodeId, patch as any);

        if (d.kind === 'row') {
          const newCells = [...n.cells];
          const newRowHeights = [...n.rowHeights];
          const removedCells = newCells.splice(d.fromIdx, 1)[0];
          const removedHeight = newRowHeights.splice(d.fromIdx, 1)[0];
          const insertAt = d.dropGap > d.fromIdx ? d.dropGap - 1 : d.dropGap;
          newCells.splice(insertAt, 0, removedCells);
          newRowHeights.splice(insertAt, 0, removedHeight);
          update({ cells: newCells, rowHeights: newRowHeights });
        } else {
          const newCells = n.cells.map(row => [...row]);
          const newColWidths = [...n.colWidths];
          const removedCol = newCells.map(row => row.splice(d.fromIdx, 1)[0]);
          const removedWidth = newColWidths.splice(d.fromIdx, 1)[0];
          const insertAt = d.dropGap > d.fromIdx ? d.dropGap - 1 : d.dropGap;
          newCells.forEach((row, r) => row.splice(insertAt, 0, removedCol[r]));
          newColWidths.splice(insertAt, 0, removedWidth);
          update({ cells: newCells, colWidths: newColWidths });
        }
      }
      document.body.style.cursor = '';
      setDrag(null);
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]); // run only when drag starts/ends — reads live state via dragRef

  if (!node) return null;

  const numCols = node.colWidths.length;
  const numRows = node.rowHeights.length;
  const colX = computeColX(node.colWidths);
  const rowY = computeRowY(node.rowHeights);
  const totalW = node.colWidths.reduce((a, b) => a + b, 0);
  const totalH = node.rowHeights.reduce((a, b) => a + b, 0);

  const sc = camera.scale;
  const sx = node.x * sc + camera.x;
  const sy = node.y * sc + camera.y;
  const sw = totalW * sc;
  const sh = totalH * sc;

  const keepRow = () => { if (hideRowRef.current) { clearTimeout(hideRowRef.current); hideRowRef.current = null; } };
  const keepCol = () => { if (hideColRef.current) { clearTimeout(hideColRef.current); hideColRef.current = null; } };

  const startRowDrag = (rowIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cr = getCanvasRect();
    setDrag({
      kind: 'row',
      fromIdx: rowIdx,
      mouseX: e.clientX - cr.left,
      mouseY: e.clientY - cr.top,
      dropGap: rowIdx,
      canvasLeft: cr.left,
      canvasTop: cr.top,
    });
  };

  const startColDrag = (colIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cr = getCanvasRect();
    setDrag({
      kind: 'col',
      fromIdx: colIdx,
      mouseX: e.clientX - cr.left,
      mouseY: e.clientY - cr.top,
      dropGap: colIdx,
      canvasLeft: cr.left,
      canvasTop: cr.top,
    });
  };

  // Drop indicator position
  const dropIndicator = drag ? (() => {
    if (drag.kind === 'row') {
      const gapY = drag.dropGap < numRows ? rowY[drag.dropGap] : totalH;
      return {
        position: 'absolute' as const,
        left: sx,
        top: sy + gapY * sc - 1.5,
        width: sw,
        height: 3,
        background: ACCENT,
        borderRadius: 2,
        pointerEvents: 'none' as const,
        zIndex: 220,
        boxShadow: `0 0 0 1px ${ACCENT}33`,
      };
    } else {
      const gapX = drag.dropGap < numCols ? colX[drag.dropGap] : totalW;
      return {
        position: 'absolute' as const,
        left: sx + gapX * sc - 1.5,
        top: sy,
        width: 3,
        height: sh,
        background: ACCENT,
        borderRadius: 2,
        pointerEvents: 'none' as const,
        zIndex: 220,
        boxShadow: `0 0 0 1px ${ACCENT}33`,
      };
    }
  })() : null;

  // Preview of dragged row/col
  const dragPreview = drag ? (() => {
    if (drag.kind === 'row' && drag.fromIdx < numRows) {
      const rowH = node.rowHeights[drag.fromIdx] * sc;
      const isHeader = !!(node.headerRow && drag.fromIdx === 0);
      return (
        <div style={{
          position: 'absolute',
          left: sx,
          top: drag.mouseY - rowH / 2,
          width: sw,
          height: rowH,
          border: `2px solid ${ACCENT}`,
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 250,
          display: 'flex',
          overflow: 'hidden',
          opacity: 0.82,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {node.colWidths.map((cw, c) => (
            <div key={c} style={{
              width: cw * sc,
              flexShrink: 0,
              padding: `0 ${6 * sc}px`,
              display: 'flex',
              alignItems: 'center',
              background: isHeader ? node.headerFill : node.fill,
              fontSize: node.fontSize * sc,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontWeight: isHeader ? 'bold' : 'normal',
              color: contrastText(isHeader ? node.headerFill : node.fill),
              borderRight: c < numCols - 1 ? `1px solid ${node.stroke}` : 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}>
              {node.cells[drag.fromIdx]?.[c] ?? ''}
            </div>
          ))}
        </div>
      );
    } else if (drag.kind === 'col' && drag.fromIdx < numCols) {
      const colW = node.colWidths[drag.fromIdx] * sc;
      return (
        <div style={{
          position: 'absolute',
          left: drag.mouseX - colW / 2,
          top: sy,
          width: colW,
          height: sh,
          border: `2px solid ${ACCENT}`,
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 250,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: 0.82,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {node.rowHeights.map((rh, r) => {
            const isHeader = !!(node.headerRow && r === 0);
            return (
              <div key={r} style={{
                height: rh * sc,
                flexShrink: 0,
                padding: `0 ${6 * sc}px`,
                display: 'flex',
                alignItems: 'center',
                background: isHeader ? node.headerFill : node.fill,
                fontSize: node.fontSize * sc,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontWeight: isHeader ? 'bold' : 'normal',
                color: contrastText(isHeader ? node.headerFill : node.fill),
                borderBottom: r < numRows - 1 ? `1px solid ${node.stroke}` : 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}>
                {node.cells[r]?.[drag.fromIdx] ?? ''}
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  })() : null;

  const handleBase: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: 6,
    background: ACCENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    pointerEvents: 'auto',
    userSelect: 'none',
    boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
    transition: 'transform 0.1s',
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 215 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Row drag handle — left of hovered row */}
      {hovRow !== null && hovRow < numRows && !drag && (
        <div
          title="Drag to reorder row"
          style={{
            ...handleBase,
            left: sx - HANDLE_SIZE - HANDLE_GAP,
            top: sy + (rowY[hovRow] + node.rowHeights[hovRow] / 2) * sc - HANDLE_SIZE / 2,
          }}
          onMouseEnter={keepRow}
          onMouseLeave={() => { if (!drag) setHovRow(null); }}
          onMouseDown={(e) => startRowDrag(hovRow, e)}
        >
          <DragHandleIcon vertical />
        </div>
      )}

      {/* Col drag handle — above hovered col */}
      {hovCol !== null && hovCol < numCols && !drag && (
        <div
          title="Drag to reorder column"
          style={{
            ...handleBase,
            left: sx + (colX[hovCol] + node.colWidths[hovCol] / 2) * sc - HANDLE_SIZE / 2,
            top: sy - HANDLE_SIZE - HANDLE_GAP,
          }}
          onMouseEnter={keepCol}
          onMouseLeave={() => { if (!drag) setHovCol(null); }}
          onMouseDown={(e) => startColDrag(hovCol, e)}
        >
          <DragHandleIcon />
        </div>
      )}

      {/* Drop indicator line */}
      {dropIndicator && <div style={dropIndicator} />}

      {/* Drag preview */}
      {dragPreview}
    </div>
  );
}
