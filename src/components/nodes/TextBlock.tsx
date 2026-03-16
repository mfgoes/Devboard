import { useRef, useEffect } from 'react';
import { Group, Text, Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import { TextBlockNode } from '../../types';
import { useBoardStore } from '../../store/boardStore';
import { useTheme } from '../../theme';

interface Props {
  node: TextBlockNode;
  isSelected: boolean;
  isEditing: boolean;
}

export default function TextBlock({ node, isSelected, isEditing }: Props) {
  const t = useTheme();
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);
  const { updateNode, selectIds, setEditingId, setActiveTool, saveHistory } = useBoardStore();

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (['shape', 'pan'].includes(useBoardStore.getState().activeTool)) return;
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
    if (!['select', 'pan'].includes(useBoardStore.getState().activeTool)) setActiveTool('text');
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
      if (!['select', 'pan'].includes(tool)) setActiveTool('text');
    }
  };

  const handleDblTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    setEditingId(node.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    saveHistory();
    updateNode(node.id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = () => {
    const group = groupRef.current;
    if (!group) return;
    const sx = group.scaleX();
    const sy = group.scaleY();

    const newWidth = Math.max(80, Math.round(node.width * sx));

    // Corner drag (sy changed) → scale fontSize proportionally using sy.
    // Side drag (sy stays 1) → width only, fontSize unchanged.
    const isCorner = Math.abs(sy - 1) > 0.001;
    const newFontSize = isCorner
      ? Math.max(8, Math.round(node.fontSize * sy))
      : node.fontSize;

    saveHistory();
    updateNode(node.id, {
      x: group.x(),
      y: group.y(),
      width:    newWidth,
      fontSize: newFontSize,
    });
    group.scaleX(1);
    group.scaleY(1);
  };

  // Konva fontStyle string: 'normal' | 'bold' | 'italic' | 'bold italic'
  const fontStyle = [
    node.bold   ? 'bold'   : '',
    node.italic ? 'italic' : '',
  ].filter(Boolean).join(' ') || 'normal';

  const textDecoration = node.underline ? 'underline' : '';

  // Rough hit area height
  const lineCount  = (node.text || ' ').split('\n').length;
  const hitHeight  = Math.max(node.fontSize * 1.5 * lineCount, node.fontSize * 2);

  return (
    <>
      <Group
        ref={groupRef}
        x={node.x}
        y={node.y}
        width={node.width}
        draggable
        onClick={handleClick}
        onDblClick={handleDblClick}
        onTap={handleTap}
        onDblTap={handleDblTap}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {/* Transparent hit area */}
        <Rect width={node.width} height={hitHeight} fill="transparent" />

        {/* Hide text while editing — textarea overlay takes over */}
        {!isEditing && (
          <Text
            width={node.width}
            text={node.text || 'Double-click to edit'}
            fontSize={node.fontSize}
            fontStyle={fontStyle}
            textDecoration={textDecoration}
            lineHeight={1.5}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fill={node.text ? (node.color === 'auto' ? t.textHi : node.color) : t.textOff}
            wrap="word"
            align="left"
            listening={false}
          />
        )}
      </Group>

      {isSelected && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          enabledAnchors={[
            'top-left', 'top-right', 'bottom-left', 'bottom-right',
            'middle-left', 'middle-right',
          ]}
          anchorSize={8}
          anchorCornerRadius={2}
          anchorStroke="#6366f1"
          anchorFill="#6366f1"
          borderStroke="#6366f1"
          borderDash={[4, 3]}
          boundBoxFunc={(oldBox, newBox) => {
            // Enforce minimum width
            if (newBox.width < 80) return oldBox;
            // Side drag (only width changed): lock height so no vertical distortion
            const heightChanged = Math.abs(newBox.height - oldBox.height) > 0.5;
            if (!heightChanged) return { ...newBox, height: oldBox.height };
            return newBox;
          }}
        />
      )}
    </>
  );
}
