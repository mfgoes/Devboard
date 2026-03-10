import { Arrow } from 'react-konva';
import Konva from 'konva';
import { ConnectorNode, StickyNoteNode, AnchorSide } from '../../types';
import { useBoardStore } from '../../store/boardStore';

// ── Geometry helpers (also exported for use in Canvas) ────────────────────────

export function anchorCoords(
  node: StickyNoteNode,
  side: AnchorSide
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  switch (side) {
    case 'top':    return { x: cx, y: node.y };
    case 'bottom': return { x: cx, y: node.y + node.height };
    case 'left':   return { x: node.x, y: cy };
    case 'right':  return { x: node.x + node.width, y: cy };
  }
}

/** Pick the two sides that face each other given the relative center positions. */
export function smartAnchors(
  a: StickyNoteNode,
  b: StickyNoteNode
): [AnchorSide, AnchorSide] {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Bezier control-point offset vector for a given exit direction. */
export function cpOffset(side: AnchorSide, t: number): { dx: number; dy: number } {
  switch (side) {
    case 'right':  return { dx: t,  dy: 0  };
    case 'left':   return { dx: -t, dy: 0  };
    case 'bottom': return { dx: 0,  dy: t  };
    case 'top':    return { dx: 0,  dy: -t };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  node: ConnectorNode;
  isSelected: boolean;
}

export default function ConnectorLine({ node, isSelected }: Props) {
  const { nodes, selectIds, selectedIds } = useBoardStore();

  const fromNode = nodes.find(
    (n) => n.id === node.fromNodeId && n.type === 'sticky'
  ) as StickyNoteNode | undefined;

  const toNode = nodes.find(
    (n) => n.id === node.toNodeId && n.type === 'sticky'
  ) as StickyNoteNode | undefined;

  // Resolve anchor sides — use stored value or auto-pick if null
  let resolvedFrom: AnchorSide = node.fromAnchor ?? 'right';
  let resolvedTo: AnchorSide = node.toAnchor ?? 'left';
  if (!node.fromAnchor && !node.toAnchor && fromNode && toNode) {
    [resolvedFrom, resolvedTo] = smartAnchors(fromNode, toNode);
  }

  const from = fromNode
    ? anchorCoords(fromNode, resolvedFrom)
    : { x: node.fromX, y: node.fromY };
  const to = toNode
    ? anchorCoords(toNode, resolvedTo)
    : { x: node.toX, y: node.toY };

  // Scale bezier tension with distance for natural curves
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const tension = Math.min(Math.max(dist * 0.42, 55), 220);
  const cp1 = cpOffset(resolvedFrom, tension);
  const cp2 = cpOffset(resolvedTo, tension);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      selectIds([...selectedIds, node.id]);
    } else {
      selectIds([node.id]);
    }
  };

  const strokeColor = isSelected ? '#818cf8' : node.color;

  return (
    <Arrow
      points={[
        from.x, from.y,
        from.x + cp1.dx, from.y + cp1.dy,
        to.x + cp2.dx,   to.y + cp2.dy,
        to.x, to.y,
      ]}
      bezier={true}
      stroke={strokeColor}
      strokeWidth={node.strokeWidth}
      fill={strokeColor}
      dash={node.dashed ? [8, 5] : undefined}
      pointerLength={node.hasArrow ? 10 : 0}
      pointerWidth={node.hasArrow ? 7 : 0}
      lineCap="round"
      lineJoin="round"
      shadowEnabled={isSelected}
      shadowColor="#6366f1"
      shadowBlur={8}
      shadowOpacity={0.5}
      // Fat transparent hit area makes clicking the line easy
      hitStrokeWidth={Math.max(node.strokeWidth + 12, 14)}
      onClick={handleClick}
    />
  );
}
