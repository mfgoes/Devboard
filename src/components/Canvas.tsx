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
import CodeBlockComponent from './nodes/CodeBlock';
import ImageNodeComponent from './nodes/ImageNode';
import LinkNodeComponent from './nodes/LinkNode';
import TaskCardNodeComponent from './nodes/TaskCardNode';
import DocumentNodeComponent from './nodes/DocumentNode';
import { hasSeenImageNotice, markImageNoticeSeen } from './ImageFirstUseModal';
import ImageFirstUseModal from './ImageFirstUseModal';
import CanvasToolPreviews from './CanvasToolPreviews';
import CanvasToolbars from './CanvasToolbars';
import { AnchorSide, StickyNoteNode, ShapeNode, TaskCardNode, ImageNode, DocumentNode, LinkNode, CodeBlockNode } from '../types';
import { getWorkspaceName, openWorkspace } from '../utils/workspaceManager';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import { useTheme } from '../theme';
import { resolveCssColor } from '../utils/palette';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard';
import { useCanvasImageDrop } from '../hooks/useCanvasImageDrop';

function toAnchorRect(node: StickyNoteNode | ShapeNode | TaskCardNode | ImageNode | DocumentNode | LinkNode | CodeBlockNode) {
  if (node.type === 'taskcard') {
    return { x: node.x, y: node.y, width: node.width, height: node.height ?? 120 };
  }
  return node;
}

interface CanvasProps {
  onBackgroundInteract?: () => void;
}

export default function Canvas({ onBackgroundInteract }: CanvasProps) {
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

  const { nodes, camera, activeTool, selectedIds, editingId, setCamera, addNode, setActiveTool } = useBoardStore();

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
        (n) => n.id === snapTarget.nodeId && (
          n.type === 'sticky' ||
          n.type === 'shape' ||
          n.type === 'taskcard' ||
          n.type === 'image' ||
          n.type === 'document' ||
          n.type === 'link' ||
          n.type === 'codeblock'
        )
      ) as (StickyNoteNode | ShapeNode | TaskCardNode | ImageNode | DocumentNode | LinkNode | CodeBlockNode) | undefined;
      if (toNode) {
        const c = anchorCoords(toAnchorRect(toNode), snapTarget.side);
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

  const prevPoints = previewPoints();

  const {
    snapTarget,
    textCursorPos, setTextCursorPos,
    shapeDraw, sectionDraw, tableDraw, marqueeDraw,
    stickerCursorPos, setStickerCursorPos,
    taskCursorPos, setTaskCursorPos,
    documentCursorPos, setDocumentCursorPos,
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
        if (activeTool === 'document') setDocumentCursorPos(null);
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
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onBackgroundInteract?.();
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => {
          if (e.target === e.currentTarget) onBackgroundInteract?.();
          handleTouchStart(e);
        }}
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
          {/* Sections rendered first, sit behind everything */}
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

          {/* Connectors below stickies */}
          {nodes
            .filter((n) => n.type === 'connector')
            .map((n) => (
              <ConnectorLine
                key={n.id}
                node={n as import('../types').ConnectorNode}
                isSelected={selectedIds.includes(n.id)}
              />
            ))}

          {/* Content nodes in insertion order */}
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

      {/* HTML node overlays (rendered outside Konva) */}
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

      {nodes.filter((n) => n.type === 'document').map((n) => (
        <DocumentNodeComponent
          key={n.id}
          node={n as import('../types').DocumentNode}
          isSelected={selectedIds.includes(n.id)}
          isDrawingLine={drawingLine !== null}
          onAnchorDown={handleAnchorDown}
          onAnchorEnter={handleAnchorEnter}
          onAnchorLeave={handleAnchorLeave}
          snapAnchor={snapTarget?.nodeId === n.id ? snapTarget.side : null}
        />
      ))}

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

      {/* Tool preview ghosts */}
      <CanvasToolPreviews
        textCursorPos={textCursorPos}
        textDraw={textDraw}
        shapeDraw={shapeDraw}
        sectionDraw={sectionDraw}
        tableDraw={tableDraw}
        stickerCursorPos={stickerCursorPos}
        taskCursorPos={taskCursorPos}
        documentCursorPos={documentCursorPos}
        marqueeDraw={marqueeDraw}
      />

      {/* Toolbars, editors, color pickers */}
      <CanvasToolbars contextMenu={contextMenu} setContextMenu={setContextMenu} />

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
              applyWorkspaceSyncFromOpenResult(result);
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
