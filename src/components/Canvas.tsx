import { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Arrow } from 'react-konva';
import Konva from 'konva';
import { useBoardStore } from '../store/boardStore';
import StickyNote from './nodes/StickyNote';
import ConnectorLine, { anchorCoords, cpOffset, smartAnchors } from './nodes/ConnectorLine';
import TextEditor from './TextEditor';
import StickyColorPicker from './StickyColorPicker';
import { AnchorSide, ConnectorNode, StickyNoteNode } from '../types';
import { STICKY_COLORS } from './StickyColorPicker';

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}
function randomStickyColor(): string {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)].hex;
}

interface DrawingLine {
  fromNodeId: string;
  fromAnchor: AnchorSide;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export default function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const spacePressed = useRef(false);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  // Line drawing state
  const [drawingLine, setDrawingLine] = useState<DrawingLine | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; side: AnchorSide } | null>(null);

  const {
    nodes,
    camera,
    activeTool,
    selectedIds,
    editingId,
    setCamera,
    addNode,
    selectIds,
    setActiveTool,
    deleteSelected,
  } = useBoardStore();

  // ── Window resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        spacePressed.current = true;
        setCursorOverride('grab');
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        deleteSelected();
      }
      // Tool shortcuts (no modifier)
      if (!e.metaKey && !e.ctrlKey) {
        const shortcuts: Record<string, Parameters<typeof setActiveTool>[0]> = {
          KeyV: 'select',
          KeyH: 'pan',
          KeyS: 'sticky',
          KeyL: 'line',
        };
        if (shortcuts[e.code]) setActiveTool(shortcuts[e.code]);
      }
      // Escape: cancel line draw or deselect
      if (e.code === 'Escape') {
        setDrawingLine(null);
        setSnapTarget(null);
        selectIds([]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressed.current = false;
        isPanning.current = false;
        setCursorOverride(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [deleteSelected, setActiveTool, selectIds]);

  // ── Wheel: pinch-zoom (ctrlKey) vs 2-finger pan (no ctrlKey) ───────────────
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      if (e.evt.ctrlKey) {
        // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse)
        const { x, y, scale } = camera;
        const pointer = stage.getPointerPosition()!;
        // Trackpad pinch deltaY is small (1–10); regular Ctrl+scroll is large (±100)
        const factor =
          Math.abs(e.evt.deltaY) < 50
            ? 1 - e.evt.deltaY * 0.018   // trackpad pinch: smooth
            : e.evt.deltaY < 0 ? 1.08 : 1 / 1.08; // mouse wheel: stepped

        const newScale = Math.min(Math.max(scale * factor, 0.08), 8);
        const mousePointTo = {
          x: (pointer.x - x) / scale,
          y: (pointer.y - y) / scale,
        };
        setCamera({
          scale: newScale,
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        });
      } else {
        // 2-finger pan on trackpad (deltaX + deltaY are already in pixels)
        setCamera({
          x: camera.x - e.evt.deltaX,
          y: camera.y - e.evt.deltaY,
        });
      }
    },
    [camera, setCamera]
  );

  // ── Mouse down ──────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const isMiddle = e.evt.button === 1;
      const isPanMode = activeTool === 'pan' || spacePressed.current;

      if (isMiddle || isPanMode) {
        isPanning.current = true;
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
        setCursorOverride('grabbing');
        return;
      }

      // If we're mid-draw and clicked the stage (not an anchor), cancel
      if (drawingLine) {
        setDrawingLine(null);
        setSnapTarget(null);
        return;
      }

      const clickedStage = e.target === e.target.getStage();

      if (activeTool === 'sticky' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        addNode({
          id: generateId(),
          type: 'sticky',
          x: worldX - 100,
          y: worldY - 80,
          text: '',
          color: randomStickyColor(),
          width: 200,
          height: 160,
        } satisfies StickyNoteNode);
        setActiveTool('select');
        return;
      }

      if (activeTool === 'select' && clickedStage) {
        selectIds([]);
      }
    },
    [activeTool, camera, addNode, selectIds, setActiveTool, drawingLine]
  );

  // ── Mouse move ──────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        const dx = e.evt.clientX - lastPointer.current.x;
        const dy = e.evt.clientY - lastPointer.current.y;
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
        setCamera({ x: camera.x + dx, y: camera.y + dy });
        return;
      }
      if (drawingLine) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setDrawingLine((prev) =>
          prev ? { ...prev, toX: worldX, toY: worldY } : null
        );
      }
    },
    [camera, setCamera, drawingLine]
  );

  // ── Mouse up ────────────────────────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      setCursorOverride(spacePressed.current ? 'grab' : null);
    }
    if (drawingLine) {
      if (snapTarget && snapTarget.nodeId !== drawingLine.fromNodeId) {
        // Find the to-node to snapshot coords
        const toNode = useBoardStore
          .getState()
          .nodes.find((n) => n.id === snapTarget.nodeId) as StickyNoteNode | undefined;
        const toCoords = toNode
          ? anchorCoords(toNode, snapTarget.side)
          : { x: drawingLine.toX, y: drawingLine.toY };

        addNode({
          id: generateId(),
          type: 'connector',
          fromNodeId: drawingLine.fromNodeId,
          fromAnchor: drawingLine.fromAnchor,
          fromX: drawingLine.fromX,
          fromY: drawingLine.fromY,
          toNodeId: snapTarget.nodeId,
          toAnchor: snapTarget.side,
          toX: toCoords.x,
          toY: toCoords.y,
          color: '#6366f1',
          strokeWidth: 2,
          hasArrow: true,
          dashed: false,
        } satisfies ConnectorNode);
      }
      setDrawingLine(null);
      setSnapTarget(null);
    }
  }, [drawingLine, snapTarget, addNode]);

  // ── Anchor callbacks (passed to StickyNote) ─────────────────────────────────
  const handleAnchorDown = useCallback(
    (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => {
      setDrawingLine({
        fromNodeId: nodeId,
        fromAnchor: side,
        fromX: worldX,
        fromY: worldY,
        toX: worldX,
        toY: worldY,
      });
    },
    []
  );

  const handleAnchorEnter = useCallback((nodeId: string, side: AnchorSide) => {
    setSnapTarget({ nodeId, side });
  }, []);

  const handleAnchorLeave = useCallback(() => {
    setSnapTarget(null);
  }, []);

  // ── Preview bezier line while drawing ───────────────────────────────────────
  function previewPoints(): number[] {
    if (!drawingLine) return [];
    const { fromX, fromY, fromAnchor, toX, toY } = drawingLine;
    // If snapped, use the actual anchor coords
    let tx = toX;
    let ty = toY;
    if (snapTarget) {
      const toNode = nodes.find(
        (n) => n.id === snapTarget.nodeId && n.type === 'sticky'
      ) as StickyNoteNode | undefined;
      if (toNode) {
        const c = anchorCoords(toNode, snapTarget.side);
        tx = c.x;
        ty = c.y;
      }
    }
    const dist = Math.hypot(tx - fromX, ty - fromY);
    const tension = Math.min(Math.max(dist * 0.42, 55), 220);
    const cp1 = cpOffset(fromAnchor, tension);
    // For the preview endpoint side, use smart detection if snapped
    let toSide: AnchorSide = 'left';
    if (snapTarget) {
      toSide = snapTarget.side;
    } else {
      // rough guess based on direction
      const dx = tx - fromX;
      const dy = ty - fromY;
      toSide = Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0 ? 'left' : 'right'
        : dy >= 0 ? 'top' : 'bottom';
    }
    const cp2 = cpOffset(toSide, tension);
    return [fromX, fromY, fromX + cp1.dx, fromY + cp1.dy, tx + cp2.dx, ty + cp2.dy, tx, ty];
  }

  // ── Cursor ──────────────────────────────────────────────────────────────────
  const toolCursor: Record<string, string> = {
    select: 'default',
    pan: 'grab',
    sticky: 'crosshair',
    line: drawingLine ? 'crosshair' : 'default',
    shape: 'crosshair',
    text: 'text',
    pen: 'crosshair',
    section: 'crosshair',
  };
  const cursor = cursorOverride ?? toolCursor[activeTool] ?? 'default';

  // ── Grid ────────────────────────────────────────────────────────────────────
  const dotSpacing = 24 * camera.scale;
  const gridOffX = ((camera.x % dotSpacing) + dotSpacing) % dotSpacing;
  const gridOffY = ((camera.y % dotSpacing) + dotSpacing) % dotSpacing;

  // ── Selected single sticky (for color picker) ───────────────────────────────
  const singleSelected =
    selectedIds.length === 1 && !editingId
      ? nodes.find((n) => n.id === selectedIds[0])
      : null;

  const prevPoints = previewPoints();

  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: '#111118',
        cursor,
        backgroundImage: `radial-gradient(circle, #3a3a4a 1.2px, transparent 1.2px)`,
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${gridOffX}px ${gridOffY}px`,
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.scale}
        scaleY={camera.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Layer>
          {/* Connectors rendered below stickies */}
          {nodes
            .filter((n) => n.type === 'connector')
            .map((n) => (
              <ConnectorLine
                key={n.id}
                node={n as ConnectorNode}
                isSelected={selectedIds.includes(n.id)}
              />
            ))}

          {/* Sticky notes */}
          {nodes
            .filter((n) => n.type === 'sticky')
            .map((n) => (
              <StickyNote
                key={n.id}
                node={n as StickyNoteNode}
                isSelected={selectedIds.includes(n.id)}
                isEditing={editingId === n.id}
                onAnchorDown={handleAnchorDown}
                onAnchorEnter={handleAnchorEnter}
                onAnchorLeave={handleAnchorLeave}
                snapAnchor={
                  snapTarget?.nodeId === n.id ? snapTarget.side : null
                }
              />
            ))}

          {/* In-progress line preview */}
          {drawingLine && prevPoints.length === 8 && (
            <Arrow
              points={prevPoints}
              bezier={true}
              stroke={snapTarget ? '#6366f1' : '#818cf8'}
              strokeWidth={2}
              fill={snapTarget ? '#6366f1' : '#818cf8'}
              dash={[7, 5]}
              opacity={0.75}
              pointerLength={snapTarget ? 10 : 0}
              pointerWidth={snapTarget ? 7 : 0}
              lineCap="round"
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* HTML overlays */}
      <TextEditor />
      {singleSelected?.type === 'sticky' && (
        <StickyColorPicker nodeId={singleSelected.id} />
      )}
    </div>
  );
}
