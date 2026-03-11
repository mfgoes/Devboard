import { useRef, useEffect } from 'react';
import { Group, Rect, Ellipse, Line, Text, Transformer, Circle } from 'react-konva';
import Konva from 'konva';
import { ShapeNode as ShapeNodeType, AnchorSide } from '../../types';
import { useBoardStore } from '../../store/boardStore';

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
  const { updateNode, selectIds, setEditingId, setActiveTool, activeTool, saveHistory } = useBoardStore();

  const isLineTool = activeTool === 'line';
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
