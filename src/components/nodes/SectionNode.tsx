import { useRef, useEffect } from 'react';
import { Group, Rect, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { SectionNode as SectionNodeType, CanvasNode } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { FONTS } from '../../utils/fonts';

const NEUTRAL_DARK  = '#64748b';
const NEUTRAL_LIGHT = '#94a3b8';

function resolveColor(color: string, theme: string): string {
  if (color === 'neutral') return theme === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  return color;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTextColorForBackground(hex: string): string {
  // Calculate relative luminance (WCAG formula)
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;

  // If background is light (luminance > 0.5), use dark text; otherwise use white
  return luminance > 0.5 ? '#1a1a2e' : 'white';
}

type NonConnectorNode = Exclude<CanvasNode, { type: 'connector' }>;

function getContainedChildren(nodes: CanvasNode[], section: SectionNodeType): NonConnectorNode[] {
  return nodes.filter((n): n is NonConnectorNode => {
    if (n.type === 'section' || n.type === 'connector') return false;
    const nc = n as NonConnectorNode;
    const w = 'width' in nc ? (nc as { width: number }).width : 100;
    const h = 'height' in nc ? (nc as { height: number }).height : 40;
    const cx = nc.x + w / 2;
    const cy = nc.y + h / 2;
    return (
      cx > section.x && cx < section.x + section.width &&
      cy > section.y && cy < section.y + section.height
    );
  });
}

interface Props {
  node: SectionNodeType;
  isSelected: boolean;
  isEditing: boolean;
}

export default function SectionNodeComponent({ node, isSelected, isEditing }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const { updateNode, updateNodes, selectIds, setEditingId, saveHistory, theme } = useBoardStore();

  const dragStartRef = useRef<{
    sectionX: number;
    sectionY: number;
    children: { id: string; x: number; y: number }[];
  } | null>(null);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (['section', 'pan'].includes(useBoardStore.getState().activeTool)) return;
    selectIds([node.id]);
  };

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    setEditingId(node.id);
  };

  const handleTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    const { selectedIds, activeTool: tool } = useBoardStore.getState();
    if (tool === 'pan') return;
    if (selectedIds.includes(node.id)) {
      setEditingId(node.id);
    } else {
      selectIds([node.id]);
    }
  };

  const handleDragStart = () => {
    const { nodes } = useBoardStore.getState();
    const children = getContainedChildren(nodes, node);
    dragStartRef.current = {
      sectionX: node.x,
      sectionY: node.y,
      children: children.map((c) => ({ id: c.id, x: c.x, y: c.y })),
    };
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!dragStartRef.current) return;
    const dx = e.target.x() - dragStartRef.current.sectionX;
    const dy = e.target.y() - dragStartRef.current.sectionY;
    if (dragStartRef.current.children.length > 0) {
      updateNodes(
        dragStartRef.current.children.map((c) => ({
          id: c.id,
          updates: { x: c.x + dx, y: c.y + dy },
        }))
      );
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    saveHistory();
    updateNode(node.id, { x: e.target.x(), y: e.target.y() });
    dragStartRef.current = null;
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const newWidth  = Math.max(200, group.width()  * group.scaleX());
    const newHeight = Math.max(150, group.height() * group.scaleY());
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

  const resolvedColor = resolveColor(node.color, theme);
  const fillColor   = hexToRgba(resolvedColor, 0.1);
  const borderColor = hexToRgba(resolvedColor, 0.55);
  const labelText   = node.name || 'Section';
  const textColor   = getTextColorForBackground(resolvedColor);
  const pillW = Math.max(72, labelText.length * 8 + 24);
  const pillH = 26;

  return (
    <>
      <Group
        ref={groupRef}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        draggable
        onClick={handleClick}
        onDblClick={handleDblClick}
        onTap={handleTap}
        onDblTap={(e) => { e.cancelBubble = true; setEditingId(node.id); }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        <Rect
          width={node.width}
          height={node.height}
          fill={fillColor}
          stroke={borderColor}
          strokeWidth={1.5}
          cornerRadius={12}
        />
        <Rect
          x={12}
          y={-pillH / 2}
          width={pillW}
          height={pillH}
          fill={resolvedColor}
          cornerRadius={8}
          opacity={isEditing ? 0 : 1}
        />
        <Text
          x={22}
          y={-pillH / 2 + 6}
          width={pillW - 20}
          text={isEditing ? '' : labelText}
          fontSize={12}
          fontStyle="bold"
          fontFamily={FONTS.ui}
          fill={textColor}
          listening={false}
        />
      </Group>

      {isSelected && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={[
            'top-left', 'top-right', 'bottom-left', 'bottom-right',
            'middle-left', 'middle-right', 'top-center', 'bottom-center',
          ]}
          anchorSize={8}
          anchorCornerRadius={2}
          anchorStroke={resolvedColor}
          anchorFill={resolvedColor}
          borderStroke={resolvedColor}
          borderDash={[4, 3]}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 200 || newBox.height < 150) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
