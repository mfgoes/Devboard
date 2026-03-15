import { useRef, useEffect } from 'react';
import { Group, Rect, Line, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { TableNode as TableNodeType } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { useTheme } from '../../theme';

const MIN_COL_W = 40;
const MIN_ROW_H = 20;
const RESIZE_HIT = 8; // hit area px for resize handles

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

interface Props {
  node: TableNodeType;
  isSelected: boolean;
}

export default function TableNode({ node, isSelected }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const t = useTheme();
  const {
    updateNode, selectIds, activeTool, saveHistory,
    tableEditState, setTableEditState,
    tableSelectionState, setTableSelectionState,
    setTableHoverDivider, setTableHoverEdge, setTableHoverCell,
  } = useBoardStore();

  const isLineTool = activeTool === 'line';

  // Attach transformer
  useEffect(() => {
    if (isSelected && !isLineTool && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isLineTool]);

  const colX = computeColX(node.colWidths);
  const rowY = computeRowY(node.rowHeights);
  const totalW = node.colWidths.reduce((a, b) => a + b, 0);
  const totalH = node.rowHeights.reduce((a, b) => a + b, 0);
  const numRows = node.rowHeights.length;
  const numCols = node.colWidths.length;

  const selectedCell =
    tableSelectionState?.nodeId === node.id
      ? { row: tableSelectionState.row, col: tableSelectionState.col }
      : null;

  // Column / row resize drag state
  type ColResize = { colIdx: number; startX: number; startWidth: number; stageEl: HTMLElement };
  type RowResize = { rowIdx: number; startY: number; startHeight: number; stageEl: HTMLElement };
  const colResizeRef = useRef<ColResize | null>(null);
  const rowResizeRef = useRef<RowResize | null>(null);

  useEffect(() => {
    const nodeId = node.id;

    const onMouseMove = (e: MouseEvent) => {
      if (colResizeRef.current) {
        const { colIdx, startX, startWidth, stageEl } = colResizeRef.current;
        const cam = useBoardStore.getState().camera;
        const rect = stageEl.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - cam.x) / cam.scale;
        const newW = Math.max(MIN_COL_W, startWidth + (worldX - startX));
        const cur = useBoardStore.getState().nodes.find(n => n.id === nodeId) as TableNodeType | undefined;
        if (!cur) return;
        const newColWidths = [...cur.colWidths];
        newColWidths[colIdx] = newW;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateNode(nodeId, { colWidths: newColWidths } as any);
      }
      if (rowResizeRef.current) {
        const { rowIdx, startY, startHeight, stageEl } = rowResizeRef.current;
        const cam = useBoardStore.getState().camera;
        const rect = stageEl.getBoundingClientRect();
        const worldY = (e.clientY - rect.top - cam.y) / cam.scale;
        const newH = Math.max(MIN_ROW_H, startHeight + (worldY - startY));
        const cur = useBoardStore.getState().nodes.find(n => n.id === nodeId) as TableNodeType | undefined;
        if (!cur) return;
        const newRowHeights = [...cur.rowHeights];
        newRowHeights[rowIdx] = newH;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateNode(nodeId, { rowHeights: newRowHeights } as any);
      }
    };

    const onMouseUp = () => {
      if (colResizeRef.current) {
        colResizeRef.current.stageEl.style.cursor = '';
        saveHistory();
        colResizeRef.current = null;
      }
      if (rowResizeRef.current) {
        rowResizeRef.current.stageEl.style.cursor = '';
        saveHistory();
        rowResizeRef.current = null;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [node.id, updateNode, saveHistory]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool || activeTool === 'table') return;
    e.cancelBubble = true;
    const { selectedIds } = useBoardStore.getState();
    if (e.evt.shiftKey) {
      selectIds(selectedIds.includes(node.id)
        ? selectedIds.filter(id => id !== node.id)
        : [...selectedIds, node.id]);
    } else {
      selectIds([node.id]);
    }
  };

  const handleCellClick = (row: number, col: number, e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool || activeTool === 'table') return;
    e.cancelBubble = true;
    selectIds([node.id]);
    setTableSelectionState({ nodeId: node.id, row, col });
  };

  const handleCellDblClick = (row: number, col: number, e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool) return;
    e.cancelBubble = true;
    selectIds([node.id]);
    setTableSelectionState({ nodeId: node.id, row, col });
    setTableEditState({ nodeId: node.id, row, col });
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    saveHistory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateNode(node.id, { x: e.target.x(), y: e.target.y() } as any);
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const sx = group.scaleX();
    const sy = group.scaleY();
    saveHistory();
    updateNode(node.id, {
      x: group.x(),
      y: group.y(),
      colWidths: node.colWidths.map(w => Math.max(MIN_COL_W, w * sx)),
      rowHeights: node.rowHeights.map(h => Math.max(MIN_ROW_H, h * sy)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    group.scaleX(1);
    group.scaleY(1);
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={node.x}
        y={node.y}
        draggable={!isLineTool}
        onClick={handleClick}
        onDblClick={(e) => e.cancelBubble = true}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseMove={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;
          const ptr = stage.getPointerPosition();
          if (!ptr) return;
          const cam = useBoardStore.getState().camera;
          const localX = (ptr.x - cam.x) / cam.scale - node.x;
          const localY = (ptr.y - cam.y) / cam.scale - node.y;
          const lastRowY = rowY[numRows - 1];
          const lastColX = colX[numCols - 1];
          setTableHoverEdge({
            nodeId: node.id,
            showBottom: localY >= lastRowY,
            showRight: localX >= lastColX,
          });
          // Compute hovered row/col for reorder handles
          if (localX >= 0 && localX <= totalW && localY >= 0 && localY <= totalH) {
            let hovRow = numRows - 1;
            for (let r = 0; r < numRows - 1; r++) {
              if (localY < rowY[r + 1]) { hovRow = r; break; }
            }
            let hovCol = numCols - 1;
            for (let c = 0; c < numCols - 1; c++) {
              if (localX < colX[c + 1]) { hovCol = c; break; }
            }
            setTableHoverCell({ nodeId: node.id, row: hovRow, col: hovCol });
          } else {
            setTableHoverCell(null);
          }
        }}
        onMouseLeave={() => { setTableHoverEdge(null); setTableHoverCell(null); }}
      >
        {/* Cell backgrounds */}
        {Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => {
            const isHeader = node.headerRow && r === 0;
            const isFocused = selectedCell?.row === r && selectedCell?.col === c;
            return (
              <Rect
                key={`cell-${r}-${c}`}
                x={colX[c]}
                y={rowY[r]}
                width={node.colWidths[c]}
                height={node.rowHeights[r]}
                fill={isFocused ? '#6366f133' : isHeader ? node.headerFill : node.fill}
                onClick={(e) => handleCellClick(r, c, e)}
                onDblClick={(e) => handleCellDblClick(r, c, e)}
              />
            );
          })
        )}

        {/* Cell text — hidden while that cell is being edited */}
        {Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => {
            const isEditingCell = tableEditState?.nodeId === node.id &&
              tableEditState.row === r && tableEditState.col === c;
            const text = node.cells[r]?.[c] ?? '';
            if (!text || isEditingCell) return null;
            const isHeader = node.headerRow && r === 0;
            return (
              <Text
                key={`text-${r}-${c}`}
                x={colX[c] + 6}
                y={rowY[r]}
                width={node.colWidths[c] - 12}
                height={node.rowHeights[r]}
                text={text}
                fontSize={node.fontSize}
                fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                fontStyle={isHeader ? 'bold' : 'normal'}
                fill={isHeader ? '#ffffff' : t.textHi}
                verticalAlign="middle"
                wrap="word"
                listening={false}
              />
            );
          })
        )}

        {/* Internal horizontal grid lines */}
        {rowY.slice(1).map((y, i) => (
          <Line
            key={`hline-${i}`}
            points={[0, y, totalW, y]}
            stroke={node.stroke}
            strokeWidth={node.headerRow && i === 0 ? 2 : 1}
            listening={false}
          />
        ))}

        {/* Internal vertical grid lines */}
        {colX.slice(1).map((x, i) => (
          <Line
            key={`vline-${i}`}
            points={[x, 0, x, totalH]}
            stroke={node.stroke}
            strokeWidth={1}
            listening={false}
          />
        ))}

        {/* Outer border */}
        <Rect
          x={0} y={0}
          width={totalW} height={totalH}
          fill="transparent"
          stroke={node.stroke}
          strokeWidth={2}
          listening={false}
        />

        {/* Column resize handles (between columns) */}
        {isSelected && colX.slice(1).map((x, i) => (
          <Rect
            key={`col-handle-${i}`}
            x={x - RESIZE_HIT / 2}
            y={0}
            width={RESIZE_HIT}
            height={totalH}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'col-resize'; setTableHoverDivider({ nodeId: node.id, kind: 'col', idx: i }); }}
            onMouseLeave={(e) => { if (!colResizeRef.current) e.target.getStage()!.container().style.cursor = ''; setTableHoverDivider(null); }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const ptr = stage.getPointerPosition()!;
              const cam = useBoardStore.getState().camera;
              colResizeRef.current = {
                colIdx: i,
                startX: (ptr.x - cam.x) / cam.scale,
                startWidth: node.colWidths[i],
                stageEl: stage.container(),
              };
              stage.container().style.cursor = 'col-resize';
            }}
          />
        ))}

        {/* Row resize handles (between rows) */}
        {isSelected && rowY.slice(1).map((y, i) => (
          <Rect
            key={`row-handle-${i}`}
            x={0}
            y={y - RESIZE_HIT / 2}
            width={totalW}
            height={RESIZE_HIT}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'row-resize'; setTableHoverDivider({ nodeId: node.id, kind: 'row', idx: i }); }}
            onMouseLeave={(e) => { if (!rowResizeRef.current) e.target.getStage()!.container().style.cursor = ''; setTableHoverDivider(null); }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const ptr = stage.getPointerPosition()!;
              const cam = useBoardStore.getState().camera;
              rowResizeRef.current = {
                rowIdx: i,
                startY: (ptr.y - cam.y) / cam.scale,
                startHeight: node.rowHeights[i],
                stageEl: stage.container(),
              };
              stage.container().style.cursor = 'row-resize';
            }}
          />
        ))}

        {/* Last column right-edge resize handle */}
        {isSelected && (
          <Rect
            key="col-last-handle"
            x={totalW - RESIZE_HIT / 2}
            y={0}
            width={RESIZE_HIT}
            height={totalH}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'col-resize'; }}
            onMouseLeave={(e) => { if (!colResizeRef.current) e.target.getStage()!.container().style.cursor = ''; }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const ptr = stage.getPointerPosition()!;
              const cam = useBoardStore.getState().camera;
              colResizeRef.current = {
                colIdx: numCols - 1,
                startX: (ptr.x - cam.x) / cam.scale,
                startWidth: node.colWidths[numCols - 1],
                stageEl: stage.container(),
              };
              stage.container().style.cursor = 'col-resize';
            }}
          />
        )}

        {/* Last row bottom-edge resize handle */}
        {isSelected && (
          <Rect
            key="row-last-handle"
            x={0}
            y={totalH - RESIZE_HIT / 2}
            width={totalW}
            height={RESIZE_HIT}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'row-resize'; }}
            onMouseLeave={(e) => { if (!rowResizeRef.current) e.target.getStage()!.container().style.cursor = ''; }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const ptr = stage.getPointerPosition()!;
              const cam = useBoardStore.getState().camera;
              rowResizeRef.current = {
                rowIdx: numRows - 1,
                startY: (ptr.y - cam.y) / cam.scale,
                startHeight: node.rowHeights[numRows - 1],
                stageEl: stage.container(),
              };
              stage.container().style.cursor = 'row-resize';
            }}
          />
        )}
      </Group>

      {/* Transformer */}
      {isSelected && !isLineTool && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']}
          anchorSize={10}
          anchorCornerRadius={2}
          anchorStroke="#6366f1"
          anchorStrokeWidth={2}
          anchorFill="white"
          borderStroke="#6366f1"
          borderStrokeWidth={2}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < MIN_COL_W * numCols || newBox.height < MIN_ROW_H * numRows) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
