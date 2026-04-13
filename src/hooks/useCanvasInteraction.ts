import { useRef, useState, useCallback, useEffect } from 'react';
import type React from 'react';
import Konva from 'konva';
import { useBoardStore } from '../store/boardStore';
import { anchorCoords } from '../components/nodes/ConnectorLine';
import {
  AnchorSide,
  ConnectorNode,
  StickyNoteNode,
  ShapeNode,
  SectionNode,
  StickerNode,
  TableNode,
  TextBlockNode,
  ImageNode,
  LinkNode,
  TaskCardNode,
  CodeBlockNode,
} from '../types';
import { STICKY_COLORS } from '../components/StickyColorPicker';
import { SECTION_TO_STICKY, resolveCssColor } from '../utils/palette';
import type { ContextMenuState } from '../components/ContextMenu';

// ── Private helpers ─────────────────────────────────────────────────────────
function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}
function randomStickyColor(): string {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)].hex;
}

// ── Exported interfaces (Canvas.tsx uses them in JSX) ───────────────────────
export interface DrawingLine {
  fromNodeId: string;
  fromAnchor: AnchorSide;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface TextDraw {
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  currentScreenX: number;
  currentWorldX: number;
}

export interface ShapeDraw {
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  currentScreenX: number;
  currentScreenY: number;
  currentWorldX: number;
  currentWorldY: number;
}

export interface MarqueeDraw {
  startScreenX: number;
  startScreenY: number;
  currentScreenX: number;
  currentScreenY: number;
}

export interface SnapGuide {
  orientation: 'h' | 'v';
  pos: number;
  start: number;
  end: number;
}

export const SNAP_THRESHOLD = 8;

export interface UseCanvasInteractionOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  spacePressed: React.MutableRefObject<boolean>;
  setCursorOverride: React.Dispatch<React.SetStateAction<string | null>>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  pendingImagePos: React.MutableRefObject<{ x: number; y: number } | null>;
}

export function useCanvasInteraction({
  stageRef,
  spacePressed,
  setCursorOverride,
  imageInputRef,
  pendingImagePos,
}: UseCanvasInteractionOptions) {
  // ── Store subscriptions ──────────────────────────────────────────────────
  const camera       = useBoardStore((s) => s.camera);
  const activeTool   = useBoardStore((s) => s.activeTool);
  const activeShapeKind = useBoardStore((s) => s.activeShapeKind);
  const activeSticker   = useBoardStore((s) => s.activeSticker);
  const { setCamera, addNode, selectIds, setActiveTool, setEditingId } = useBoardStore();

  // ── Refs ─────────────────────────────────────────────────────────────────
  const isPanning        = useRef(false);
  const lastPointer      = useRef({ x: 0, y: 0 });
  const altDragInProgress = useRef(false);
  const nudging          = useRef(false);
  const multiDragBase    = useRef<{
    draggingId: string;
    startX: number;
    startY: number;
    peers: { id: string; origX: number; origY: number }[];
  } | null>(null);
  const lastTouchPos    = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist   = useRef<number | null>(null);
  const lastPinchMid    = useRef<{ x: number; y: number } | null>(null);
  const touchToolStart  = useRef<{ clientX: number; clientY: number } | null>(null);
  void nudging; // declared for potential future use

  // ── Draw state ───────────────────────────────────────────────────────────
  const [drawingLine,      setDrawingLine]      = useState<DrawingLine | null>(null);
  const [snapTarget,       setSnapTarget]       = useState<{ nodeId: string; side: AnchorSide } | null>(null);
  const [textCursorPos,    setTextCursorPos]    = useState<{ x: number; y: number } | null>(null);
  const [textDraw,         setTextDraw]         = useState<TextDraw | null>(null);
  const [shapeDraw,        setShapeDraw]        = useState<ShapeDraw | null>(null);
  const [sectionDraw,      setSectionDraw]      = useState<ShapeDraw | null>(null);
  const [tableDraw,        setTableDraw]        = useState<ShapeDraw | null>(null);
  const [marqueeDraw,      setMarqueeDraw]      = useState<MarqueeDraw | null>(null);
  const [stickerCursorPos, setStickerCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [taskCursorPos,    setTaskCursorPos]    = useState<{ x: number; y: number } | null>(null);
  const [snapGuides,       setSnapGuides]       = useState<SnapGuide[]>([]);
  const [contextMenu,      setContextMenu]      = useState<ContextMenuState | null>(null);

  // ── Cancel all in-progress operations ────────────────────────────────────
  const cancelAll = useCallback(() => {
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
  }, [selectIds, setActiveTool]);

  // ── Snap computation ──────────────────────────────────────────────────────
  const computeSnap = useCallback((
    nodeId: string, nx: number, ny: number, nw: number, nh: number
  ): { x: number; y: number } => {
    const others = useBoardStore.getState().nodes.filter(
      (n) => n.id !== nodeId && n.type !== 'connector'
    );
    const nXs = [nx, nx + nw / 2, nx + nw];
    const nYs = [ny, ny + nh / 2, ny + nh];

    let snapDx = 0, bestDx = SNAP_THRESHOLD + 1;
    let snapDy = 0, bestDy = SNAP_THRESHOLD + 1;
    let xGuide: SnapGuide | null = null;
    let yGuide: SnapGuide | null = null;

    for (const other of others) {
      const o = other as { x?: number; y?: number; width?: number; height?: number };
      const ox = o.x ?? 0, oy = o.y ?? 0;
      const ow = o.width ?? 160, oh = o.height ?? 120;
      const oXs = [ox, ox + ow / 2, ox + ow];
      const oYs = [oy, oy + oh / 2, oy + oh];

      for (const nVal of nXs) {
        for (const oVal of oXs) {
          const d = Math.abs(nVal - oVal);
          if (d < bestDx) {
            bestDx = d; snapDx = oVal - nVal;
            xGuide = { orientation: 'v', pos: oVal, start: Math.min(ny, oy) - 20, end: Math.max(ny + nh, oy + oh) + 20 };
          }
        }
      }
      for (const nVal of nYs) {
        for (const oVal of oYs) {
          const d = Math.abs(nVal - oVal);
          if (d < bestDy) {
            bestDy = d; snapDy = oVal - nVal;
            yGuide = { orientation: 'h', pos: oVal, start: Math.min(nx, ox) - 20, end: Math.max(nx + nw, ox + ow) + 20 };
          }
        }
      }
    }

    const guides: SnapGuide[] = [];
    if (bestDx <= SNAP_THRESHOLD && xGuide) guides.push(xGuide);
    if (bestDy <= SNAP_THRESHOLD && yGuide) guides.push(yGuide);
    setSnapGuides(guides);
    return {
      x: nx + (bestDx <= SNAP_THRESHOLD ? snapDx : 0),
      y: ny + (bestDy <= SNAP_THRESHOLD ? snapDy : 0),
    };
  }, []);

  const clearSnap = useCallback(() => setSnapGuides([]), []);

  // ── Alt+drag to duplicate ─────────────────────────────────────────────────
  const handleAltDragStart = useCallback((nodeId: string) => {
    if (altDragInProgress.current) return;
    altDragInProgress.current = true;
    const { nodes, selectedIds, saveHistory, addNode: add, selectIds: sel } = useBoardStore.getState();
    const idsToClone = selectedIds.includes(nodeId) && selectedIds.length > 1
      ? selectedIds
      : [nodeId];
    const toClone = idsToClone
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n && n.type !== 'connector');
    if (toClone.length === 0) return;
    saveHistory();
    for (const original of toClone) {
      add({ ...original, id: generateId() } as (typeof original));
    }
    sel(idsToClone);
  }, []);

  const handleAltDragEnd = useCallback(() => {
    altDragInProgress.current = false;
  }, []);

  // ── Context menu ──────────────────────────────────────────────────────────
  const handleNodeContextMenu = useCallback((nodeId: string, x: number, y: number) => {
    const { selectedIds, selectIds: sel } = useBoardStore.getState();
    if (!selectedIds.includes(nodeId)) sel([nodeId]);
    const ids = selectedIds.includes(nodeId) ? selectedIds : [nodeId];
    setContextMenu({ x, y, nodeIds: ids });
  }, []);

  // ── Multi-node drag ───────────────────────────────────────────────────────
  const getShouldSaveHistory = useCallback(() => {
    return multiDragBase.current === null && !altDragInProgress.current;
  }, []);

  const handleMultiDragStart = useCallback((nodeId: string, worldX: number, worldY: number) => {
    const { selectedIds, nodes } = useBoardStore.getState();
    if (!selectedIds.includes(nodeId) || selectedIds.length < 2) return;
    const peers = selectedIds
      .filter((id) => id !== nodeId)
      .map((id) => {
        const n = nodes.find((x) => x.id === id);
        if (!n || n.type === 'connector') return null;
        return { id, origX: (n as { x?: number }).x ?? 0, origY: (n as { y?: number }).y ?? 0 };
      })
      .filter((x): x is { id: string; origX: number; origY: number } => x !== null);
    if (peers.length === 0) return;
    if (!altDragInProgress.current) useBoardStore.getState().saveHistory();
    multiDragBase.current = { draggingId: nodeId, startX: worldX, startY: worldY, peers };
  }, []);

  const handleMultiDragMove = useCallback((nodeId: string, worldX: number, worldY: number) => {
    if (!multiDragBase.current || multiDragBase.current.draggingId !== nodeId) return;
    const { startX, startY, peers } = multiDragBase.current;
    const dx = worldX - startX, dy = worldY - startY;
    const { updateNode } = useBoardStore.getState();
    for (const peer of peers) {
      updateNode(peer.id, { x: peer.origX + dx, y: peer.origY + dy } as Parameters<typeof updateNode>[1]);
    }
  }, []);

  const handleMultiDragEnd = useCallback(() => {
    multiDragBase.current = null;
  }, []);

  // ── Section color matching on drag settle ─────────────────────────────────
  const handleDragSettled = useCallback((nodeId: string) => {
    const { nodes, updateNode, selectedIds } = useBoardStore.getState();
    const sections = nodes.filter(
      (n) => n.type === 'section' && (n as SectionNode).matchStickies
    ) as SectionNode[];
    if (sections.length === 0) return;

    const candidates = selectedIds.includes(nodeId) ? selectedIds : [nodeId];
    for (const id of candidates) {
      const n = nodes.find((x) => x.id === id);
      if (!n || n.type !== 'sticky') continue;
      const sn = n as StickyNoteNode;
      const cx = sn.x + sn.width / 2;
      const cy = sn.y + sn.height / 2;
      for (const sec of sections) {
        if (cx >= sec.x && cx <= sec.x + sec.width && cy >= sec.y && cy <= sec.y + sec.height) {
          const targetColor = SECTION_TO_STICKY[sec.color] ?? sec.color;
          if (sn.color !== targetColor) updateNode(id, { color: targetColor } as Parameters<typeof updateNode>[1]);
          break;
        }
      }
    }
  }, []);

  // ── Window-level middle-mouse panning ────────────────────────────────────────
  // Handle middle-mouse button panning at window level so it works over draggable elements
  useEffect(() => {
    const onWindowMouseDown = (e: MouseEvent) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        isPanning.current = true;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        setCursorOverride('grabbing');
      }
    };
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - lastPointer.current.x;
        const dy = e.clientY - lastPointer.current.y;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        const { camera: cam, setCamera: setC } = useBoardStore.getState();
        setC({ x: cam.x + dx, y: cam.y + dy });
      }
    };
    const onWindowMouseUp = () => {
      if (isPanning.current) {
        isPanning.current = false;
        setCursorOverride(null);
      }
    };
    window.addEventListener('mousedown', onWindowMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousedown', onWindowMouseDown);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, []);

  // ── Mouse down ────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Middle mouse panning is now handled at window level for better interaction with draggable elements
      const isPanMode = activeTool === 'pan' || spacePressed.current;

      if (isPanMode && e.evt.button !== 1) { // Skip if middle mouse (already handled at window level)
        isPanning.current = true;
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY };
        setCursorOverride('grabbing');
        e.cancelBubble = true; // Prevent event from bubbling to node components
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
          fontSizeMode: 'dynamic',
        } satisfies StickyNoteNode);
        setActiveTool('select');
        return;
      }

      if (activeTool === 'task' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        addNode({
          id: generateId(),
          type: 'taskcard',
          x: worldX - 140,
          y: worldY - 40,
          width: 280,
          title: 'New Task Card',
          tasks: [],
          color: resolveCssColor('--c-line-default'),
        } satisfies TaskCardNode);
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

      if (activeTool === 'link' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        addNode({
          id: generateId(),
          type: 'link',
          x: worldX - 160,
          y: worldY - 30,
          width: 320,
          height: 90,
          url: 'https://',
          displayMode: 'compact',
        } satisfies LinkNode);
        setActiveTool('select');
        return;
      }

      if (activeTool === 'image' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        pendingImagePos.current = {
          x: (pos.x - camera.x) / camera.scale,
          y: (pos.y - camera.y) / camera.scale,
        };
        imageInputRef.current?.click();
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
          startScreenX: pos.x, startScreenY: pos.y,
          startWorldX: worldX, startWorldY: worldY,
          currentScreenX: pos.x, currentScreenY: pos.y,
          currentWorldX: worldX, currentWorldY: worldY,
        });
        return;
      }

      if (activeTool === 'section') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setSectionDraw({
          startScreenX: pos.x, startScreenY: pos.y,
          startWorldX: worldX, startWorldY: worldY,
          currentScreenX: pos.x, currentScreenY: pos.y,
          currentWorldX: worldX, currentWorldY: worldY,
        });
        return;
      }

      if (activeTool === 'table') {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setTableDraw({
          startScreenX: pos.x, startScreenY: pos.y,
          startWorldX: worldX, startWorldY: worldY,
          currentScreenX: pos.x, currentScreenY: pos.y,
          currentWorldX: worldX, currentWorldY: worldY,
        });
        return;
      }

      if (activeTool === 'text' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        setTextDraw({
          startScreenX: pos.x, startScreenY: pos.y,
          startWorldX: worldX, startWorldY: worldY,
          currentScreenX: pos.x, currentWorldX: worldX,
        });
        return;
      }

      if (activeTool === 'select' && clickedStage) {
        const pos = stageRef.current!.getPointerPosition()!;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;

        // Task cards are HTML overlays — Konva has no node for them, so the stage
        // sees their area as empty. If the click lands inside a task card, select it
        // rather than starting a marquee (which would immediately deselect on mouseup).
        const hitCard = useBoardStore.getState().nodes.find((n) => {
          if (n.type !== 'taskcard') return false;
          const tc = n as TaskCardNode;
          const h = tc.height ?? 9999;
          return worldX >= tc.x && worldX <= tc.x + tc.width && worldY >= tc.y && worldY <= tc.y + h;
        });
        if (hitCard) {
          selectIds([hitCard.id]);
          return;
        }

        setMarqueeDraw({
          startScreenX: pos.x, startScreenY: pos.y,
          currentScreenX: pos.x, currentScreenY: pos.y,
        });
        return;
      }
    },
    [activeTool, activeShapeKind, activeSticker, camera, addNode, selectIds, setActiveTool, drawingLine]
  );

  // ── Mouse move ────────────────────────────────────────────────────────────
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
        setDrawingLine((prev) => prev ? { ...prev, toX: worldX, toY: worldY } : null);
      }
      if (marqueeDraw) {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) {
          setMarqueeDraw((prev) =>
            prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y } : null
          );
        }
      }
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
      if (activeTool === 'sticker') {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) setStickerCursorPos({ x: pos.x, y: pos.y });
      }
      if (activeTool === 'task') {
        const pos = stageRef.current?.getPointerPosition();
        if (pos) setTaskCursorPos({ x: pos.x, y: pos.y });
      }
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
    [camera, setCamera, drawingLine, activeTool, shapeDraw, sectionDraw, tableDraw, textDraw, marqueeDraw]
  );

  // ── Mouse up ──────────────────────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      setCursorOverride(spacePressed.current ? 'grab' : null);
    }
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
          .nodes.find(
            (n) => n.id === snapTarget.nodeId && (n.type === 'sticky' || n.type === 'shape' || n.type === 'taskcard')
          ) as (StickyNoteNode | ShapeNode | TaskCardNode) | undefined;
        const toCoords = toNode
          ? anchorCoords(toNode as StickyNoteNode | ShapeNode, snapTarget.side)
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
          color: resolveCssColor('--c-line-default'),
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
    if (shapeDraw) {
      const dragW = Math.abs(shapeDraw.currentScreenX - shapeDraw.startScreenX);
      const dragH = Math.abs(shapeDraw.currentScreenY - shapeDraw.startScreenY);
      const isDrag = dragW > 8 || dragH > 8;
      const worldW = Math.abs(shapeDraw.currentWorldX - shapeDraw.startWorldX);
      const worldH = Math.abs(shapeDraw.currentWorldY - shapeDraw.startWorldY);
      const useWidth  = isDrag ? Math.max(40, Math.round(worldW)) : 160;
      const useHeight = isDrag ? Math.max(40, Math.round(worldH)) : 120;
      const placeX = isDrag ? Math.min(shapeDraw.startWorldX, shapeDraw.currentWorldX) : shapeDraw.startWorldX - 80;
      const placeY = isDrag ? Math.min(shapeDraw.startWorldY, shapeDraw.currentWorldY) : shapeDraw.startWorldY - 60;
      addNode({
        id: generateId(),
        type: 'shape',
        kind: activeShapeKind,
        x: placeX,
        y: placeY,
        width: useWidth,
        height: useHeight,
        fill: '#e2e8f0',
        stroke: 'transparent',
        strokeWidth: 2,
        text: '',
        fontSize: 14,
        bold: false,
        italic: false,
        textAlign: 'center',
      } satisfies ShapeNode);
      setShapeDraw(null);
      setActiveTool('select');
    }
    if (sectionDraw) {
      const dragW = Math.abs(sectionDraw.currentScreenX - sectionDraw.startScreenX);
      const dragH = Math.abs(sectionDraw.currentScreenY - sectionDraw.startScreenY);
      const isDrag = dragW > 20 || dragH > 20;
      const worldW = Math.abs(sectionDraw.currentWorldX - sectionDraw.startWorldX);
      const worldH = Math.abs(sectionDraw.currentWorldY - sectionDraw.startWorldY);
      const useW = isDrag ? Math.max(200, Math.round(worldW)) : 400;
      const useH = isDrag ? Math.max(150, Math.round(worldH)) : 300;
      const placeX = isDrag ? Math.min(sectionDraw.startWorldX, sectionDraw.currentWorldX) : sectionDraw.startWorldX - 200;
      const placeY = isDrag ? Math.min(sectionDraw.startWorldY, sectionDraw.currentWorldY) : sectionDraw.startWorldY - 150;
      addNode({
        id: generateId(),
        type: 'section',
        x: placeX,
        y: placeY,
        width: useW,
        height: useH,
        name: 'Section',
        color: '#90CAF9',
      } satisfies SectionNode);
      setActiveTool('select');
      setSectionDraw(null);
    }
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
        headerFill: 'var(--c-line)',
        stroke: isDark ? '#475569' : '#e2e8f0',
        fontSize: 13,
      } satisfies TableNode);
      setActiveTool('select');
      setTableDraw(null);
    }
    if (textDraw) {
      const dragScreenPx = Math.abs(textDraw.currentScreenX - textDraw.startScreenX);
      const worldWidth = Math.abs(textDraw.currentWorldX - textDraw.startWorldX);
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
      setEditingId(newId);
      setTextDraw(null);
      setTextCursorPos(null);
    }
  }, [drawingLine, snapTarget, addNode, shapeDraw, sectionDraw, tableDraw, activeShapeKind, textDraw, setActiveTool, setEditingId, marqueeDraw, selectIds]);

  // ── Touch ─────────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length === 1) {
        const isPanMode = activeTool === 'pan' || spacePressed.current;
        if (isPanMode) {
          isPanning.current = true;
          lastTouchPos.current = { x: touches[0].clientX, y: touches[0].clientY };
        } else {
          const stage = stageRef.current;
          if (!stage) return;
          const pos = stage.getPointerPosition();
          if (!pos) return;
          const cam = useBoardStore.getState().camera;
          const worldX = (pos.x - cam.x) / cam.scale;
          const worldY = (pos.y - cam.y) / cam.scale;
          touchToolStart.current = { clientX: touches[0].clientX, clientY: touches[0].clientY };

          if (activeTool === 'shape') {
            setShapeDraw({ startScreenX: pos.x, startScreenY: pos.y, startWorldX: worldX, startWorldY: worldY, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY });
          } else if (activeTool === 'section') {
            setSectionDraw({ startScreenX: pos.x, startScreenY: pos.y, startWorldX: worldX, startWorldY: worldY, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY });
          } else if (activeTool === 'table') {
            setTableDraw({ startScreenX: pos.x, startScreenY: pos.y, startWorldX: worldX, startWorldY: worldY, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY });
          } else if (activeTool === 'text') {
            setTextDraw({ startScreenX: pos.x, startScreenY: pos.y, startWorldX: worldX, startWorldY: worldY, currentScreenX: pos.x, currentWorldX: worldX });
          }
        }
      } else if (touches.length === 2) {
        e.evt.preventDefault();
        isPanning.current = false;
        const t0 = touches[0], t1 = touches[1];
        lastPinchDist.current = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        lastPinchMid.current = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
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
      } else if (touches.length === 1 && touchToolStart.current) {
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition();
        if (pos) {
          const { camera: cam } = useBoardStore.getState();
          const worldX = (pos.x - cam.x) / cam.scale;
          const worldY = (pos.y - cam.y) / cam.scale;
          if (shapeDraw)   setShapeDraw(prev => prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null);
          if (sectionDraw) setSectionDraw(prev => prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null);
          if (tableDraw)   setTableDraw(prev => prev ? { ...prev, currentScreenX: pos.x, currentScreenY: pos.y, currentWorldX: worldX, currentWorldY: worldY } : null);
          if (textDraw)    setTextDraw(prev => prev ? { ...prev, currentScreenX: pos.x, currentWorldX: worldX } : null);
        }
      } else if (touches.length === 2 && lastPinchDist.current !== null && lastPinchMid.current !== null) {
        const t0 = touches[0], t1 = touches[1];
        const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const newMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
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
    [setCamera, shapeDraw, sectionDraw, tableDraw, textDraw]
  );

  const handleTouchEnd = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current = null;
    }
    if (e.evt.touches.length === 0) {
      isPanning.current = false;
      lastTouchPos.current = null;

      if (touchToolStart.current) {
        const start = touchToolStart.current;
        touchToolStart.current = null;
        const changedTouches = e.evt.changedTouches;
        const endX = changedTouches[0]?.clientX ?? start.clientX;
        const endY = changedTouches[0]?.clientY ?? start.clientY;
        const moved = Math.hypot(endX - start.clientX, endY - start.clientY);
        const isTap = moved < 10;

        if (shapeDraw || sectionDraw || tableDraw || textDraw) {
          handleMouseUp();
          return;
        }

        if (isTap) {
          const stage = stageRef.current;
          if (!stage) return;
          const stageBox = stage.container().getBoundingClientRect();
          const screenX = start.clientX - stageBox.left;
          const screenY = start.clientY - stageBox.top;
          const { camera: cam } = useBoardStore.getState();
          const worldX = (screenX - cam.x) / cam.scale;
          const worldY = (screenY - cam.y) / cam.scale;

          if (activeTool === 'sticky') {
            addNode({ id: generateId(), type: 'sticky', x: worldX - 100, y: worldY - 80, text: '', color: randomStickyColor(), width: 200, height: 160, fontSizeMode: 'dynamic' } satisfies StickyNoteNode);
            setActiveTool('select');
          } else if (activeTool === 'sticker') {
            const rotation = Math.round((Math.random() * 30 - 15) * 10) / 10;
            addNode({ id: generateId(), type: 'sticker', src: activeSticker, x: worldX, y: worldY, width: 100, height: 100, rotation } satisfies StickerNode);
          } else if (activeTool === 'code') {
            addNode({ id: generateId(), type: 'codeblock', x: worldX - 250, y: worldY - 40, width: 500, height: 220, code: `SELECT\n  user_id,\n  COUNT(*) AS event_count\nFROM user_events\nGROUP BY 1\nLIMIT 100`, language: 'sql', title: 'Query', showLineNumbers: true } satisfies CodeBlockNode);
            setActiveTool('select');
          } else if (activeTool === 'link') {
            addNode({ id: generateId(), type: 'link', x: worldX - 160, y: worldY - 30, width: 320, height: 90, url: 'https://', displayMode: 'compact' } satisfies LinkNode);
            setActiveTool('select');
          } else if (activeTool === 'task') {
            addNode({ id: generateId(), type: 'taskcard', x: worldX - 140, y: worldY - 40, width: 280, title: 'New Task Card', tasks: [], color: resolveCssColor('--c-line-default') } satisfies TaskCardNode);
            setActiveTool('select');
          }
        }
      }
    } else if (e.evt.touches.length === 1) {
      lastTouchPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
  }, [activeTool, activeSticker, addNode, setActiveTool, shapeDraw, sectionDraw, tableDraw, textDraw, handleMouseUp]);

  // ── Anchor callbacks ──────────────────────────────────────────────────────
  const handleAnchorDown = useCallback(
    (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => {
      setDrawingLine({ fromNodeId: nodeId, fromAnchor: side, fromX: worldX, fromY: worldY, toX: worldX, toY: worldY });
    },
    []
  );

  const handleAnchorEnter = useCallback((nodeId: string, side: AnchorSide) => {
    setSnapTarget({ nodeId, side });
  }, []);

  const handleAnchorLeave = useCallback(() => {
    setSnapTarget(null);
  }, []);

  return {
    // draw state
    drawingLine,
    snapTarget,
    textCursorPos,
    setTextCursorPos,
    textDraw,
    shapeDraw,
    sectionDraw,
    tableDraw,
    marqueeDraw,
    stickerCursorPos,
    setStickerCursorPos,
    taskCursorPos,
    setTaskCursorPos,
    snapGuides,
    contextMenu,
    setContextMenu,
    // handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleAnchorDown,
    handleAnchorEnter,
    handleAnchorLeave,
    // drag helpers
    computeSnap,
    clearSnap,
    handleAltDragStart,
    handleAltDragEnd,
    handleMultiDragStart,
    handleMultiDragMove,
    handleMultiDragEnd,
    getShouldSaveHistory,
    handleNodeContextMenu,
    handleDragSettled,
    // for keyboard hook
    isPanning,
    cancelAll,
  };
}
