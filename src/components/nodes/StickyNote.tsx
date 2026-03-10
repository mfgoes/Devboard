import { useRef, useEffect } from 'react';
import { Group, Rect, Text, Transformer, Circle } from 'react-konva';
import Konva from 'konva';
import { StickyNoteNode, AnchorSide } from '../../types';
import { useBoardStore } from '../../store/boardStore';

interface Props {
  node: StickyNoteNode;
  isSelected: boolean;
  isEditing: boolean;
  // Line tool anchor callbacks (optional — only wired when line tool is active)
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  /** Which anchor on this specific node is currently snapped during line draw */
  snapAnchor?: AnchorSide | null;
}

const ANCHOR_DEFS: { side: AnchorSide; lx: (w: number, h: number) => number; ly: (w: number, h: number) => number }[] = [
  { side: 'top',    lx: (w) => w / 2,  ly: () => 0    },
  { side: 'bottom', lx: (w) => w / 2,  ly: (_, h) => h },
  { side: 'left',   lx: () => 0,       ly: (_, h) => h / 2 },
  { side: 'right',  lx: (w) => w,      ly: (_, h) => h / 2 },
];

export default function StickyNote({
  node,
  isSelected,
  isEditing,
  onAnchorDown,
  onAnchorEnter,
  onAnchorLeave,
  snapAnchor,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const { updateNode, selectIds, setEditingId, activeTool } = useBoardStore();

  const isLineTool = activeTool === 'line';

  useEffect(() => {
    if (isSelected && !isLineTool && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isLineTool]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isLineTool) return; // anchor mousedown handles selection in line mode
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
  };

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (isLineTool) return;
    setEditingId(node.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    updateNode(node.id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth = Math.max(120, group.width() * group.scaleX());
    const newHeight = Math.max(80, group.height() * group.scaleY());
    updateNode(node.id, {
      x: group.x(),
      y: group.y(),
      width: newWidth,
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

        {/* Anchor dots — shown when line tool is active */}
        {isLineTool &&
          ANCHOR_DEFS.map(({ side, lx, ly }) => {
            const ax = lx(node.width, node.height);
            const ay = ly(node.width, node.height);
            const snapped = snapAnchor === side;
            return (
              <Circle
                key={side}
                x={ax}
                y={ay}
                radius={snapped ? 7 : 5}
                fill={snapped ? '#6366f1' : '#ffffff'}
                stroke="#6366f1"
                strokeWidth={2}
                shadowEnabled={snapped}
                shadowColor="#6366f1"
                shadowBlur={8}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  // World coordinates = group position + local offset
                  onAnchorDown?.(node.id, side, node.x + ax, node.y + ay);
                }}
                onMouseEnter={() => onAnchorEnter?.(node.id, side)}
                onMouseLeave={() => onAnchorLeave?.()}
              />
            );
          })}
      </Group>

      {/* Transformer — only when selected and NOT in line-draw mode */}
      {isSelected && !isLineTool && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
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
