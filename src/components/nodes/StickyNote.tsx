import { useRef, useEffect, useState } from 'react';
import { Group, Rect, Text, Transformer, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { StickyNoteNode, AnchorSide, ConnectorNode } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { anchorCoords, cpOffset } from './ConnectorLine';
import { useTheme } from '../../theme';

function generateId() { return Math.random().toString(36).slice(2, 11); }

interface Props {
  node: StickyNoteNode;
  isSelected: boolean;
  isEditing: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
}

// Distance the dot sits outside the node border (world units)
const DOT_OFFSET = 20;

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
  right:  [ 14, -9], left:  [-74, -9],
  top:    [-30, -28], bottom: [-30, 12],
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
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const t = useTheme();
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory, addNode } = useBoardStore();

  const isLineTool = activeTool === 'line';
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);
  type SmartGhost = { fromSide: AnchorSide; targetId: string; targetSide: AnchorSide; toWorldX: number; toWorldY: number; pts: number[] };
  const [smartGhost, setSmartGhost] = useState<SmartGhost | null>(null);

  // Show anchors when selected, when line tool is active, or when a line is being drawn
  const showAnchors = (isSelected && !isEditing) || isLineTool || (isDrawingLine === true && !isEditing);

  useEffect(() => {
    if (isSelected && !isLineTool && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isLineTool]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool || activeTool === 'shape') return;
    e.cancelBubble = true;
    const { selectedIds } = useBoardStore.getState();
    if (e.evt.shiftKey) {
      if (selectedIds.includes(node.id)) {
        selectIds(selectedIds.filter((id) => id !== node.id));
      } else {
        selectIds([...selectedIds, node.id]);
      }
    } else {
      selectIds([node.id]);
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
    saveHistory();
    updateNode(node.id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth  = Math.max(120, group.width()  * group.scaleX());
    const newHeight = Math.max(80,  group.height() * group.scaleY());
    saveHistory();
    updateNode(node.id, {
      x: group.x(),
      y: group.y(),
      width:  newWidth,
      height: newHeight,
    });
    group.scaleX(1);
    group.scaleY(1);
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        draggable={!isLineTool}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onTap={handleTap}
        onDblTap={handleDblTap}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        opacity={isEditing ? 0 : 1}
      >
        {/* Card body */}
        <Rect
          width={node.width}
          height={node.height}
          fill={node.color}
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
        {/* Text */}
        <Text
          x={10}
          y={10}
          width={node.width - 20}
          height={node.height - 20}
          text={node.text || ''}
          fontSize={node.fontSize ?? 13}
          fontStyle={[node.bold ? 'bold' : '', node.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
          lineHeight={1.5}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fill="#1a1a2e"
          wrap="word"
          align="left"
          verticalAlign="top"
          listening={false}
        />

        {/* Anchor dots — shown when selected (any tool) or line tool active */}
        {showAnchors &&
          ANCHOR_DEFS.map(({ side, cx, cy, dx, dy }) => {
            const bx = cx(node.width, node.height);
            const by = cy(node.width, node.height);
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
                        fromX: node.x + bx, fromY: node.y + by,
                        toNodeId: ghost.targetId, toAnchor: ghost.targetSide,
                        toX: ghost.toWorldX, toY: ghost.toWorldY,
                        color: '#6366f1', strokeWidth: 2,
                        lineStyle: 'curved', strokeStyle: 'solid',
                        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
                      } as ConnectorNode);
                      setSmartGhost(null);
                      setHoveredAnchor(null);
                    } else {
                      onAnchorDown?.(node.id, side, node.x + bx, node.y + by);
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredAnchor(side);
                    onAnchorEnter?.(node.id, side);
                    // Find nearest connectable anchor within range
                    const PROXIMITY = 280;
                    const fwx = node.x + bx, fwy = node.y + by;
                    let best: { nodeId: string; side: AnchorSide; dist: number; wx: number; wy: number } | null = null;
                    for (const n of useBoardStore.getState().nodes) {
                      if (n.id === node.id || (n.type !== 'sticky' && n.type !== 'shape')) continue;
                      const rn = n as { x: number; y: number; width: number; height: number };
                      for (const ts of ['top', 'right', 'bottom', 'left'] as AnchorSide[]) {
                        const a = anchorCoords(rn, ts);
                        const d = Math.hypot(a.x - fwx, a.y - fwy);
                        if (d < PROXIMITY && (!best || d < best.dist)) best = { nodeId: n.id, side: ts, dist: d, wx: a.x, wy: a.y };
                      }
                    }
                    if (best) {
                      const dist = best.dist;
                      const tension = Math.min(Math.max(dist * 0.42, 55), 220);
                      const cp1 = cpOffset(side, tension);
                      const cp2 = cpOffset(best.side, tension);
                      const toLx = best.wx - node.x, toLy = best.wy - node.y;
                      setSmartGhost({
                        fromSide: side, targetId: best.nodeId, targetSide: best.side,
                        toWorldX: best.wx, toWorldY: best.wy,
                        pts: [bx, by, bx + cp1.dx, by + cp1.dy, toLx + cp2.dx, toLy + cp2.dy, toLx, toLy],
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
                    <Rect width={ghost ? 76 : 60} height={18} fill={t.panelBg} cornerRadius={4} opacity={0.92} />
                    <Text
                      width={ghost ? 76 : 60} height={18}
                      text={ghost ? 'Click to connect' : 'Connect'}
                      fontSize={10} fontFamily="'JetBrains Mono', monospace"
                      fill={t.textHi} align="center" verticalAlign="middle" listening={false}
                    />
                  </Group>
                )}
              </Group>
            );
          })}
      </Group>

      {/* Transformer — corners only; mid-side handles removed to avoid overlap with anchor dots */}
      {isSelected && !isLineTool && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          anchorSize={8}
          anchorCornerRadius={2}
          anchorStroke="#6366f1"
          anchorFill="#6366f1"
          borderStroke="#6366f1"
          borderDash={[4, 3]}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 120 || newBox.height < 80) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
