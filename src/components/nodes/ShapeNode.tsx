import { useRef, useEffect, useState } from 'react';
import { Group, Rect, Ellipse, Line, Text, Transformer, Circle } from 'react-konva';
import Konva from 'konva';
import { ShapeNode as ShapeNodeType, AnchorSide, ConnectorNode } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { anchorCoords, cpOffset } from './ConnectorLine';
import { useTheme } from '../../theme';

function generateId() { return Math.random().toString(36).slice(2, 11); }

interface Props {
  node: ShapeNodeType;
  isSelected: boolean;
  isEditing: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
  onSnapMove?: (nodeId: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onSnapEnd?: () => void;
  onAltDragStart?: (nodeId: string) => void;
  onAltDragEnd?: () => void;
  onMultiDragStart?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragMove?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragEnd?: () => void;
  getShouldSaveHistory?: () => boolean;
  onContextMenu?: (nodeId: string, x: number, y: number) => void;
}

const DOT_OFFSET = 32;

const ANCHOR_DEFS: {
  side: AnchorSide;
  cx: (w: number, h: number) => number;
  cy: (w: number, h: number) => number;
  dx: number;
  dy: number;
}[] = [
  { side: 'top',    cx: (w) => w / 2,     cy: () => 0,           dx: 0,           dy: -DOT_OFFSET },
  { side: 'bottom', cx: (w) => w / 2,     cy: (_, h) => h,       dx: 0,           dy:  DOT_OFFSET },
  { side: 'left',   cx: () => 0,          cy: (_, h) => h / 2,   dx: -DOT_OFFSET, dy: 0           },
  { side: 'right',  cx: (w) => w,         cy: (_, h) => h / 2,   dx:  DOT_OFFSET, dy: 0           },
];

// ── Anchor visual helpers ─────────────────────────────────────────────────────
const GHOST_LEN = 90;
const GHOST_DIR: Record<AnchorSide, [number, number]> = {
  right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1],
};
const CHEVRON: Record<AnchorSide, number[]> = {
  right:  [-4, -3.5,  3,  0, -4,  3.5],
  left:   [ 4, -3.5, -3,  0,  4,  3.5],
  top:    [-3.5,  4,  0, -3,  3.5,  4],
  bottom: [-3.5, -4,  0,  3,  3.5, -4],
};
const TOOLTIP_OFFSET: Record<AnchorSide, [number, number]> = {
  right:  [ 14, -9], left:  [-102, -9],
  top:    [-44, -28], bottom: [-44, 12],
};

// Generates a curved-arrow rotation cursor SVG pointing in `deg` degrees (0 = East/right)
function makeRotateCursor(deg: number): string {
  // 24×24 — closer to macOS native cursor size; white outline for dark-background legibility
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${Math.round(deg)} 12 12)"><path d="M4.5 12 A7.5 7.5 0 0 1 19.5 12" stroke="white" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M22.5 12 L16.5 9 L18 12 L16.5 15 Z" fill="white" stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M4.5 12 A7.5 7.5 0 0 1 19.5 12" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M22.5 12 L16.5 9 L18 12 L16.5 15 Z" fill="#1a1a2e"/></g></svg>`;
  return `url("data:image/svg+xml;base64,${btoa(svg)}") 12 12, pointer`;
}

function luminance(hex: string): number {
  if (hex === 'transparent' || !hex.startsWith('#')) return 200;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export default function ShapeNode({
  node,
  isSelected,
  isEditing,
  isDrawingLine,
  onAnchorDown,
  onAnchorEnter,
  onAnchorLeave,
  snapAnchor,
  onSnapMove,
  onSnapEnd,
  onAltDragStart,
  onAltDragEnd,
  onMultiDragStart,
  onMultiDragMove,
  onMultiDragEnd,
  getShouldSaveHistory,
  onContextMenu,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const t = useTheme();
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory, addNode } = useBoardStore();

  const isLineTool = activeTool === 'line';
  const [liveScale, setLiveScale] = useState({ sx: 1, sy: 1 });
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);
  type SmartGhost = { fromSide: AnchorSide; targetId: string; targetSide: AnchorSide; toWorldX: number; toWorldY: number; pts: number[] };
  const [smartGhost, setSmartGhost] = useState<SmartGhost | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const showAnchors = (isSelected && !isEditing) || isLineTool || (isDrawingLine === true && !isEditing);

  // Rotation tracking via window events
  type RotateState = { worldCx: number; worldCy: number; startAngle: number; startRot: number; stageEl: HTMLElement };
  const rotateRef = useRef<RotateState | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!rotateRef.current) return;
      const { worldCx, worldCy, startAngle, startRot, stageEl } = rotateRef.current;
      const camera = useBoardStore.getState().camera;
      const rect = stageEl.getBoundingClientRect();
      const wx = (e.clientX - rect.left - camera.x) / camera.scale;
      const wy = (e.clientY - rect.top  - camera.y) / camera.scale;
      let newRot = startRot + (Math.atan2(wy - worldCy, wx - worldCx) * 180 / Math.PI - startAngle);
      if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
      updateNode(node.id, { rotation: newRot });
    };
    const onUp = () => {
      if (!rotateRef.current) return;
      rotateRef.current.stageEl.style.cursor = '';
      saveHistory();
      rotateRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [node.id, updateNode, saveHistory]);

  useEffect(() => {
    if (isSelected && !isLineTool && !node.locked && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isLineTool, node.locked]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool || activeTool === 'pan' || activeTool === 'shape' || activeTool === 'sticker') return;
    e.cancelBubble = true;
    const { selectedIds, nodes: allNodes } = useBoardStore.getState();
    const groupId = node.groupId;
    const idsToSelect = groupId
      ? allNodes.filter((n) => (n as { groupId?: string }).groupId === groupId).map((n) => n.id)
      : [node.id];
    if (e.evt.shiftKey) {
      const alreadySelected = idsToSelect.every((id) => selectedIds.includes(id));
      if (alreadySelected) {
        selectIds(selectedIds.filter((id) => !idsToSelect.includes(id)));
      } else {
        selectIds([...new Set([...selectedIds, ...idsToSelect])]);
      }
    } else {
      selectIds(idsToSelect);
    }
    if (!['select', 'pan'].includes(activeTool)) setActiveTool('shape');
  };

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (isLineTool) return;
    setEditingId(node.id);
  };

  const handleTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (isLineTool) return;
    e.cancelBubble = true;
    const { selectedIds, activeTool: tool } = useBoardStore.getState();
    if (tool === 'sticker' || tool === 'pan') return;
    if (selectedIds.includes(node.id)) {
      setEditingId(node.id);
    } else {
      selectIds([node.id]);
      if (!['select', 'pan'].includes(tool)) setActiveTool('shape');
    }
  };

  const handleDblTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    if (isLineTool) return;
    setEditingId(node.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    setDragPos(null);
    if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
    // Group is center-offset, so x/y from target is the center; subtract offset to get top-left
    updateNode(node.id, {
      x: e.target.x() - e.target.offsetX(),
      y: e.target.y() - e.target.offsetY(),
    });
  };

  const handleTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    setLiveScale({ sx: group.scaleX(), sy: group.scaleY() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth  = Math.max(20, w * group.scaleX());
    const newHeight = Math.max(20, h * group.scaleY());
    saveHistory();
    updateNode(node.id, {
      x: group.x() - group.offsetX(),
      y: group.y() - group.offsetY(),
      width:  newWidth,
      height: newHeight,
      rotation: group.rotation(),
    });
    group.scaleX(1);
    group.scaleY(1);
    setLiveScale({ sx: 1, sy: 1 });
  };

  const { width: w, height: h } = node;
  const autoTextColor = luminance(node.fill) < 128 ? '#e2e8f0' : '#1a1a2e';
  const textColor = node.fontColor ?? autoTextColor;
  const fontStyle = [node.bold ? 'bold' : '', node.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';

  const shapeProps = {
    fill: node.fill === 'transparent' ? 'transparent' : node.fill,
    stroke: node.stroke === 'transparent' ? undefined : node.stroke,
    strokeWidth: node.stroke === 'transparent' ? 0 : node.strokeWidth,
    shadowColor: 'rgba(0,0,0,0.4)',
    shadowBlur: 10,
    shadowOffset: { x: 2, y: 4 },
    shadowOpacity: 0.45,
  };

  function renderShape() {
    switch (node.kind) {
      case 'rect':
        return <Rect x={0} y={0} width={w} height={h} cornerRadius={4} {...shapeProps} />;
      case 'ellipse':
        return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...shapeProps} />;
      case 'diamond':
        return (
          <Line
            points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
            closed={true}
            {...shapeProps}
          />
        );
      case 'triangle':
        return (
          <Line
            points={[w / 2, 0, w, h, 0, h]}
            closed={true}
            {...shapeProps}
          />
        );
    }
  }

  const nx = dragPos?.x ?? node.x;
  const ny = dragPos?.y ?? node.y;

  // Rotation corner zones — positioned at actual rotated corners (world space)
  const rot = node.rotation ?? 0;
  const rad = rot * Math.PI / 180;
  const cosR = Math.cos(rad), sinR = Math.sin(rad);
  const worldCx = nx + w / 2, worldCy = ny + h / 2;
  function rotatedPt(dx: number, dy: number): [number, number] {
    return [worldCx + dx * cosR - dy * sinR, worldCy + dx * sinR + dy * cosR];
  }
  const ZONE = 16, GAP = 6;
  // cursorDeg: clockwise tangent direction at each corner (0=East), offset by shape rotation
  const rotZones = [
    { key: 'tl', dx: -w / 2, dy: -h / 2, cursorDeg:   0 + rot },
    { key: 'tr', dx:  w / 2, dy: -h / 2, cursorDeg:  90 + rot },
    { key: 'br', dx:  w / 2, dy:  h / 2, cursorDeg: 180 + rot },
    { key: 'bl', dx: -w / 2, dy:  h / 2, cursorDeg: 270 + rot },
  ].map(({ key, dx, dy, cursorDeg }) => {
    const mag = Math.sqrt(dx * dx + dy * dy);
    const scale = 1 + GAP / mag;
    const [wx, wy] = rotatedPt(dx * scale, dy * scale);
    return { key, wx: wx - ZONE / 2, wy: wy - ZONE / 2, cursor: makeRotateCursor(cursorDeg) };
  });

  return (
    <>
      {/* Shape content — Transformer attaches ONLY to this Group */}
      <Group
        ref={groupRef}
        x={node.x + w / 2}
        y={node.y + h / 2}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={rot}
        width={w}
        height={h}
        draggable={!isLineTool && !node.locked}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onTap={handleTap}
        onDblTap={handleDblTap}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          e.evt.stopPropagation();
          onContextMenu?.(node.id, e.evt.clientX, e.evt.clientY);
        }}
        onDragStart={(e) => {
          if (e.evt.altKey) onAltDragStart?.(node.id);
          const ox = e.target.offsetX(), oy = e.target.offsetY();
          onMultiDragStart?.(node.id, e.target.x() - ox, e.target.y() - oy);
        }}
        onDragMove={(e) => {
          const ox = e.target.offsetX(), oy = e.target.offsetY();
          let tlx = e.target.x() - ox, tly = e.target.y() - oy;
          if (onSnapMove) {
            const snapped = onSnapMove(node.id, tlx, tly, node.width, node.height);
            tlx = snapped.x; tly = snapped.y;
            e.target.x(tlx + ox); e.target.y(tly + oy);
          }
          setDragPos({ x: tlx, y: tly });
          onMultiDragMove?.(node.id, tlx, tly);
        }}
        onDragEnd={(e) => { onSnapEnd?.(); onAltDragEnd?.(); onMultiDragEnd?.(); handleDragEnd(e); }}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        {renderShape()}

        {/* Label — hidden while editing (textarea overlay takes over) */}
        {node.text && !isEditing && (
          <Text
            x={8 / liveScale.sx}
            y={8 / liveScale.sy}
            scaleX={1 / liveScale.sx}
            scaleY={1 / liveScale.sy}
            width={w * liveScale.sx - 16}
            height={h * liveScale.sy - 16}
            text={node.text}
            fontSize={node.fontSize ?? 14}
            fontStyle={fontStyle}
            lineHeight={1.45}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fill={textColor}
            align={node.textAlign ?? 'center'}
            verticalAlign="middle"
            wrap="word"
            listening={false}
          />
        )}
        {/* Lock indicator */}
        {node.locked && (
          <Text
            x={w - 18}
            y={4}
            text="🔒"
            fontSize={11}
            listening={false}
          />
        )}
      </Group>

      {/* Anchor dots — rendered OUTSIDE the Group so Transformer bbox is not affected */}
      {showAnchors &&
        ANCHOR_DEFS.map(({ side, cx, cy, dx, dy }) => {
          const bx = nx + cx(w, h);
          const by = ny + cy(w, h);
          const vx = bx + dx;
          const vy = by + dy;
          const snapped = snapAnchor === side;
          const hovered = hoveredAnchor === side;
          const active  = snapped || hovered;
          const [gdx, gdy] = GHOST_DIR[side];
          const [tx, ty]   = TOOLTIP_OFFSET[side];
          const ghost = hovered && smartGhost?.fromSide === side ? smartGhost : null;
          return (
            <Group key={side}>
              {/* Ghost: smart bezier to nearby target, or simple dashed ray */}
              {hovered && (
                ghost ? (
                  <Line
                    points={ghost.pts} bezier={true}
                    stroke="#6366f1" strokeWidth={2}
                    opacity={0.35} lineCap="round" listening={false}
                  />
                ) : (
                  <>
                    <Line
                      points={[bx, by, bx + gdx * GHOST_LEN, by + gdy * GHOST_LEN]}
                      stroke="#6366f1" strokeWidth={2}
                      opacity={0.22} dash={[6, 4]} lineCap="round" listening={false}
                    />
                    <Line
                      x={bx + gdx * GHOST_LEN} y={by + gdy * GHOST_LEN}
                      points={CHEVRON[side]}
                      stroke="#6366f1" strokeWidth={2}
                      opacity={0.35} lineCap="round" lineJoin="round" listening={false}
                    />
                  </>
                )
              )}
              <Circle
                x={vx} y={vy}
                radius={active ? 8 : 5}
                fill={active ? '#6366f1' : 'white'}
                stroke="#6366f1" strokeWidth={2}
                opacity={active ? 1 : 0.85}
                shadowEnabled={active} shadowColor="#6366f1" shadowBlur={12}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  if (ghost) {
                    addNode({
                      id: generateId(), type: 'connector',
                      fromNodeId: node.id, fromAnchor: side,
                      fromX: bx, fromY: by,
                      toNodeId: ghost.targetId, toAnchor: ghost.targetSide,
                      toX: ghost.toWorldX, toY: ghost.toWorldY,
                      color: '#6366f1', strokeWidth: 2,
                      lineStyle: 'curved', strokeStyle: 'solid',
                      arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
                    } as ConnectorNode);
                    setSmartGhost(null);
                    setHoveredAnchor(null);
                  } else {
                    onAnchorDown?.(node.id, side, bx, by);
                  }
                }}
                onMouseEnter={() => {
                  setHoveredAnchor(side);
                  onAnchorEnter?.(node.id, side);
                  const PROXIMITY = 280;
                  let best: { nodeId: string; side: AnchorSide; dist: number; wx: number; wy: number } | null = null;
                  for (const n of useBoardStore.getState().nodes) {
                    if (n.id === node.id || (n.type !== 'sticky' && n.type !== 'shape' && n.type !== 'table' && n.type !== 'codeblock')) continue;
                    const rn = n.type === 'table'
                      ? { x: n.x, y: n.y, width: (n as import('../../types').TableNode).colWidths.reduce((a: number, b: number) => a + b, 0), height: (n as import('../../types').TableNode).rowHeights.reduce((a: number, b: number) => a + b, 0) }
                      : n as { x: number; y: number; width: number; height: number };
                    for (const ts of ['top', 'right', 'bottom', 'left'] as AnchorSide[]) {
                      const a = anchorCoords(rn, ts);
                      const d = Math.hypot(a.x - bx, a.y - by);
                      if (d < PROXIMITY && (!best || d < best.dist)) best = { nodeId: n.id, side: ts, dist: d, wx: a.x, wy: a.y };
                    }
                  }
                  if (best) {
                    const tension = Math.min(Math.max(best.dist * 0.42, 55), 220);
                    const cp1 = cpOffset(side, tension);
                    const cp2 = cpOffset(best.side, tension);
                    setSmartGhost({
                      fromSide: side, targetId: best.nodeId, targetSide: best.side,
                      toWorldX: best.wx, toWorldY: best.wy,
                      pts: [bx, by, bx + cp1.dx, by + cp1.dy, best.wx + cp2.dx, best.wy + cp2.dy, best.wx, best.wy],
                    });
                  } else {
                    setSmartGhost(null);
                  }
                }}
                onMouseLeave={() => { setHoveredAnchor(null); setSmartGhost(null); onAnchorLeave?.(); }}
              />
              {active && (
                <Line
                  x={vx} y={vy} points={CHEVRON[side]}
                  stroke="white" strokeWidth={2}
                  lineCap="round" lineJoin="round" listening={false}
                />
              )}
              {hovered && (
                <Group x={vx + tx} y={vy + ty}>
                  <Rect width={ghost ? 102 : 60} height={18} fill={t.panelBg} cornerRadius={4} opacity={0.92} />
                  <Text
                    width={ghost ? 102 : 60} height={18}
                    text={ghost ? 'Click to connect' : 'Connect'}
                    fontSize={10} fontFamily="'JetBrains Mono', monospace"
                    fill={t.textHi} align="center" verticalAlign="middle" listening={false}
                  />
                </Group>
              )}
            </Group>
          );
        })}

      {/* Corner rotation zones — transparent hit areas outside each corner */}
      {isSelected && !isLineTool && !isEditing &&
        rotZones.map(({ key, wx, wy, cursor }) => (
          <Rect
            key={`rot-${key}`}
            x={wx} y={wy}
            width={ZONE} height={ZONE}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = cursor; }}
            onMouseLeave={(e) => { if (!rotateRef.current) e.target.getStage()!.container().style.cursor = ''; }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const pointer = stage.getPointerPosition()!;
              const camera = useBoardStore.getState().camera;
              const mwx = (pointer.x - camera.x) / camera.scale;
              const mwy = (pointer.y - camera.y) / camera.scale;
              const startAngle = Math.atan2(mwy - worldCy, mwx - worldCx) * 180 / Math.PI;
              rotateRef.current = { worldCx, worldCy, startAngle, startRot: rot, stageEl: stage.container() };
              stage.container().style.cursor = cursor;
            }}
          />
        ))}

      {isSelected && !isLineTool && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          anchorStyleFunc={(anchor) => {
            const name = anchor.name();
            const isHoriz = name.includes('top-center') || name.includes('bottom-center');
            const isVert  = name.includes('middle-left') || name.includes('middle-right');
            if (!isHoriz && !isVert) return;
            anchor.opacity(0);
            const tr = anchor.getParent();
            if (!tr) return;
            if (isHoriz) {
              const aw = tr.width() * 0.75;
              anchor.width(aw);
              anchor.offsetX(aw / 2);
            } else {
              const ah = tr.height() * 0.75;
              anchor.height(ah);
              anchor.offsetY(ah / 2);
            }
          }}
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']}
          anchorSize={10}
          anchorCornerRadius={2}
          anchorStroke="#6366f1"
          anchorStrokeWidth={2}
          anchorFill="white"
          borderStroke="#6366f1"
          borderStrokeWidth={2}
          padding={0}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
