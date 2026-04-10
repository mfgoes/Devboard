import { useBoardStore } from '../store/boardStore';
import { TableNode } from '../types';
import { useToolbarPosition } from '../utils/useToolbarPosition';

const DEFAULT_COL_W = 120;
const DEFAULT_ROW_H = 36;

function IconAddRowAbove() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="6" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="9.5" x2="13" y2="9.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="7" y1="1" x2="7" y2="5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="3" x2="9.5" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconAddRowBelow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="4.5" x2="13" y2="4.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="7" y1="9" x2="7" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="11" x2="9.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconDeleteRow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="4" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.1" />
      <line x1="5" y1="5.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="9" y1="5.5" x2="5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconAddColLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="6" y="1" width="7" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.5" y1="1" x2="9.5" y2="13" stroke="currentColor" strokeWidth="1.1" />
      <line x1="1" y1="7" x2="5" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="3" y1="4.5" x2="3" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconAddColRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="7" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4.5" y1="1" x2="4.5" y2="13" stroke="currentColor" strokeWidth="1.1" />
      <line x1="9" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="4.5" x2="11" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconDeleteCol() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4" y="1" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.1" />
      <line x1="5.5" y1="5" x2="8.5" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8.5" y1="5" x2="5.5" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconAutoFit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="1" y1="2" x2="1" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="13" y1="2" x2="13" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4 5L1 7L4 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 5L13 7L10 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const MIN_COL_W = 40;
const CELL_PADDING = 20; // 6px each side + 8 buffer

function measureTextWidth(text: string, fontSize: number, bold: boolean): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error();
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px 'JetBrains Mono', 'Fira Code', monospace`;
    return ctx.measureText(text).width;
  } catch {
    return text.length * fontSize * 0.62;
  }
}

export default function TableToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, camera, updateNode, saveHistory, tableSelectionState, setTableSelectionState } = useBoardStore();
  const node = nodes.find(n => n.id === nodeId) as TableNode | undefined;

  const totalW = node ? node.colWidths.reduce((a, b) => a + b, 0) : 0;
  const totalH = node ? node.rowHeights.reduce((a, b) => a + b, 0) : 0;
  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = totalW * camera.scale;
  const sh = totalH * camera.scale;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: sy - 52,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  const numRows = node.rowHeights.length;
  const numCols = node.colWidths.length;

  // Focused row/col from selection state (fallback: last row/col)
  const focusRow = tableSelectionState?.nodeId === nodeId ? tableSelectionState.row : numRows - 1;
  const focusCol = tableSelectionState?.nodeId === nodeId ? tableSelectionState.col : numCols - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (patch: Partial<TableNode>) => updateNode(nodeId, patch as any);

  const addRowAbove = () => {
    saveHistory();
    const insertIdx = focusRow;
    const newCells = [...node.cells];
    newCells.splice(insertIdx, 0, Array(numCols).fill(''));
    const newRowHeights = [...node.rowHeights];
    newRowHeights.splice(insertIdx, 0, DEFAULT_ROW_H);
    update({ cells: newCells, rowHeights: newRowHeights });
    setTableSelectionState({ nodeId, row: insertIdx, col: focusCol });
  };

  const addRowBelow = () => {
    saveHistory();
    const insertIdx = focusRow + 1;
    const newCells = [...node.cells];
    newCells.splice(insertIdx, 0, Array(numCols).fill(''));
    const newRowHeights = [...node.rowHeights];
    newRowHeights.splice(insertIdx, 0, DEFAULT_ROW_H);
    update({ cells: newCells, rowHeights: newRowHeights });
    setTableSelectionState({ nodeId, row: insertIdx, col: focusCol });
  };

  const deleteRow = () => {
    if (numRows <= 1) return;
    saveHistory();
    const newCells = node.cells.filter((_, i) => i !== focusRow);
    const newRowHeights = node.rowHeights.filter((_, i) => i !== focusRow);
    update({ cells: newCells, rowHeights: newRowHeights });
    const newRow = Math.min(focusRow, newRowHeights.length - 1);
    setTableSelectionState({ nodeId, row: newRow, col: focusCol });
  };

  const addColLeft = () => {
    saveHistory();
    const insertIdx = focusCol;
    const newCells = node.cells.map(row => {
      const r = [...row];
      r.splice(insertIdx, 0, '');
      return r;
    });
    const newColWidths = [...node.colWidths];
    newColWidths.splice(insertIdx, 0, DEFAULT_COL_W);
    update({ cells: newCells, colWidths: newColWidths });
    setTableSelectionState({ nodeId, row: focusRow, col: insertIdx });
  };

  const addColRight = () => {
    saveHistory();
    const insertIdx = focusCol + 1;
    const newCells = node.cells.map(row => {
      const r = [...row];
      r.splice(insertIdx, 0, '');
      return r;
    });
    const newColWidths = [...node.colWidths];
    newColWidths.splice(insertIdx, 0, DEFAULT_COL_W);
    update({ cells: newCells, colWidths: newColWidths });
    setTableSelectionState({ nodeId, row: focusRow, col: insertIdx });
  };

  const deleteCol = () => {
    if (numCols <= 1) return;
    saveHistory();
    const newCells = node.cells.map(row => row.filter((_, i) => i !== focusCol));
    const newColWidths = node.colWidths.filter((_, i) => i !== focusCol);
    update({ cells: newCells, colWidths: newColWidths });
    const newCol = Math.min(focusCol, newColWidths.length - 1);
    setTableSelectionState({ nodeId, row: focusRow, col: newCol });
  };

  const autoFitColumns = () => {
    saveHistory();
    const newColWidths = node.colWidths.map((_, colIdx) => {
      let maxW = 0;
      for (let r = 0; r < numRows; r++) {
        const text = node.cells[r]?.[colIdx] ?? '';
        if (!text) continue;
        const bold = !!(node.headerRow && r === 0);
        const w = measureTextWidth(text, node.fontSize, bold);
        if (w > maxW) maxW = w;
      }
      return Math.max(MIN_COL_W, maxW + CELL_PADDING);
    });
    update({ colWidths: newColWidths });
  };

  const btnClass = [
    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
    'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
  ].join(' ');

  const dangerClass = [
    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
    'text-[var(--c-text-lo)] hover:text-red-400 hover:bg-[var(--c-hover)]',
  ].join(' ');

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-0.5 px-2 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Row operations */}
      <button className={btnClass} title="Add row above (selected row)" onClick={addRowAbove}>
        <IconAddRowAbove />
      </button>
      <button className={btnClass} title="Add row below (selected row)" onClick={addRowBelow}>
        <IconAddRowBelow />
      </button>
      <button className={dangerClass} title="Delete row" onClick={deleteRow} disabled={numRows <= 1}>
        <IconDeleteRow />
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--c-border)] mx-1" />

      {/* Column operations */}
      <button className={btnClass} title="Add column left (selected column)" onClick={addColLeft}>
        <IconAddColLeft />
      </button>
      <button className={btnClass} title="Add column right (selected column)" onClick={addColRight}>
        <IconAddColRight />
      </button>
      <button className={dangerClass} title="Delete column" onClick={deleteCol} disabled={numCols <= 1}>
        <IconDeleteCol />
      </button>
      <button className={btnClass} title="Auto-fit all columns to content" onClick={autoFitColumns}>
        <IconAutoFit />
      </button>

      {/* Context label: shows selected cell */}
      {tableSelectionState?.nodeId === nodeId && (
        <>
          <div className="w-px h-5 bg-[var(--c-border)] mx-1" />
          <span className="text-[10px] font-mono text-[var(--c-text-off)] px-1 whitespace-nowrap">
            R{focusRow + 1} C{focusCol + 1}
          </span>
        </>
      )}
    </div>
  );
}
