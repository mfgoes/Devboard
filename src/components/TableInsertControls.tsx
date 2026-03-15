import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { TableNode } from '../types';

const DEFAULT_COL_W = 120;
const DEFAULT_ROW_H = 36;

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

const BTN_SIZE = 22;
const BAR_GAP = 6;
const BAR_THICKNESS = 28;
const ACCENT = '#6366f1';
const ACCENT_HOVER = '#4f51c7';

export default function TableInsertControls({ nodeId }: { nodeId: string }) {
  const {
    nodes, camera, updateNode, saveHistory,
    setTableSelectionState, tableHoverDivider, tableHoverEdge,
  } = useBoardStore();

  const node = nodes.find(n => n.id === nodeId) as TableNode | undefined;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (patch: Partial<TableNode>) => updateNode(nodeId, patch as any);

  const addRowEnd = () => {
    saveHistory();
    const newCells = [...node.cells, Array(numCols).fill('')];
    const newRowHeights = [...node.rowHeights, DEFAULT_ROW_H];
    update({ cells: newCells, rowHeights: newRowHeights });
    setTableSelectionState({ nodeId, row: numRows, col: 0 });
  };

  const addColEnd = () => {
    saveHistory();
    const newCells = node.cells.map(row => [...row, '']);
    const newColWidths = [...node.colWidths, DEFAULT_COL_W];
    update({ cells: newCells, colWidths: newColWidths });
    setTableSelectionState({ nodeId, row: 0, col: numCols });
  };

  const insertRowAfter = (i: number) => {
    saveHistory();
    const insertIdx = i + 1;
    const newCells = [...node.cells];
    newCells.splice(insertIdx, 0, Array(numCols).fill(''));
    const newRowHeights = [...node.rowHeights];
    newRowHeights.splice(insertIdx, 0, DEFAULT_ROW_H);
    update({ cells: newCells, rowHeights: newRowHeights });
    setTableSelectionState({ nodeId, row: insertIdx, col: 0 });
  };

  const insertColAfter = (i: number) => {
    saveHistory();
    const insertIdx = i + 1;
    const newCells = node.cells.map(row => {
      const r = [...row];
      r.splice(insertIdx, 0, '');
      return r;
    });
    const newColWidths = [...node.colWidths];
    newColWidths.splice(insertIdx, 0, DEFAULT_COL_W);
    update({ cells: newCells, colWidths: newColWidths });
    setTableSelectionState({ nodeId, row: 0, col: insertIdx });
  };

  const hoveredKind = tableHoverDivider?.nodeId === nodeId ? tableHoverDivider.kind : null;
  const hoveredIdx = tableHoverDivider?.nodeId === nodeId ? tableHoverDivider.idx : null;

  const edgeForNode = tableHoverEdge?.nodeId === nodeId ? tableHoverEdge : null;

  // Debounced visibility — keeps bars alive while mouse travels from table to bar
  const [showBottom, setShowBottom] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const hideBottomRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRightRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (edgeForNode?.showBottom) {
      if (hideBottomRef.current) { clearTimeout(hideBottomRef.current); hideBottomRef.current = null; }
      setShowBottom(true);
    } else {
      hideBottomRef.current = setTimeout(() => setShowBottom(false), 250);
    }
    return () => { if (hideBottomRef.current) clearTimeout(hideBottomRef.current); };
  }, [edgeForNode?.showBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (edgeForNode?.showRight) {
      if (hideRightRef.current) { clearTimeout(hideRightRef.current); hideRightRef.current = null; }
      setShowRight(true);
    } else {
      hideRightRef.current = setTimeout(() => setShowRight(false), 250);
    }
    return () => { if (hideRightRef.current) clearTimeout(hideRightRef.current); };
  }, [edgeForNode?.showRight]); // eslint-disable-line react-hooks/exhaustive-deps

  const keepBottom = () => { if (hideBottomRef.current) { clearTimeout(hideBottomRef.current); hideBottomRef.current = null; } };
  const keepRight = () => { if (hideRightRef.current) { clearTimeout(hideRightRef.current); hideRightRef.current = null; } };

  const circleStyle: React.CSSProperties = {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: '50%',
    background: ACCENT,
    border: '2px solid white',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 400,
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    userSelect: 'none',
    pointerEvents: 'auto',
    flexShrink: 0,
    transition: 'background 0.1s',
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 210 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Add Row bar at bottom — only when hovering last row */}
      {showBottom && (
        <div
          title="Add row"
          style={{
            position: 'absolute',
            left: sx,
            top: sy + sh + BAR_GAP,
            width: sw,
            height: BAR_THICKNESS,
            pointerEvents: 'auto',
            cursor: 'pointer',
            borderRadius: 6,
            background: ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 20,
            fontWeight: 300,
            userSelect: 'none',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { keepBottom(); (e.currentTarget as HTMLDivElement).style.background = ACCENT_HOVER; }}
          onMouseLeave={(e) => { hideBottomRef.current = setTimeout(() => setShowBottom(false), 250); (e.currentTarget as HTMLDivElement).style.background = ACCENT; }}
          onClick={addRowEnd}
          onMouseDown={(e) => e.stopPropagation()}
        >
          +
        </div>
      )}

      {/* Add Column bar at right — only when hovering last column */}
      {showRight && (
        <div
          title="Add column"
          style={{
            position: 'absolute',
            left: sx + sw + BAR_GAP,
            top: sy,
            width: BAR_THICKNESS,
            height: sh,
            pointerEvents: 'auto',
            cursor: 'pointer',
            borderRadius: 6,
            background: ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 20,
            fontWeight: 300,
            userSelect: 'none',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { keepRight(); (e.currentTarget as HTMLDivElement).style.background = ACCENT_HOVER; }}
          onMouseLeave={(e) => { hideRightRef.current = setTimeout(() => setShowRight(false), 250); (e.currentTarget as HTMLDivElement).style.background = ACCENT; }}
          onClick={addColEnd}
          onMouseDown={(e) => e.stopPropagation()}
        >
          +
        </div>
      )}

      {/* Column divider: highlight line + circular "+" above table */}
      {hoveredKind === 'col' && hoveredIdx !== null && (
        <>
          <div
            style={{
              position: 'absolute',
              left: sx + colX[hoveredIdx + 1] * sc - 1,
              top: sy,
              width: 2,
              height: sh,
              background: ACCENT,
              opacity: 0.6,
              pointerEvents: 'none',
              borderRadius: 1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: sx + colX[hoveredIdx + 1] * sc - BTN_SIZE / 2,
              top: sy - BTN_SIZE - 6,
              ...circleStyle,
            }}
            title="Insert column here"
            onClick={(e) => { e.stopPropagation(); insertColAfter(hoveredIdx); }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = ACCENT_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ACCENT; }}
          >
            +
          </div>
        </>
      )}

      {/* Row divider: highlight line + circular "+" left of table */}
      {hoveredKind === 'row' && hoveredIdx !== null && (
        <>
          <div
            style={{
              position: 'absolute',
              left: sx,
              top: sy + rowY[hoveredIdx + 1] * sc - 1,
              width: sw,
              height: 2,
              background: ACCENT,
              opacity: 0.6,
              pointerEvents: 'none',
              borderRadius: 1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: sx - BTN_SIZE - 6,
              top: sy + rowY[hoveredIdx + 1] * sc - BTN_SIZE / 2,
              ...circleStyle,
            }}
            title="Insert row here"
            onClick={(e) => { e.stopPropagation(); insertRowAfter(hoveredIdx); }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = ACCENT_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ACCENT; }}
          >
            +
          </div>
        </>
      )}
    </div>
  );
}
