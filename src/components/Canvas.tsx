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
import ConnectorLine, { anchorCoords, cpOffset } from './nodes/ConnectorLine';
import TextEditor from './TextEditor';
import TableCellEditor from './TableCellEditor';
import StickyColorPicker from './StickyColorPicker';
import EmojiReactionPicker from './EmojiReactionPicker';
import ShapeToolbar from './ShapeToolbar';
import ImageToolbar from './ImageToolbar';
import TextBlockToolbar from './TextBlockToolbar';
import ConnectorToolbar from './ConnectorToolbar';
import SectionToolbar from './SectionToolbar';
import TableToolbar from './TableToolbar';
import TableInsertControls from './TableInsertControls';
import TableReorderControls from './TableReorderControls';
import MultiSelectToolbar from './MultiSelectToolbar';
import ContextMenu from './ContextMenu';
import { AnchorSide, StickyNoteNode, ShapeNode, TaskCardNode, ImageNode } from '../types';
import CodeBlockComponent from './nodes/CodeBlock';
import ImageNodeComponent from './nodes/ImageNode';
import LinkNodeComponent from './nodes/LinkNode';
import TaskCardNodeComponent from './nodes/TaskCardNode';
import LinkToolbar from './LinkToolbar';
import { getWorkspaceName, openWorkspace } from '../utils/workspaceManager';
import { hasSeenImageNotice, markImageNoticeSeen } from './ImageFirstUseModal';
import ImageFirstUseModal from './ImageFirstUseModal';
import CodeBlockToolbar from './CodeBlockToolbar';
import { useTheme } from '../theme';
import { resolveCssColor } from '../utils/palette';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard';
import { useCanvasImageDrop } from '../hooks/useCanvasImageDrop';

export default function Canvas() {
  const t = useTheme();
  const stageRef     = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const spacePressed    = useRef(false);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  const pendingImagePos  = useRef<{ x: number; y: number } | null>(null);
  const pendingImageFile = useRef<{ file: File; worldX: number; worldY: number } | null>(null);
  const imageInputRef    = useRef<HTMLInputElement>(null);
  const [showImageNotice, setShowImageNotice] = useState(false);

  const {
    nodes,
    camera,
    activeTool,
    activeShapeKind,
    activeSticker,
    selectedIds,
    editingId,
    setCamera,
    addNode,
    setActiveTool,
  } = useBoardStore();

  // ── Interaction hook (mouse/touch handlers + draw states) ──────────────────
  const interaction = useCanvasInteraction({
    stageRef: stageRef as React.RefObject<Konva.Stage | null>,
    spacePressed,
    setCursorOverride,
    imageInputRef: imageInputRef as React.RefObject<HTMLInputElement | null>,
    pendingImagePos,
  });

  // ── Keyboard hook ──────────────────────────────────────────────────────────
  useCanvasKeyboard({
    spacePressed,
    isPanning: interaction.isPanning,
    setCursorOverride,
    cancelAll: interaction.cancelAll,
  });

  // ── Image/drop hook ────────────────────────────────────────────────────────
  const { placeImage, handleImageFileChange, handleDrop } = useCanvasImageDrop({
    pendingImagePos,
    pendingImageFile,
    setShowImageNotice,
  });

  // ── Window resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Wheel: pinch-zoom vs 2-finger pan ─────────────────────────────────────
  const processWheel = useCallback(
    (evt: WheelEvent, pointerX: number, pointerY: number) => {
      evt.preventDefault();
      if (evt.ctrlKey) {
        const { x, y, scale } = camera;
        const factor =
          Math.abs(evt.deltaY) < 50
            ? 1 - evt.deltaY * 0.018
            : evt.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newScale = Math.min(Math.max(scale * factor, 0.08), 8);
        const mousePointTo = { x: (pointerX - x) / scale, y: (pointerY - y) / scale };
        setCamera({
          scale: newScale,
          x: pointerX - mousePointTo.x * newScale,
          y: pointerY - mousePointTo.y * newScale,
        });
      } else {
        setCamera({ x: camera.x - evt.deltaX, y: camera.y - evt.deltaY });
      }
    },
    [camera, setCamera]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition()!;
      processWheel(e.evt, pointer.x, pointer.y);
    },
    [processWheel]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') return;
      processWheel(e, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [processWheel]);

  // ── Preview bezier line while drawing ──────────────────────────────────────
  function previewPoints(): number[] {
    const { drawingLine, snapTarget } = interaction;
    if (!drawingLine) return [];
    const { fromX, fromY, fromAnchor, toX, toY } = drawingLine;
    let tx = toX, ty = toY;
    if (snapTarget) {
      const toNode = nodes.find(
        (n) => n.id === snapTarget.nodeId && (n.type === 'sticky' || n.type === 'shape' || n.type === 'taskcard')
      ) as (StickyNoteNode | ShapeNode | TaskCardNode) | undefined;
      if (toNode) {
        const c = anchorCoords(toNode as StickyNoteNode | ShapeNode, snapTarget.side);
        tx = c.x; ty = c.y;
      }
    }
    const dist = Math.hypot(tx - fromX, ty - fromY);
    const tension = Math.min(Math.max(dist * 0.42, 55), 220);
    const cp1 = cpOffset(fromAnchor, tension);
    let toSide: AnchorSide = 'left';
    if (snapTarget) {
      toSide = snapTarget.side;
    } else {
      const dx = tx - fromX, dy = ty - fromY;
      toSide = Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0 ? 'left' : 'right'
        : dy >= 0 ? 'top' : 'bottom';
    }
    const cp2 = cpOffset(toSide, tension);
    return [fromX, fromY, fromX + cp1.dx, fromY + cp1.dy, tx + cp2.dx, ty + cp2.dy, tx, ty];
  }

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const { drawingLine, textDraw } = interaction;
  const toolCursor: Record<string, string> = {
    select: 'default', pan: 'grab', sticky: 'crosshair',
    line: drawingLine ? 'crosshair' : 'default',
    shape: 'crosshair', text: textDraw ? 'crosshair' : 'crosshair',
    pen: 'crosshair', section: 'crosshair', sticker: 'crosshair',
    table: 'crosshair', code: 'crosshair', image: 'crosshair', task: 'crosshair',
  };
  const cursor = cursorOverride ?? (drawingLine ? 'crosshair' : toolCursor[activeTool] ?? 'default');

  // ── Grid ───────────────────────────────────────────────────────────────────
  const dotSpacing = 24 * camera.scale;
  const gridOffX = ((camera.x % dotSpacing) + dotSpacing) % dotSpacing;
  const gridOffY = ((camera.y % dotSpacing) + dotSpacing) % dotSpacing;
  const dotScale  = Math.max(camera.scale, 0.4);
  const dotRadius = 1.2 * dotScale;

  // ── Selected node helpers ──────────────────────────────────────────────────
  const singleSelected =
    selectedIds.length === 1 && !editingId
      ? nodes.find((n) => n.id === selectedIds[0])
      : null;

  const selectedConnectorId =
    selectedIds.length === 1
      ? (nodes.find((n) => n.id === selectedIds[0] && n.type === 'connector')?.id ?? null)
      : null;

  const activeTextBlockId =
    (selectedIds.length === 1 &&
      nodes.find((n) => n.id === selectedIds[0] && n.type === 'textblock')?.id) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'textblock')?.id) ||
    null;

  const activeStickyId =
    (singleSelected?.type === 'sticky' ? singleSelected.id : null) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'sticky')?.id) ||
    null;

  // ── Text ghost geometry ────────────────────────────────────────────────────
  const ghostFontSize = Math.round(20 * camera.scale);
  const ghostWidth    = Math.round(240 * camera.scale);
  const ghostLineH    = Math.round(ghostFontSize * 1.5);

  const prevPoints = previewPoints();

  // Destructure interaction return for use in JSX
  const {
    snapTarget,
    textCursorPos, setTextCursorPos,
    shapeDraw, sectionDraw, tableDraw, marqueeDraw,
    stickerCursorPos, setStickerCursorPos,
    taskCursorPos, setTaskCursorPos,
    snapGuides, contextMenu, setContextMenu,
    handleMouseDown, handleMouseMove, handleMouseUp,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    handleAnchorDown, handleAnchorEnter, handleAnchorLeave,
    computeSnap, clearSnap,
    handleAltDragStart, handleAltDragEnd,
    handleMultiDragStart, handleMultiDragMove, handleMultiDragEnd,
    getShouldSaveHistory, handleNodeContextMenu, handleDragSettled,
  } = interaction;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        backgroundColor: t.canvasBg,
        cursor,
        backgroundImage: `radial-gradient(circle, ${t.dotColor} ${dotRadius}px, transparent ${dotRadius}px)`,
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${gridOffX}px ${gridOffY}px`,
      }}
      onMouseLeave={() => {
        if (activeTool === 'text' && !textDraw) setTextCursorPos(null);
        if (activeTool === 'sticker') setStickerCursorPos(null);
        if (activeTool === 'task') setTaskCursorPos(null);
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'CANVAS') {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, nodeIds: [] });
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Hidden file input for the Image tool */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />
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
        onContextMenu={(e) => {
          e.evt.preventDefault();
          if (e.target === e.currentTarget) {
            setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, nodeIds: [] });
          }
        }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Layer>
          {/* Sections — rendered first so they sit behind everything */}
          {nodes
            .filter((n) => n.type === 'section')
            .map((n) => (
              <SectionNodeComponent
                key={n.id}
                node={n as import('../types').SectionNode}
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
                node={n as import('../types').ConnectorNode}
                isSelected={selectedIds.includes(n.id)}
              />
            ))}

          {/* All content nodes in insertion order */}
          {nodes
            .filter((n) => n.type !== 'section' && n.type !== 'connector')
            .map((n) => {
              if (n.type === 'sticky') return (
                <StickyNote
                  key={n.id}
                  node={n as StickyNoteNode}
                  isSelected={selectedIds.includes(n.id)}
                  isEditing={editingId === n.id}
                  isDrawingLine={drawingLine !== null}
                  onAnchorDown={handleAnchorDown}
                  onAnchorEnter={handleAnchorEnter}
                  onAnchorLeave={handleAnchorLeave}
                  snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
                  onSnapMove={computeSnap}
                  onSnapEnd={clearSnap}
                  onAltDragStart={handleAltDragStart}
                  onAltDragEnd={handleAltDragEnd}
                  onMultiDragStart={handleMultiDragStart}
                  onMultiDragMove={handleMultiDragMove}
                  onMultiDragEnd={handleMultiDragEnd}
                  getShouldSaveHistory={getShouldSaveHistory}
                  onContextMenu={handleNodeContextMenu}
                  onDragSettled={handleDragSettled}
                />
              );
              if (n.type === 'shape') return (
                <ShapeNodeComponent
                  key={n.id}
                  node={n as ShapeNode}
                  isSelected={selectedIds.includes(n.id)}
                  isEditing={editingId === n.id}
                  isDrawingLine={drawingLine !== null}
                  onAnchorDown={handleAnchorDown}
                  onAnchorEnter={handleAnchorEnter}
                  onAnchorLeave={handleAnchorLeave}
                  snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
                  onSnapMove={computeSnap}
                  onSnapEnd={clearSnap}
                  onAltDragStart={handleAltDragStart}
                  onAltDragEnd={handleAltDragEnd}
                  onMultiDragStart={handleMultiDragStart}
                  onMultiDragMove={handleMultiDragMove}
                  onMultiDragEnd={handleMultiDragEnd}
                  getShouldSaveHistory={getShouldSaveHistory}
                  onContextMenu={handleNodeContextMenu}
                />
              );
              if (n.type === 'textblock') return (
                <TextBlock
                  key={n.id}
                  node={n as import('../types').TextBlockNode}
                  isSelected={selectedIds.includes(n.id)}
                  isEditing={editingId === n.id}
                  onSnapMove={computeSnap}
                  onSnapEnd={clearSnap}
                  onAltDragStart={handleAltDragStart}
                  onAltDragEnd={handleAltDragEnd}
                  onMultiDragStart={handleMultiDragStart}
                  onMultiDragMove={handleMultiDragMove}
                  onMultiDragEnd={handleMultiDragEnd}
                  getShouldSaveHistory={getShouldSaveHistory}
                  onContextMenu={handleNodeContextMenu}
                />
              );
              if (n.type === 'sticker') return (
                <StickerNodeComponent
                  key={n.id}
                  node={n as import('../types').StickerNode}
                  isSelected={selectedIds.includes(n.id)}
                  onSnapMove={computeSnap}
                  onSnapEnd={clearSnap}
                  onAltDragStart={handleAltDragStart}
                  onAltDragEnd={handleAltDragEnd}
                  onMultiDragStart={handleMultiDragStart}
                  onMultiDragMove={handleMultiDragMove}
                  onMultiDragEnd={handleMultiDragEnd}
                  getShouldSaveHistory={getShouldSaveHistory}
                  onContextMenu={handleNodeContextMenu}
                />
              );
              if (n.type === 'table') return (
                <TableNodeComponent
                  key={n.id}
                  node={n as import('../types').TableNode}
                  isSelected={selectedIds.includes(n.id)}
                  isDrawingLine={drawingLine !== null}
                  onAnchorDown={handleAnchorDown}
                  onAnchorEnter={handleAnchorEnter}
                  onAnchorLeave={handleAnchorLeave}
                  snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
                />
              );
              if (n.type === 'image') return (
                <ImageNodeComponent
                  key={n.id}
                  node={n as ImageNode}
                  isSelected={selectedIds.includes(n.id)}
                  onSnapMove={computeSnap}
                  onSnapEnd={clearSnap}
                  onAltDragStart={handleAltDragStart}
                  onAltDragEnd={handleAltDragEnd}
                  onMultiDragStart={handleMultiDragStart}
                  onMultiDragMove={handleMultiDragMove}
                  onMultiDragEnd={handleMultiDragEnd}
                  getShouldSaveHistory={getShouldSaveHistory}
                  onContextMenu={handleNodeContextMenu}
                />
              );
              return null;
            })}

          {/* Group bounding boxes */}
          {(() => {
            const groupMap = new Map<string, { x: number; y: number; r: number; b: number }>();
            for (const n of nodes) {
              const gid = (n as { groupId?: string }).groupId;
              if (!gid) continue;
              const nx_ = (n as { x?: number }).x ?? 0;
              const ny_ = (n as { y?: number }).y ?? 0;
              const nw_ = (n as { width?: number }).width ?? 0;
              const nh_ = (n as { height?: number }).height ?? 0;
              const prev = groupMap.get(gid);
              if (prev) {
                groupMap.set(gid, {
                  x: Math.min(prev.x, nx_), y: Math.min(prev.y, ny_),
                  r: Math.max(prev.r, nx_ + nw_), b: Math.max(prev.b, ny_ + nh_),
                });
              } else {
                groupMap.set(gid, { x: nx_, y: ny_, r: nx_ + nw_, b: ny_ + nh_ });
              }
            }
            const PAD = 14;
            return Array.from(groupMap.entries()).map(([gid, bb]) => (
              <Line
                key={`group-${gid}`}
                x={bb.x - PAD}
                y={bb.y - PAD}
                points={[
                  0, 0,
                  bb.r - bb.x + PAD * 2, 0,
                  bb.r - bb.x + PAD * 2, bb.b - bb.y + PAD * 2,
                  0, bb.b - bb.y + PAD * 2,
                  0, 0,
                ]}
                stroke={resolveCssColor('--c-line')}
                strokeWidth={1.5}
                dash={[8, 5]}
                opacity={0.5}
                listening={false}
              />
            ));
          })()}

          {/* Snap alignment guides */}
          {snapGuides.map((g, i) => (
            <Line
              key={`snap-${i}`}
              points={g.orientation === 'v'
                ? [g.pos, g.start, g.pos, g.end]
                : [g.start, g.pos, g.end, g.pos]
              }
              stroke={resolveCssColor('--c-line')}
              strokeWidth={1}
              opacity={0.55}
              dash={[6, 4]}
              listening={false}
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

      {/* ── Task card HTML overlays ────────────────────────────────────────── */}
      {nodes
        .filter((n) => n.type === 'taskcard')
        .map((n) => (
          <TaskCardNodeComponent
            key={n.id}
            node={n as TaskCardNode}
            camera={camera}
            isSelected={selectedIds.includes(n.id)}
            isDrawingLine={drawingLine !== null}
            snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
            onAnchorDown={handleAnchorDown}
            onAnchorEnter={handleAnchorEnter}
            onAnchorLeave={handleAnchorLeave}
          />
        ))}

      {/* ── Text ghost: hover preview before clicking ──────────────────────── */}
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

      {/* ── Text drag-to-width preview ─────────────────────────────────────── */}
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

      {/* ── Shape drag-to-size preview ─────────────────────────────────────── */}
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

      {/* ── Section drag-to-size preview ──────────────────────────────────── */}
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

      {/* ── Table drag-to-size preview ─────────────────────────────────────── */}
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
            <div style={{
              display: 'flex', alignItems: 'center', gap: pad * 0.6,
              padding: `${pad * 0.8}px ${pad}px`, borderBottom: '1px solid var(--c-border)',
            }}>
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

      {/* ── CodeBlock overlays ─────────────────────────────────────────────── */}
      {nodes.filter((n) => n.type === 'codeblock').map((n) => (
        <CodeBlockComponent
          key={n.id}
          node={n as import('../types').CodeBlockNode}
          isSelected={selectedIds.includes(n.id)}
          isDrawingLine={drawingLine !== null}
          onAnchorDown={handleAnchorDown}
          onAnchorEnter={handleAnchorEnter}
          onAnchorLeave={handleAnchorLeave}
          snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
        />
      ))}

      {/* ── Link overlays ──────────────────────────────────────────────────── */}
      {nodes.filter((n) => n.type === 'link').map((n) => (
        <LinkNodeComponent
          key={n.id}
          node={n as import('../types').LinkNode}
          isSelected={selectedIds.includes(n.id)}
          isDrawingLine={drawingLine !== null}
          onAnchorDown={handleAnchorDown}
          onAnchorEnter={handleAnchorEnter}
          onAnchorLeave={handleAnchorLeave}
          snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
          onContextMenu={handleNodeContextMenu}
        />
      ))}

      {/* HTML overlays */}
      <TextEditor />
      <TableCellEditor />
      {activeStickyId && (
        <StickyColorPicker nodeId={activeStickyId} isEditing={!!editingId && editingId === activeStickyId} />
      )}
      {nodes
        .filter((n) => n.type === 'sticky')
        .map((n) => {
          const isNodeSelected = selectedIds.includes(n.id) && !editingId;
          const hasReaction = !!(n as import('../types').StickyNoteNode).reaction;
          if (!hasReaction && !isNodeSelected) return null;
          return (
            <EmojiReactionPicker
              key={n.id}
              nodeId={n.id}
              isSelected={isNodeSelected}
            />
          );
        })}
      {singleSelected?.type === 'shape'     && <ShapeToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'image'     && <ImageToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'codeblock' && <CodeBlockToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'link'      && <LinkToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'section'   && <SectionToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'table' && (
        <>
          <TableToolbar nodeId={singleSelected.id} />
          <TableInsertControls nodeId={singleSelected.id} />
          <TableReorderControls nodeId={singleSelected.id} />
        </>
      )}
      {activeTextBlockId  && <TextBlockToolbar nodeId={activeTextBlockId} />}
      {selectedConnectorId && <ConnectorToolbar nodeId={selectedConnectorId} />}
      {selectedIds.length > 1 && !editingId && <MultiSelectToolbar />}

      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {/* Image first-use notice */}
      {showImageNotice && (
        <ImageFirstUseModal
          isWorkspaceOpen={!!getWorkspaceName()}
          onClose={() => {
            markImageNoticeSeen();
            setShowImageNotice(false);
            const pending = pendingImageFile.current;
            pendingImageFile.current = null;
            if (pending) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const src = ev.target?.result as string;
                const imgEl = new window.Image();
                imgEl.onload = () => {
                  const maxW = 600;
                  const w = Math.min(imgEl.width, maxW);
                  const h = Math.round(imgEl.height * (w / imgEl.width));
                  addNode({
                    id: Math.random().toString(36).slice(2, 11),
                    type: 'image',
                    x: pending.worldX - w / 2,
                    y: pending.worldY - h / 2,
                    width: w,
                    height: h,
                    src,
                    assetName: pending.file.name,
                  } satisfies ImageNode);
                  setActiveTool('select');
                };
                imgEl.src = src;
              };
              reader.readAsDataURL(pending.file);
            }
          }}
          onOpenFolder={async () => {
            const result = await openWorkspace();
            markImageNoticeSeen();
            setShowImageNotice(false);
            if (result) {
              useBoardStore.getState().setWorkspaceName(result.name);
              if (result.data) useBoardStore.getState().loadBoard(result.data);
              const pending = pendingImageFile.current;
              pendingImageFile.current = null;
              if (pending) placeImage(pending.file, pending.worldX, pending.worldY);
            }
          }}
        />
      )}
    </div>
  );
}
