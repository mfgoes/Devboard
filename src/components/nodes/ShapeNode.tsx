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
}

const DOT_OFFSET = 20;

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
  right:  [ 14, -9], left:  [-74, -9],
  top:    [-30, -28], bottom: [-30, 12],
};

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
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const t = useTheme();
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory, addNode } = useBoardStore();

  const isLineTool = activeTool === 'line';
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);
  type SmartGhost = { fromSide: AnchorSide; targetId: string; targetSide: AnchorSide; toWorldX: number; toWorldY: number; pts: number[] };
  const [smartGhost, setSmartGhost] = useState<SmartGhost | null>(null);
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
    saveHistory();
    updateNode(node.id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth  = Math.max(40, group.width()  * group.scaleX());
    const newHeight = Math.max(40, group.height() * group.scaleY());
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

  return (
    <>
      <Group
        ref={groupRef}
        x={node.x}
        y={node.y}
        width={w}
        height={h}
        draggable={!isLineTool}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onTap={handleTap}
        onDblTap={handleDblTap}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        opacity={isEditing ? 0 : 1}
      >
        {renderShape()}

        {/* Label */}
        {node.text && (
          <Text
            x={8}
            y={8}
            width={w - 16}
            height={h - 16}
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

        {/* Anchor dots */}
        {showAnchors &&
          ANCHOR_DEFS.map(({ side, cx, cy, dx, dy }) => {
            const bx = cx(w, h);
            const by = cy(w, h);
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
                      const tension = Math.min(Math.max(best.dist * 0.42, 55), 220);
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
                {active && (
                  <Line
                    x={vx} y={vy} points={CHEVRON[side]}
                    stroke="white" strokeWidth={2}
                    lineCap="round" lineJoin="round" listening={false}
                  />
                )}
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
            if (newBox.width < 40 || newBox.height < 40) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
