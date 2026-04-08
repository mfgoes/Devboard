import { useRef, useEffect, useState, useCallback } from 'react';
import { Group, Rect, Text, Transformer, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { StickyNoteNode, AnchorSide, ConnectorNode } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { anchorCoords, cpOffset } from './ConnectorLine';
import { useTheme } from '../../theme';
import { isRichText, layoutRichText } from '../../utils/richText';

function generateId() { return Math.random().toString(36).slice(2, 11); }

// ── Color lerp helpers ────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function lerpColor(a: string, b: string, t: number): string {
  if (!a.startsWith('#') || !b.startsWith('#')) return t < 0.5 ? a : b;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// ── Rich text renderer ────────────────────────────────────────────────────────
function StickyRichText({ node, liveWidth }: { node: StickyNoteNode; liveWidth?: number }) {
  const effectiveWidth = liveWidth ?? node.width;
  const runs = layoutRichText(
    node.text,
    effectiveWidth - 20,
    node.fontSize ?? 13,
    1.5,
    node.bold ?? false,
    node.italic ?? false,
  );
  const fs = node.fontSize ?? 13;
  return (
    <>
      {runs.map((run, i) => (
        <Text
          key={i}
          x={10 + run.x}
          y={10 + run.y}
          text={run.text}
          fontSize={fs}
          fontStyle={[run.bold ? 'bold' : '', run.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
          textDecoration={run.underline ? 'underline' : ''}
          lineHeight={1}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fill={run.link ? '#2563eb' : '#1a1a2e'}
          listening={false}
        />
      ))}
    </>
  );
}

interface Props {
  node: StickyNoteNode;
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
  onDragSettled?: (nodeId: string) => void;
}

// Distance the dot sits outside the node border (world units)
const DOT_OFFSET = 32;

// Each anchor: border connection point (cx/cy) + visual offset (dx/dy)
const ANCHOR_DEFS: {
  side: AnchorSide;
  cx: (w: number, h: number) => number;
  cy: (w: number, h: number) => number;
  dx: number;
  dy: number;
}[] = [
  { side: 'top',    cx: (w) => w / 2, cy: () => 0,      dx: 0,           dy: -DOT_OFFSET },
  { side: 'bottom', cx: (w) => w / 2, cy: (_, h) => h,  dx: 0,           dy:  DOT_OFFSET },
  { side: 'left',   cx: () => 0,      cy: (_, h) => h/2, dx: -DOT_OFFSET, dy: 0           },
  { side: 'right',  cx: (w) => w,     cy: (_, h) => h/2, dx:  DOT_OFFSET, dy: 0           },
];

// ── Anchor visual helpers ─────────────────────────────────────────────────────
const GHOST_LEN = 90;
const GHOST_DIR: Record<AnchorSide, [number, number]> = {
  right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1],
};
// Open chevron pointing outward from center (0,0)
const CHEVRON: Record<AnchorSide, number[]> = {
  right:  [-4, -3.5,  3,  0, -4,  3.5],
  left:   [ 4, -3.5, -3,  0,  4,  3.5],
  top:    [-3.5,  4,  0, -3,  3.5,  4],
  bottom: [-3.5, -4,  0,  3,  3.5, -4],
};
// Tooltip pill offset from dot center [x, y]
const TOOLTIP_OFFSET: Record<AnchorSide, [number, number]> = {
  right:  [ 14, -9], left:  [-102, -9],
  top:    [-44, -28], bottom: [-44, 12],
};

export default function StickyNote({
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
  onDragSettled,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const t = useTheme();
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory, addNode } = useBoardStore();

  const isLineTool = activeTool === 'line';
  const [liveScale, setLiveScale] = useState({ sx: 1, sy: 1 });
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);

  // ── Drag wobble ──────────────────────────────────────────────────────────────
  const [wobbleRot, setWobbleRot] = useState(0);
  const wobble = useRef({ rot: 0, vel: 0, prevCenterX: 0, raf: 0 });

  const runSpring = useCallback(() => {
    const w = wobble.current;
    w.vel = (w.vel + (-w.rot * 0.18)) * 0.75;
    w.rot += w.vel;
    if (Math.abs(w.rot) < 0.05 && Math.abs(w.vel) < 0.05) {
      w.rot = 0; w.vel = 0;
      setWobbleRot(0);
      return;
    }
    setWobbleRot(w.rot);
    w.raf = requestAnimationFrame(runSpring);
  }, []);

  useEffect(() => () => cancelAnimationFrame(wobble.current.raf), []);

  // ── Color fade when node.color changes ───────────────────────────────────────
  const [displayColor, setDisplayColor] = useState(node.color);
  const colorAnim = useRef<{ raf: number } | null>(null);
  const prevColor = useRef(node.color);

  useEffect(() => {
    if (node.color === prevColor.current) return;
    const from = prevColor.current;
    const to = node.color;
    prevColor.current = to;
    if (colorAnim.current) cancelAnimationFrame(colorAnim.current.raf);
    const DURATION = 320;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / DURATION);
      const eased = 1 - Math.pow(1 - t, 2); // ease-out quad
      setDisplayColor(lerpColor(from, to, eased));
      if (t < 1) {
        colorAnim.current = { raf: requestAnimationFrame(tick) };
      } else {
        colorAnim.current = null;
      }
    };
    colorAnim.current = { raf: requestAnimationFrame(tick) };
  }, [node.color]);

  useEffect(() => () => { if (colorAnim.current) cancelAnimationFrame(colorAnim.current.raf); }, []);
  type SmartGhost = { fromSide: AnchorSide; targetId: string; targetSide: AnchorSide; toWorldX: number; toWorldY: number; pts: number[] };
  const [smartGhost, setSmartGhost] = useState<SmartGhost | null>(null);
  // Track drag position so anchor dots (rendered outside Group) follow during drag
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  // Show anchors when selected, when line tool is active, or when a line is being drawn
  const showAnchors = (isSelected && !isEditing) || isLineTool || (isDrawingLine === true && !isEditing);

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
    // If this node belongs to a group, expand selection to all group members
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
    if (!['select', 'pan'].includes(activeTool)) setActiveTool('sticky');
  };

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (isLineTool) return;
    setEditingId(node.id);
  };

  // Mobile touch handlers — tap to select; tap again if already selected to edit
  const handleTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (isLineTool) return;
    e.cancelBubble = true;
    const { selectedIds, activeTool: tool } = useBoardStore.getState();
    if (tool === 'sticker' || tool === 'pan') return;
    if (selectedIds.includes(node.id)) {
      setEditingId(node.id);
    } else {
      selectIds([node.id]);
      if (!['select', 'pan'].includes(tool)) setActiveTool('sticky');
    }
  };

  const handleDblTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    if (isLineTool) return;
    setEditingId(node.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
    updateNode(node.id, { x: e.target.x() - e.target.offsetX(), y: e.target.y() - e.target.offsetY() });
    onDragSettled?.(node.id);
  };

  const handleTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    setLiveScale({ sx: group.scaleX(), sy: group.scaleY() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth  = Math.max(120, group.width()  * group.scaleX());
    const newHeight = Math.max(80,  group.height() * group.scaleY());
    saveHistory();
    updateNode(node.id, {
      x: group.x() - group.offsetX(),
      y: group.y() - group.offsetY(),
      width:  newWidth,
      height: newHeight,
    });
    group.scaleX(1);
    group.scaleY(1);
    setLiveScale({ sx: 1, sy: 1 });
  };

  // World-space origin of the node (follows drag in real time)
  const nx = dragPos?.x ?? node.x;
  const ny = dragPos?.y ?? node.y;

  return (
    <>
      {/* Card content — Transformer attaches ONLY to this Group */}
      <Group
        ref={groupRef}
        x={node.x + node.width / 2}
        y={node.y + node.height / 2}
        offsetX={node.width / 2}
        offsetY={node.height / 2}
        rotation={wobbleRot}
        width={node.width}
        height={node.height}
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
          cancelAnimationFrame(wobble.current.raf);
          wobble.current.prevCenterX = e.target.x();
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
          // Wobble: tilt in direction of horizontal movement
          const cx = e.target.x();
          const deltaX = cx - wobble.current.prevCenterX;
          wobble.current.prevCenterX = cx;
          const target = Math.max(-7, Math.min(7, deltaX * 0.85));
          wobble.current.rot += (target - wobble.current.rot) * 0.28;
          wobble.current.vel = target * 0.08;
          setWobbleRot(wobble.current.rot);
        }}
        onDragEnd={(e) => {
          setDragPos(null); onSnapEnd?.(); onAltDragEnd?.(); onMultiDragEnd?.();
          wobble.current.raf = requestAnimationFrame(runSpring);
          handleDragEnd(e);
        }}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        {/* Card body — always visible (even while editing) */}
        <Rect
          width={node.width}
          height={node.height}
          fill={displayColor}
          cornerRadius={3}
          shadowColor="rgba(0,0,0,0.5)"
          shadowBlur={12}
          shadowOffset={{ x: 2, y: 6 }}
          shadowOpacity={0.5}
        />
        {/* Folded corner */}
        <Rect
          x={node.width - 18}
          y={0}
          width={18}
          height={18}
          fill="rgba(0,0,0,0.12)"
          cornerRadius={[0, 3, 0, 0]}
        />
        {/* Placeholder — hide while editing */}
        {!node.text && !isEditing && (
          <Text
            x={10 / liveScale.sx}
            y={10 / liveScale.sy}
            scaleX={1 / liveScale.sx}
            scaleY={1 / liveScale.sy}
            width={node.width * liveScale.sx - 20}
            height={node.height * liveScale.sy - 20}
            text="Type anything."
            fontSize={node.fontSize ?? 13}
            fontStyle="italic"
            lineHeight={1.5}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fill="rgba(26,26,46,0.35)"
            wrap="word"
            align="left"
            verticalAlign="top"
            listening={false}
          />
        )}
        {/* Text — hide while editing (contenteditable overlay takes over) */}
        {node.text && !isEditing && !isRichText(node.text) && (
          <Text
            x={10 / liveScale.sx}
            y={10 / liveScale.sy}
            scaleX={1 / liveScale.sx}
            scaleY={1 / liveScale.sy}
            width={node.width * liveScale.sx - 20}
            height={node.height * liveScale.sy - 20}
            text={node.text}
            fontSize={node.fontSize ?? 13}
            fontStyle={[node.bold ? 'bold' : '', node.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
            textDecoration={node.underline ? 'underline' : ''}
            lineHeight={1.5}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fill="#1a1a2e"
            wrap="word"
            align="left"
            verticalAlign="top"
            listening={false}
          />
        )}
        {node.text && !isEditing && isRichText(node.text) && (
          <Group scaleX={1 / liveScale.sx} scaleY={1 / liveScale.sy}>
            <StickyRichText node={node} liveWidth={node.width * liveScale.sx} />
          </Group>
        )}
        {/* Lock indicator */}
        {node.locked && (
          <Text
            x={node.width - 20}
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
          // Border midpoint in world space
          const bx = nx + cx(node.width, node.height);
          const by = ny + cy(node.width, node.height);
          // Dot visual position in world space
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
              {/* Dot */}
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
              {/* Directional arrow inside dot */}
              {active && (
                <Line
                  x={vx} y={vy} points={CHEVRON[side]}
                  stroke="white" strokeWidth={2}
                  lineCap="round" lineJoin="round" listening={false}
                />
              )}
              {/* Tooltip pill */}
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

      {/* Transformer — solid outline on node edge; side handles snap to square or wide */}
      {isSelected && !isLineTool && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']}
          anchorStyleFunc={(anchor) => {
            const name = anchor.name();
            const isHoriz = name.includes('top-center') || name.includes('bottom-center');
            const isVert  = name.includes('middle-left') || name.includes('middle-right');
            if (!isHoriz && !isVert) return;
            anchor.opacity(0);
            const tr = anchor.getParent();
            if (!tr) return;
            if (isHoriz) {
              const w = tr.width() * 0.75;
              anchor.width(w);
              anchor.offsetX(w / 2);
            } else {
              const h = tr.height() * 0.75;
              anchor.height(h);
              anchor.offsetY(h / 2);
            }
          }}
          anchorSize={10}
          anchorCornerRadius={2}
          anchorStroke="#6366f1"
          anchorStrokeWidth={2}
          anchorFill="white"
          borderStroke="#6366f1"
          borderStrokeWidth={2}
          padding={0}
          boundBoxFunc={(oldBox, newBox) => {
            const widthChanged  = Math.abs(newBox.width  - oldBox.width)  > 0.5;
            const heightChanged = Math.abs(newBox.height - oldBox.height) > 0.5;

            // Side-only drag: snap width to square (1:1) or wide (2:1)
            if (widthChanged && !heightChanged) {
              const h = newBox.height;
              const snapped = newBox.width < h * 1.5 ? Math.max(120, h) : Math.max(120, h * 2);
              const xMoved = Math.abs(newBox.x - oldBox.x) > 0.5;
              if (xMoved) {
                // Left handle: keep right edge fixed
                return { ...newBox, x: oldBox.x + oldBox.width - snapped, width: snapped };
              }
              return { ...newBox, width: snapped };
            }

            // Height-only drag: free, enforce minimum
            if (heightChanged && !widthChanged) {
              const h = Math.max(80, newBox.height);
              const yMoved = Math.abs(newBox.y - oldBox.y) > 0.5;
              if (yMoved) return { ...newBox, y: oldBox.y + oldBox.height - h, height: h };
              return { ...newBox, height: h };
            }

            // Corner drag: free scaling, enforce minimums
            if (newBox.width < 120 || newBox.height < 80) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
