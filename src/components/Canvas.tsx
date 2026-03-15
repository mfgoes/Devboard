import { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useBoardStore } from '../store/boardStore';
import StickyNote from './nodes/StickyNote';
import ShapeNodeComponent from './nodes/ShapeNode';
import TextBlock from './nodes/TextBlock';
import SectionNodeComponent from './nodes/SectionNode';
import StickerNodeComponent from './nodes/StickerNode';
import TableNodeComponent from './nodes/TableNode';
import ConnectorLine, { anchorCoords, cpOffset, smartAnchors } from './nodes/ConnectorLine';
import TextEditor from './TextEditor';
import TableCellEditor from './TableCellEditor';
import StickyColorPicker from './StickyColorPicker';
import ShapeToolbar from './ShapeToolbar';
import TextBlockToolbar from './TextBlockToolbar';
import ConnectorToolbar from './ConnectorToolbar';
import SectionToolbar from './SectionToolbar';
import TableToolbar from './TableToolbar';
import TableInsertControls from './TableInsertControls';
import TableReorderControls from './TableReorderControls';
import MultiSelectToolbar from './MultiSelectToolbar';
import { AnchorSide, ConnectorNode, StickyNoteNode, ShapeNode, TextBlockNode, SectionNode, StickerNode, TableNode, CodeBlockNode } from '../types';
import CodeBlockComponent from './nodes/CodeBlock';
import { STICKY_COLORS } from './StickyColorPicker';
import { useTheme } from '../theme';

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

interface TextDraw {
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  currentScreenX: number;
  currentWorldX: number;
}

interface ShapeDraw {
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  currentScreenX: number;
  currentScreenY: number;
  currentWorldX: number;
  currentWorldY: number;
}

interface MarqueeDraw {
  startScreenX: number;
  startScreenY: number;
  currentScreenX: number;
  currentScreenY: number;
}

export default function Canvas() {
  const t = useTheme();
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  // Touch tracking for mobile pan/pinch
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const spacePressed = useRef(false);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  // Line drawing state
  const [drawingLine, setDrawingLine] = useState<DrawingLine | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; side: AnchorSide } | null>(null);

  // Text placement state
  const [textCursorPos, setTextCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [textDraw, setTextDraw] = useState<TextDraw | null>(null);

  // Shape drag-to-size state
  const [shapeDraw, setShapeDraw] = useState<ShapeDraw | null>(null);

  // Section drag-to-size state
  const [sectionDraw, setSectionDraw] = useState<ShapeDraw | null>(null);

  // Table drag-to-size state
  const [tableDraw, setTableDraw] = useState<ShapeDraw | null>(null);

  // Marquee (drag-to-select) state
  const [marqueeDraw, setMarqueeDraw] = useState<MarqueeDraw | null>(null);

  // Sticker hover position
  const [stickerCursorPos, setStickerCursorPos] = useState<{ x: number; y: number } | null>(null);

  const {
    nodes,
    camera,
    activeTool,
    activeShapeKind,
    activeSticker,
    selectedIds,
    editingId,
    tableEditState,
    setCamera,
    addNode,
    selectIds,
    setActiveTool,
    setEditingId,
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
          KeyR: 'shape',
          KeyT: 'text',
          KeyL: 'line',
          KeyF: 'section',
          KeyG: 'table',
          KeyK: 'code',
        };
        if (shortcuts[e.code]) setActiveTool(shortcuts[e.code]);
      }
      // Escape: cancel any in-progress operation
      if (e.code === 'Escape') {
        setDrawingLine(null);
        setSnapTarget(null);
        setTextDraw(null);
        setTextCursorPos(null);
        setShapeDraw(null);
        setSectionDraw(null);
        setTableDraw(null);
        setMarqueeDraw(null);
        setStickerCursorPos(null);
        selectIds([]);
        setActiveTool('select');
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
        const { x, y, scale } = camera;
        const pointer = stage.getPointerPosition()!;
        const factor =
          Math.abs(e.evt.deltaY) < 50
            ? 1 - e.evt.deltaY * 0.018
            : e.evt.deltaY < 0 ? 1.08 : 1 / 1.08;

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

      if (activeTool === 'code' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        addNode({
          id: generateId(),
          type: 'codeblock',
          x: worldX - 250,
          y: worldY - 40,
          width: 500,
          height: 220,
          code: `SELECT\n  user_id,\n  COUNT(*) AS event_count,\n  DATE_TRUNC('day', created_at) AS day\nFROM user_events\nWHERE created_at >= '2024-01-01'\nGROUP BY 1, 3\nORDER BY 3 DESC, 2 DESC\nLIMIT 100`,
          language: 'sql',
          title: 'Query: User Activity Summary',
          showLineNumbers: true,
        } satisfies CodeBlockNode);
        setActiveTool('select');
        return;
      }

      if (activeTool === 'sticker') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        const rotation = Math.round((Math.random() * 30 - 15) * 10) / 10;
        addNode({
          id: generateId(),
          type: 'sticker',
          src: activeSticker,
          x: worldX,
          y: worldY,
          width: 100,
          height: 100,
          rotation,
        } satisfies StickerNode);
        return;
      }

      if (activeTool === 'shape') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setShapeDraw({
          startScreenX: pos.x,
          startScreenY: pos.y,
          startWorldX: worldX,
          startWorldY: worldY,
          currentScreenX: pos.x,
          currentScreenY: pos.y,
          currentWorldX: worldX,
          currentWorldY: worldY,
        });
        return;
      }

      if (activeTool === 'section') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setSectionDraw({
          startScreenX: pos.x,
          startScreenY: pos.y,
          startWorldX: worldX,
          startWorldY: worldY,
          currentScreenX: pos.x,
          currentScreenY: pos.y,
          currentWorldX: worldX,
          currentWorldY: worldY,
        });
        return;
      }

      if (activeTool === 'table') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setTableDraw({
          startScreenX: pos.x,
          startScreenY: pos.y,
          startWorldX: worldX,
          startWorldY: worldY,
          currentScreenX: pos.x,
          currentScreenY: pos.y,
          currentWorldX: worldX,
          currentWorldY: worldY,
        });
        return;
      }

      // Text tool: begin drag-to-set-width
      if (activeTool === 'text' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setTextDraw({
          startScreenX: pos.x,
          startScreenY: pos.y,
          startWorldX: worldX,
          startWorldY: worldY,
          currentScreenX: pos.x,
          currentWorldX: worldX,
        });
        return;
      }

      if (activeTool === 'select' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        setMarqueeDraw({
          startScreenX: pos.x,
          startScreenY: pos.y,
          currentScreenX: pos.x,
          currentScreenY: pos.y,
        });
        return;
      }
    },
    [activeTool, activeShapeKind, activeSticker, camera, addNode, selectIds, setActiveTool, drawingLine]
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

        // Proximity snap — threshold 50 screen px converted to world units
        const threshold = 50 / camera.scale;
        let best: { nodeId: string; side: AnchorSide } | null = null;
        let bestDist = threshold;
        for (const n of useBoardStore.getState().nodes) {
          if ((n.type !== 'sticky' && n.type !== 'shape') || n.id === drawingLine.fromNodeId) continue;
          for (const side of ['top', 'right', 'bottom', 'left'] as AnchorSide[]) {
            const { x: ax, y: ay } = anchorCoords(n as StickyNoteNode | ShapeNode, side);
            const d = Math.hypot(worldX - ax, worldY - ay);
            if (d < bestDist) { bestDist = d; best = { nodeId: n.id, side }; }
          }
        }
        setSnapTarget(best);
      }
      // Track marquee drag
      if (marqueeDraw) {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          setMarqueeDraw((prev) =>
            prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y } : null
          );
        }
      }
      // Track shape drag preview
      if (activeTool === 'shape' && shapeDraw) {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          const worldX = (pos.x - camera.x) / camera.scale;
          const worldY = (pos.y - camera.y) / camera.scale;
          setShapeDraw((prev) =>
            prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null
          );
        }
      }
      // Track section drag preview
      if (activeTool === 'section' && sectionDraw) {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          const worldX = (pos.x - camera.x) / camera.scale;
          const worldY = (pos.y - camera.y) / camera.scale;
          setSectionDraw((prev) =>
            prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null
          );
        }
      }
      // Track cursor for sticker ghost
      if (activeTool === 'sticker') {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) setStickerCursorPos({ x: pos.x, y: pos.y });
      }

      // Track table drag preview
      if (activeTool === 'table' && tableDraw) {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          const worldX = (pos.x - camera.x) / camera.scale;
          const worldY = (pos.y - camera.y) / camera.scale;
          setTableDraw((prev) =>
            prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null
          );
        }
      }

      // Track cursor for text ghost / drag preview
      if (activeTool === 'text') {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          setTextCursorPos({ x: pos.x, y: pos.y });
          if (textDraw) {
            const worldX = (pos.x - camera.x) / camera.scale;
            setTextDraw((prev) =>
              prev ? { ...prev, currentScreenX: pos.x, currentWorldX: worldX } : null
            );
          }
        }
      }
    },
    [camera, setCamera, drawingLine, activeTool, shapeDraw, sectionDraw, tableDraw, textDraw, marqueeDraw, stickerCursorPos]
  );

  // ── Mouse up ────────────────────────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      setCursorOverride(spacePressed.current ? 'grab' : null);
    }
    // Marquee selection
    if (marqueeDraw) {
      const dragW = Math.abs(marqueeDraw.currentScreenX - marqueeDraw.startScreenX);
      const dragH = Math.abs(marqueeDraw.currentScreenY - marqueeDraw.startScreenY);
      if (dragW > 5 || dragH > 5) {
        const { camera: cam, nodes: allNodes } = useBoardStore.getState();
        const x1 = (Math.min(marqueeDraw.startScreenX, marqueeDraw.currentScreenX) - cam.x) / cam.scale;
        const y1 = (Math.min(marqueeDraw.startScreenY, marqueeDraw.currentScreenY) - cam.y) / cam.scale;
        const x2 = (Math.max(marqueeDraw.startScreenX, marqueeDraw.currentScreenX) - cam.x) / cam.scale;
        const y2 = (Math.max(marqueeDraw.startScreenY, marqueeDraw.currentScreenY) - cam.y) / cam.scale;
        const hit = allNodes
          .filter((n) => n.type !== 'connector')
          .filter((n) => {
            const sn = n as { x: number; y: number; width?: number; height?: number };
            const nw = sn.width ?? 0;
            const nh = sn.height ?? 0;
            return sn.x < x2 && sn.x + nw > x1 && sn.y < y2 && sn.y + nh > y1;
          })
          .map((n) => n.id);
        selectIds(hit);
      } else {
        selectIds([]);
      }
      setMarqueeDraw(null);
      return;
    }
    if (drawingLine) {
      if (snapTarget && snapTarget.nodeId !== drawingLine.fromNodeId) {
        const toNode = useBoardStore
          .getState()
          .nodes.find((n) => n.id === snapTarget.nodeId && (n.type === 'sticky' || n.type === 'shape')) as (StickyNoteNode | ShapeNode) | undefined;
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
          lineStyle: 'curved',
          strokeStyle: 'solid',
          arrowHeadStart: 'none',
          arrowHeadEnd: 'arrow',
        } satisfies ConnectorNode);
      }
      setDrawingLine(null);
      setSnapTarget(null);
    }
    // Shape drag-to-size placement
    if (shapeDraw) {
      const dragW = Math.abs(shapeDraw.currentScreenX - shapeDraw.startScreenX);
      const dragH = Math.abs(shapeDraw.currentScreenY - shapeDraw.startScreenY);
      const isDrag = dragW > 8 || dragH > 8;
      const worldW = Math.abs(shapeDraw.currentWorldX - shapeDraw.startWorldX);
      const worldH = Math.abs(shapeDraw.currentWorldY - shapeDraw.startWorldY);
      const useWidth  = isDrag ? Math.max(40, Math.round(worldW)) : 160;
      const useHeight = isDrag ? Math.max(40, Math.round(worldH)) : 120;
      const placeX = isDrag
        ? Math.min(shapeDraw.startWorldX, shapeDraw.currentWorldX)
        : shapeDraw.startWorldX - 80;
      const placeY = isDrag
        ? Math.min(shapeDraw.startWorldY, shapeDraw.currentWorldY)
        : shapeDraw.startWorldY - 60;
      addNode({
        id: generateId(),
        type: 'shape',
        kind: activeShapeKind,
        x: placeX,
        y: placeY,
        width: useWidth,
        height: useHeight,
        fill: '#6366f1',
        stroke: 'transparent',
        strokeWidth: 2,
        text: '',
        fontSize: 14,
        bold: false,
        italic: false,
        textAlign: 'center',
      } satisfies ShapeNode);
      setActiveTool('select');
      setShapeDraw(null);
    }
    // Section drag-to-size placement
    if (sectionDraw) {
      const dragW = Math.abs(sectionDraw.currentScreenX - sectionDraw.startScreenX);
      const dragH = Math.abs(sectionDraw.currentScreenY - sectionDraw.startScreenY);
      const isDrag = dragW > 20 || dragH > 20;
      const worldW = Math.abs(sectionDraw.currentWorldX - sectionDraw.startWorldX);
      const worldH = Math.abs(sectionDraw.currentWorldY - sectionDraw.startWorldY);
      const useW = isDrag ? Math.max(200, Math.round(worldW)) : 400;
      const useH = isDrag ? Math.max(150, Math.round(worldH)) : 300;
      const placeX = isDrag
        ? Math.min(sectionDraw.startWorldX, sectionDraw.currentWorldX)
        : sectionDraw.startWorldX - 200;
      const placeY = isDrag
        ? Math.min(sectionDraw.startWorldY, sectionDraw.currentWorldY)
        : sectionDraw.startWorldY - 150;
      addNode({
        id: generateId(),
        type: 'section',
        x: placeX,
        y: placeY,
        width: useW,
        height: useH,
        name: 'Section',
        color: '#6366f1',
      } satisfies SectionNode);
      setActiveTool('select');
      setSectionDraw(null);
    }
    // Table drag-to-size placement
    if (tableDraw) {
      const dragW = Math.abs(tableDraw.currentScreenX - tableDraw.startScreenX);
      const dragH = Math.abs(tableDraw.currentScreenY - tableDraw.startScreenY);
      const isDrag = dragW > 8 || dragH > 8;
      const worldW = Math.abs(tableDraw.currentWorldX - tableDraw.startWorldX);
      const worldH = Math.abs(tableDraw.currentWorldY - tableDraw.startWorldY);
      const NUM_COLS = isDrag ? Math.max(1, Math.round(worldW / 120)) : 3;
      const NUM_ROWS = isDrag ? Math.max(1, Math.round(worldH / 36)) : 3;
      const useW = isDrag ? Math.max(40 * NUM_COLS, Math.round(worldW)) : 360;
      const useH = isDrag ? Math.max(20 * NUM_ROWS, Math.round(worldH)) : 108;
      const placeX = isDrag ? Math.min(tableDraw.startWorldX, tableDraw.currentWorldX) : tableDraw.startWorldX - 180;
      const placeY = isDrag ? Math.min(tableDraw.startWorldY, tableDraw.currentWorldY) : tableDraw.startWorldY - 54;
      const colW = Math.max(40, Math.round(useW / NUM_COLS));
      const rowH = Math.max(20, Math.round(useH / NUM_ROWS));
      const { theme } = useBoardStore.getState();
      const isDark = theme === 'dark';
      addNode({
        id: generateId(),
        type: 'table',
        x: placeX,
        y: placeY,
        colWidths: Array(NUM_COLS).fill(colW),
        rowHeights: Array(NUM_ROWS).fill(rowH),
        cells: Array.from({ length: NUM_ROWS }, () => Array(NUM_COLS).fill('')),
        headerRow: true,
        fill: isDark ? '#1e293b' : '#ffffff',
        headerFill: '#6366f1',
        stroke: isDark ? '#475569' : '#e2e8f0',
        fontSize: 13,
      } satisfies TableNode);
      setActiveTool('select');
      setTableDraw(null);
    }

    // Text drag-to-place
    if (textDraw) {
      const dragScreenPx = Math.abs(textDraw.currentScreenX - textDraw.startScreenX);
      const worldWidth = Math.abs(textDraw.currentWorldX - textDraw.startWorldX);
      // If drag was meaningful (>20px screen), use that width; otherwise default
      const useWidth = dragScreenPx > 20 ? Math.max(80, Math.round(worldWidth)) : 240;
      const placeX = dragScreenPx > 20
        ? Math.min(textDraw.startWorldX, textDraw.currentWorldX)
        : textDraw.startWorldX;

      const newId = generateId();
      addNode({
        id: newId,
        type: 'textblock',
        x: placeX,
        y: textDraw.startWorldY,
        text: '',
        fontSize: 20,
        width: useWidth,
        color: 'auto',
        bold: false,
        italic: false,
        underline: false,
      } satisfies TextBlockNode);
      setActiveTool('select');
      setEditingId(newId);
      setTextDraw(null);
      setTextCursorPos(null);
    }
  }, [drawingLine, snapTarget, addNode, shapeDraw, sectionDraw, tableDraw, activeShapeKind, textDraw, setActiveTool, setEditingId, marqueeDraw, selectIds]);

  // ── Touch: single-finger pan (pan tool) + two-finger pinch/pan (always) ────
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length === 1) {
        const isPanMode = activeTool === 'pan' || spacePressed.current;
        if (isPanMode) {
          isPanning.current = true;
          lastTouchPos.current = { x: touches[0].clientX, y: touches[0].clientY };
        }
      } else if (touches.length === 2) {
        e.evt.preventDefault();
        isPanning.current = false;
        const t0 = touches[0], t1 = touches[1];
        lastPinchDist.current = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        lastPinchMid.current = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };
      }
    },
    [activeTool]
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();
      const touches = e.evt.touches;

      if (touches.length === 1 && isPanning.current && lastTouchPos.current) {
        const dx = touches[0].clientX - lastTouchPos.current.x;
        const dy = touches[0].clientY - lastTouchPos.current.y;
        lastTouchPos.current = { x: touches[0].clientX, y: touches[0].clientY };
        const { camera: cam } = useBoardStore.getState();
        setCamera({ x: cam.x + dx, y: cam.y + dy });
      } else if (touches.length === 2 && lastPinchDist.current !== null && lastPinchMid.current !== null) {
        const t0 = touches[0], t1 = touches[1];
        const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const newMid = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };
        const dx = newMid.x - lastPinchMid.current.x;
        const dy = newMid.y - lastPinchMid.current.y;
        const factor = newDist / lastPinchDist.current;
        const { camera: cam } = useBoardStore.getState();
        const newScale = Math.min(Math.max(cam.scale * factor, 0.08), 8);
        setCamera({
          scale: newScale,
          x: newMid.x - (newMid.x - cam.x) * (newScale / cam.scale) + dx,
          y: newMid.y - (newMid.y - cam.y) * (newScale / cam.scale) + dy,
        });
        lastPinchDist.current = newDist;
        lastPinchMid.current = newMid;
      }
    },
    [setCamera]
  );

  const handleTouchEnd = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current = null;
    }
    if (e.evt.touches.length === 0) {
      isPanning.current = false;
      lastTouchPos.current = null;
    } else if (e.evt.touches.length === 1) {
      // Transitioned from 2→1 fingers: restart single-touch tracking
      lastTouchPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
  }, []);

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
    let tx = toX;
    let ty = toY;
    if (snapTarget) {
      const toNode = nodes.find(
        (n) => n.id === snapTarget.nodeId && (n.type === 'sticky' || n.type === 'shape')
      ) as (StickyNoteNode | ShapeNode) | undefined;
      if (toNode) {
        const c = anchorCoords(toNode, snapTarget.side);
        tx = c.x;
        ty = c.y;
      }
    }
    const dist = Math.hypot(tx - fromX, ty - fromY);
    const tension = Math.min(Math.max(dist * 0.42, 55), 220);
    const cp1 = cpOffset(fromAnchor, tension);
    let toSide: AnchorSide = 'left';
    if (snapTarget) {
      toSide = snapTarget.side;
    } else {
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
    text: textDraw ? 'crosshair' : 'crosshair',
    pen: 'crosshair',
    section: 'crosshair',
    sticker: 'crosshair',
    table: 'crosshair',
    code: 'crosshair',
  };
  // If a line draw is in progress (e.g. started from an anchor in select mode), always crosshair
  const cursor = cursorOverride ?? (drawingLine ? 'crosshair' : toolCursor[activeTool] ?? 'default');

  // ── Grid ────────────────────────────────────────────────────────────────────
  const dotSpacing = 24 * camera.scale;
  const gridOffX = ((camera.x % dotSpacing) + dotSpacing) % dotSpacing;
  const gridOffY = ((camera.y % dotSpacing) + dotSpacing) % dotSpacing;
  // Dot radius stops shrinking below 40% zoom
  const dotScale = Math.max(camera.scale, 0.4);
  const dotRadius = 1.2 * dotScale;

  // ── Selected single node (for toolbars) ─────────────────────────────────────
  const singleSelected =
    selectedIds.length === 1 && !editingId
      ? nodes.find((n) => n.id === selectedIds[0])
      : null;

  // ── Selected connector (for connector toolbar) ───────────────────────────────
  const selectedConnectorId =
    selectedIds.length === 1
      ? (nodes.find(n => n.id === selectedIds[0] && n.type === 'connector')?.id ?? null)
      : null;

  // ── Selected/editing text block (for text toolbar) ───────────────────────────
  const activeTextBlockId =
    (selectedIds.length === 1 &&
      nodes.find((n) => n.id === selectedIds[0] && n.type === 'textblock')?.id) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'textblock')?.id) ||
    null;

  // ── Selected or editing sticky (for sticky toolbar) ──────────────────────────
  const activeStickyId =
    (singleSelected?.type === 'sticky' ? singleSelected.id : null) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'sticky')?.id) ||
    null;

  // ── Text ghost / drag-preview geometry ──────────────────────────────────────
  const ghostFontSize = Math.round(20 * camera.scale);
  const ghostWidth    = Math.round(240 * camera.scale);
  const ghostLineH    = Math.round(ghostFontSize * 1.5);

  const prevPoints = previewPoints();

  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: t.canvasBg,
        cursor,
        backgroundImage: `radial-gradient(circle, ${t.dotColor} ${dotRadius}px, transparent ${dotRadius}px)`,
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${gridOffX}px ${gridOffY}px`,
      }}
      onMouseLeave={() => {
        if (activeTool === 'text' && !textDraw) setTextCursorPos(null);
        if (activeTool === 'sticker') setStickerCursorPos(null);
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Layer>
          {/* Sections — rendered first so they sit behind everything */}
          {nodes
            .filter((n) => n.type === 'section')
            .map((n) => (
              <SectionNodeComponent
                key={n.id}
                node={n as SectionNode}
                isSelected={selectedIds.includes(n.id)}
                isEditing={editingId === n.id}
              />
            ))}

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
                isDrawingLine={drawingLine !== null}
                onAnchorDown={handleAnchorDown}
                onAnchorEnter={handleAnchorEnter}
                onAnchorLeave={handleAnchorLeave}
                snapAnchor={
                  snapTarget?.nodeId === n.id ? snapTarget.side : null
                }
              />
            ))}

          {/* Shape nodes */}
          {nodes
            .filter((n) => n.type === 'shape')
            .map((n) => (
              <ShapeNodeComponent
                key={n.id}
                node={n as ShapeNode}
                isSelected={selectedIds.includes(n.id)}
                isEditing={editingId === n.id}
                isDrawingLine={drawingLine !== null}
                onAnchorDown={handleAnchorDown}
                onAnchorEnter={handleAnchorEnter}
                onAnchorLeave={handleAnchorLeave}
                snapAnchor={
                  snapTarget?.nodeId === n.id ? snapTarget.side : null
                }
              />
            ))}

          {/* Text blocks */}
          {nodes
            .filter((n) => n.type === 'textblock')
            .map((n) => (
              <TextBlock
                key={n.id}
                node={n as TextBlockNode}
                isSelected={selectedIds.includes(n.id)}
                isEditing={editingId === n.id}
              />
            ))}

          {/* Stickers */}
          {nodes
            .filter((n) => n.type === 'sticker')
            .map((n) => (
              <StickerNodeComponent
                key={n.id}
                node={n as StickerNode}
                isSelected={selectedIds.includes(n.id)}
              />
            ))}

          {/* Tables */}
          {nodes
            .filter((n) => n.type === 'table')
            .map((n) => (
              <TableNodeComponent
                key={n.id}
                node={n as TableNode}
                isSelected={selectedIds.includes(n.id)}
              />
            ))}

          {/* In-progress line preview */}
          {drawingLine && prevPoints.length === 8 && (
            <Line
              points={prevPoints}
              bezier={true}
              stroke={snapTarget ? t.connectorColor : t.connectorPreview}
              strokeWidth={2}
              fill="transparent"
              dash={[7, 5]}
              opacity={0.75}
              lineCap="round"
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* ── Text ghost: hover preview before clicking ─────────────────────── */}
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

      {/* ── Text drag-to-width preview ────────────────────────────────────── */}
      {activeTool === 'text' && textDraw && (
        <>
          {/* Dashed preview box */}
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
          {/* Width label */}
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

      {/* ── Shape drag-to-size preview ────────────────────────────────────── */}
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

      {/* ── Section drag-to-size preview ─────────────────────────────────── */}
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

      {/* ── Table drag-to-size preview ────────────────────────────────── */}
      {activeTool === 'table' && tableDraw && (() => {
        const pdW = Math.abs(tableDraw.currentScreenX - tableDraw.startScreenX);
        const pdH = Math.abs(tableDraw.currentScreenY - tableDraw.startScreenY);
        const pIsDrag = pdW > 8 || pdH > 8;
        const pwW = Math.abs(tableDraw.currentWorldX - tableDraw.startWorldX);
        const pwH = Math.abs(tableDraw.currentWorldY - tableDraw.startWorldY);
        const pCols = pIsDrag ? Math.max(1, Math.round(pwW / 120)) : 3;
        const pRows = pIsDrag ? Math.max(1, Math.round(pwH / 36)) : 3;
        const pW = Math.max(2, pdW);
        const pH = Math.max(2, pdH);
        const colPct = 100 / pCols;
        const rowPct = 100 / pRows;
        return (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tableDraw.startScreenX, tableDraw.currentScreenX),
              top: Math.min(tableDraw.startScreenY, tableDraw.currentScreenY),
              width: pW,
              height: pH,
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

      {/* ── CodeBlock overlays ──────────────────────────────────────────────── */}
      {nodes.filter((n) => n.type === 'codeblock').map((n) => (
        <CodeBlockComponent
          key={n.id}
          node={n as CodeBlockNode}
          isSelected={selectedIds.includes(n.id)}
        />
      ))}

      {/* HTML overlays */}
      <TextEditor />
      <TableCellEditor />
      {activeStickyId && (
        <StickyColorPicker nodeId={activeStickyId} isEditing={!!editingId && editingId === activeStickyId} />
      )}
      {singleSelected?.type === 'shape' && (
        <ShapeToolbar nodeId={singleSelected.id} />
      )}
      {singleSelected?.type === 'section' && (
        <SectionToolbar nodeId={singleSelected.id} />
      )}
      {singleSelected?.type === 'table' && (
        <>
          <TableToolbar nodeId={singleSelected.id} />
          <TableInsertControls nodeId={singleSelected.id} />
          <TableReorderControls nodeId={singleSelected.id} />
        </>
      )}
      {activeTextBlockId && (
        <TextBlockToolbar nodeId={activeTextBlockId} />
      )}
      {selectedConnectorId && (
        <ConnectorToolbar nodeId={selectedConnectorId} />
      )}
      {selectedIds.length > 1 && !editingId && (
        <MultiSelectToolbar />
      )}
    </div>
  );
}
