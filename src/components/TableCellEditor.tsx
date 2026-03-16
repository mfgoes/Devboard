import { useEffect, useRef } from 'react';
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

export default function TableCellEditor() {
  const { nodes, camera, tableEditState, setTableEditState, setTableSelectionState, updateNode, saveHistory } = useBoardStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const node = tableEditState
    ? (nodes.find(n => n.id === tableEditState.nodeId && n.type === 'table') as TableNode | undefined)
    : undefined;

  // Focus on mount / cell change
  useEffect(() => {
    if (!node || !tableEditState) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [tableEditState?.nodeId, tableEditState?.row, tableEditState?.col]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node || !tableEditState) return null;

  const { row, col } = tableEditState;
  const numRows = node.rowHeights.length;
  const numCols = node.colWidths.length;

  const colX = computeColX(node.colWidths);
  const rowY = computeRowY(node.rowHeights);

  const screenX = (node.x + colX[col]) * camera.scale + camera.x;
  const screenY = (node.y + rowY[row]) * camera.scale + camera.y;
  const screenW = node.colWidths[col] * camera.scale;
  const screenH = node.rowHeights[row] * camera.scale;

  const currentText = node.cells[row]?.[col] ?? '';
  const isHeader = node.headerRow && row === 0;
  const fs = Math.round(node.fontSize * camera.scale);

  const commit = (text: string) => {
    const newCells = node.cells.map(r => [...r]);
    if (!newCells[row]) newCells[row] = Array(numCols).fill('');
    newCells[row][col] = text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateNode(node.id, { cells: newCells } as any);
  };

  const moveTo = (newRow: number, newCol: number) => {
    if (newRow < 0 || newRow >= numRows || newCol < 0 || newCol >= numCols) {
      setTableEditState(null);
      return;
    }
    setTableEditState({ nodeId: node.id, row: newRow, col: newCol });
    setTableSelectionState({ nodeId: node.id, row: newRow, col: newCol });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setTableEditState(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        moveTo(col > 0 ? row : row - 1, col > 0 ? col - 1 : numCols - 1);
      } else {
        moveTo(col < numCols - 1 ? row : row + 1, col < numCols - 1 ? col + 1 : 0);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      moveTo(row + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveTo(row - 1, col);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveTo(row + 1, col);
    }
  };

  return (
    <input
      ref={inputRef}
      value={currentText}
      onChange={(e) => commit(e.target.value)}
      onFocus={saveHistory}
      onBlur={() => setTimeout(() => {
        if (document.activeElement !== inputRef.current) setTableEditState(null);
      }, 150)}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: screenX + 5 * camera.scale,
        top: screenY,
        width: screenW - 10 * camera.scale,
        height: screenH,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: fs,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontWeight: isHeader ? 'bold' : 'normal',
        color: contrastText(isHeader ? node.headerFill : node.fill),
        caretColor: contrastText(isHeader ? node.headerFill : node.fill),
        padding: 0,
        zIndex: 200,
        verticalAlign: 'middle',
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        lineHeight: `${screenH}px`,
      }}
    />
  );
}
