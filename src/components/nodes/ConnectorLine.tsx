import { Group, Line, Circle } from 'react-konva';
import Konva from 'konva';
import {
  ConnectorNode, StickyNoteNode, ShapeNode, AnchorSide,
  LineStyle, StrokeStyle, ArrowHeadStyle,
} from '../../types';

type RectLike = { x: number; y: number; width: number; height: number };
import { useBoardStore } from '../../store/boardStore';

// ── Geometry helpers (exported for Canvas.tsx preview) ────────────────────────

export function anchorCoords(
  node: RectLike,
  side: AnchorSide
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  switch (side) {
    case 'top':    return { x: cx,          y: node.y };
    case 'bottom': return { x: cx,          y: node.y + node.height };
    case 'left':   return { x: node.x,      y: cy };
    case 'right':  return { x: node.x + node.width, y: cy };
  }
}

export function smartAnchors(a: RectLike, b: RectLike): [AnchorSide, AnchorSide] {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

export function cpOffset(side: AnchorSide, t: number): { dx: number; dy: number } {
  switch (side) {
    case 'right':  return { dx:  t, dy: 0 };
    case 'left':   return { dx: -t, dy: 0 };
    case 'bottom': return { dx: 0,  dy: t };
    case 'top':    return { dx: 0,  dy: -t };
  }
}

// ── Path computation ──────────────────────────────────────────────────────────

const SIDE_VEC: Record<AnchorSide, [number, number]> = {
  top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0],
};

/** Build orthogonal (right-angle) waypoints between two anchor points. */
function orthogonalWaypoints(
  fx: number, fy: number, fromSide: AnchorSide,
  tx: number, ty: number, toSide: AnchorSide,
  gap = 40
): number[] {
  const [fdx, fdy] = SIDE_VEC[fromSide];
  const [tdx, tdy] = SIDE_VEC[toSide];

  // First "exit" point and last "entry" point with a gap from each anchor
  const ex = fx + fdx * gap;
  const ey = fy + fdy * gap;
  const nx = tx + tdx * gap;
  const ny = ty + tdy * gap;

  const fromH = fdx !== 0;
  const toH   = tdx !== 0;

  if (fromH && toH) {
    // Both horizontal exits: bridge with vertical midpoint segment
    const mx = (ex + nx) / 2;
    return [fx, fy, ex, ey, mx, ey, mx, ny, nx, ny, tx, ty];
  }
  if (!fromH && !toH) {
    // Both vertical exits: bridge with horizontal midpoint segment
    const my = (ey + ny) / 2;
    return [fx, fy, ex, ey, ex, my, nx, my, nx, ny, tx, ty];
  }
  if (fromH) {
    // Horizontal exit → vertical approach: L-shape
    return [fx, fy, ex, ey, nx, ey, nx, ny, tx, ty];
  }
  // Vertical exit → horizontal approach: L-shape
  return [fx, fy, ex, ey, ex, ny, nx, ny, tx, ty];
}

function buildPoints(
  from: { x: number; y: number }, fromSide: AnchorSide,
  to:   { x: number; y: number }, toSide:   AnchorSide,
  lineStyle: LineStyle, tension: number
): { pts: number[]; bezier: boolean } {
  if (lineStyle === 'curved') {
    const cp1 = cpOffset(fromSide, tension);
    const cp2 = cpOffset(toSide,   tension);
    return {
      pts: [
        from.x, from.y,
        from.x + cp1.dx, from.y + cp1.dy,
        to.x + cp2.dx,   to.y + cp2.dy,
        to.x, to.y,
      ],
      bezier: true,
    };
  }
  if (lineStyle === 'straight') {
    return { pts: [from.x, from.y, to.x, to.y], bezier: false };
  }
  return { pts: orthogonalWaypoints(from.x, from.y, fromSide, to.x, to.y, toSide), bezier: false };
}

/** Angle (radians) the line approaches its end point — used for arrowhead orientation. */
function endAngle(pts: number[], _bezier: boolean): number {
  const n = pts.length;
  if (n < 4) return 0;
  return Math.atan2(pts[n - 1] - pts[n - 3], pts[n - 2] - pts[n - 4]);
}

/** Angle (radians) the line approaches its start point (from inside the line outward). */
function startAngle(pts: number[], _bezier: boolean): number {
  if (pts.length < 4) return 0;
  return Math.atan2(pts[1] - pts[3], pts[0] - pts[2]);
}

/** Trim the end of a point list by `amount` world units along the approach direction. */
function trimEnd(pts: number[], angle: number, amount: number): number[] {
  if (amount === 0) return pts;
  const t = [...pts];
  const n = t.length;
  t[n - 2] -= amount * Math.cos(angle);
  t[n - 1] -= amount * Math.sin(angle);
  return t;
}

/** Trim the start of a point list by `amount` world units along the approach direction. */
function trimStart(pts: number[], angle: number, amount: number): number[] {
  if (amount === 0) return pts;
  const t = [...pts];
  t[0] -= amount * Math.cos(angle);
  t[1] -= amount * Math.sin(angle);
  return t;
}

// ── Arrow head shapes ─────────────────────────────────────────────────────────

interface HeadProps {
  tx: number; ty: number; angle: number;
  style: ArrowHeadStyle; color: string; sw: number;
}

function ArrowHead({ tx, ty, angle, style, color, sw }: HeadProps) {
  if (style === 'none') return null;

  if (style === 'arrow') {
    const hl = Math.max(10, sw * 3.5);
    const hw = Math.PI / 5; // 36° half-angle
    return (
      <Line
        points={[
          tx - hl * Math.cos(angle - hw), ty - hl * Math.sin(angle - hw),
          tx, ty,
          tx - hl * Math.cos(angle + hw), ty - hl * Math.sin(angle + hw),
        ]}
        stroke={color} strokeWidth={sw}
        lineCap="round" lineJoin="round"
        listening={false}
      />
    );
  }

  if (style === 'flat') {
    const bl = Math.max(7, sw * 3);
    const pa = angle + Math.PI / 2;
    return (
      <Line
        points={[
          tx + bl * Math.cos(pa), ty + bl * Math.sin(pa),
          tx - bl * Math.cos(pa), ty - bl * Math.sin(pa),
        ]}
        stroke={color} strokeWidth={sw + 1}
        lineCap="round" listening={false}
      />
    );
  }

  if (style === 'circle') {
    return (
      <Circle x={tx} y={ty} radius={Math.max(4, sw * 2)}
        fill={color} listening={false}
      />
    );
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  node: ConnectorNode;
  isSelected: boolean;
}

export default function ConnectorLine({ node, isSelected }: Props) {
  const { nodes, selectIds, selectedIds, setActiveTool } = useBoardStore();

  const fromNode = nodes.find(n => n.id === node.fromNodeId && (n.type === 'sticky' || n.type === 'shape')) as (StickyNoteNode | ShapeNode) | undefined;
  const toNode   = nodes.find(n => n.id === node.toNodeId   && (n.type === 'sticky' || n.type === 'shape')) as (StickyNoteNode | ShapeNode) | undefined;

  let resolvedFrom: AnchorSide = node.fromAnchor ?? 'right';
  let resolvedTo:   AnchorSide = node.toAnchor   ?? 'left';
  if (!node.fromAnchor && !node.toAnchor && fromNode && toNode) {
    [resolvedFrom, resolvedTo] = smartAnchors(fromNode, toNode);
  }

  const from = fromNode ? anchorCoords(fromNode, resolvedFrom) : { x: node.fromX, y: node.fromY };
  const to   = toNode   ? anchorCoords(toNode,   resolvedTo)   : { x: node.toX,   y: node.toY   };

  // Resolve styles — fall back to legacy fields for old saved boards
  const lineStyle:      LineStyle      = node.lineStyle      ?? 'curved';
  const strokeStyle:    StrokeStyle    = node.strokeStyle    ?? (node.dashed ? 'dashed' : 'solid');
  const legacyHead:     ArrowHeadStyle = node.arrowHead      ?? (node.hasArrow !== false ? 'arrow' : 'none');
  const arrowHeadEnd:   ArrowHeadStyle = node.arrowHeadEnd   ?? legacyHead;
  const arrowHeadStart: ArrowHeadStyle = node.arrowHeadStart ?? 'none';

  const dist    = Math.hypot(to.x - from.x, to.y - from.y);
  const tension = Math.min(Math.max(dist * 0.42, 55), 220);

  const { pts: rawPts, bezier } = buildPoints(from, resolvedFrom, to, resolvedTo, lineStyle, tension);

  const angleEnd   = endAngle(rawPts, bezier);
  const angleStart = startAngle(rawPts, bezier);

  const circleREnd   = arrowHeadEnd   === 'circle' ? Math.max(4, node.strokeWidth * 2) : 0;
  const circleRStart = arrowHeadStart === 'circle' ? Math.max(4, node.strokeWidth * 2) : 0;

  let pts = rawPts;
  pts = trimEnd(pts, angleEnd, circleREnd);
  pts = trimStart(pts, angleStart, circleRStart);

  const dash = strokeStyle === 'dashed' ? [8, 5]
             : strokeStyle === 'dotted' ? [2, 5]
             : undefined;

  const strokeColor = isSelected ? '#818cf8' : node.color;

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (useBoardStore.getState().activeTool === 'shape') return;
    e.cancelBubble = true;
    selectIds(e.evt.shiftKey ? [...selectedIds, node.id] : [node.id]);
    if (!['select', 'pan'].includes(useBoardStore.getState().activeTool)) setActiveTool('line');
  };

  const handleTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    selectIds([node.id]);
    if (!['select', 'pan'].includes(useBoardStore.getState().activeTool)) setActiveTool('line');
  };

  return (
    <Group onClick={handleClick} onTap={handleTap}>
      <Line
        points={pts}
        bezier={bezier}
        stroke={strokeColor}
        strokeWidth={node.strokeWidth}
        fill="transparent"
        dash={dash}
        lineCap="round"
        lineJoin="round"
        shadowEnabled={isSelected}
        shadowColor="#6366f1"
        shadowBlur={8}
        shadowOpacity={0.5}
        hitStrokeWidth={Math.max(node.strokeWidth + 12, 14)}
      />
      <ArrowHead
        tx={to.x} ty={to.y} angle={angleEnd}
        style={arrowHeadEnd} color={strokeColor} sw={node.strokeWidth}
      />
      <ArrowHead
        tx={from.x} ty={from.y} angle={angleStart}
        style={arrowHeadStart} color={strokeColor} sw={node.strokeWidth}
      />
    </Group>
  );
}
