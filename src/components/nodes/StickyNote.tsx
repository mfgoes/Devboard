import { useRef, useEffect } from 'react';
import { Group, Rect, Text, Transformer, Circle } from 'react-konva';
import Konva from 'konva';
import { StickyNoteNode, AnchorSide } from '../../types';
import { useBoardStore } from '../../store/boardStore';

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
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory } = useBoardStore();

  const isLineTool = activeTool === 'line';

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
          fontSize={13}
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
            // Border connection point (local coords)
            const bx = cx(node.width, node.height);
            const by = cy(node.width, node.height);
            // Visual dot position (offset outside node)
            const vx = bx + dx;
            const vy = by + dy;
            const snapped = snapAnchor === side;
            return (
              <Circle
                key={side}
                x={vx}
                y={vy}
                radius={snapped ? 7 : 5}
                fill={snapped ? '#6366f1' : 'white'}
                stroke="#6366f1"
                strokeWidth={2}
                opacity={snapped ? 1 : 0.85}
                shadowEnabled={snapped}
                shadowColor="#6366f1"
                shadowBlur={10}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onAnchorDown?.(node.id, side, node.x + bx, node.y + by);
                }}
                onMouseEnter={(e) => {
                  const c = e.target as Konva.Circle;
                  c.radius(7);
                  c.fill('#6366f1');
                  c.opacity(1);
                  c.getLayer()?.batchDraw();
                  onAnchorEnter?.(node.id, side);
                }}
                onMouseLeave={(e) => {
                  const c = e.target as Konva.Circle;
                  if (!snapped) {
                    c.radius(5);
                    c.fill('white');
                    c.opacity(0.85);
                    c.getLayer()?.batchDraw();
                  }
                  onAnchorLeave?.();
                }}
              />
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
