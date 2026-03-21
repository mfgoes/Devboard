import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import { useBoardStore } from '../../store/boardStore';
import { ImageNode as ImageNodeType } from '../../types';

interface Props {
  node: ImageNodeType;
  isSelected: boolean;
  onSnapMove?: (nodeId: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onSnapEnd?: () => void;
  onAltDragStart?: (nodeId: string) => void;
  onAltDragEnd?: () => void;
  onMultiDragStart?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragMove?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragEnd?: () => void;
  getShouldSaveHistory?: () => boolean;
  onContextMenu?: (nodeId: string, x: number, y: number) => void;
}

export default function ImageNodeComponent({
  node,
  isSelected,
  onSnapMove,
  onSnapEnd,
  onAltDragStart,
  onAltDragEnd,
  onMultiDragStart,
  onMultiDragMove,
  onMultiDragEnd,
  getShouldSaveHistory,
  onContextMenu,
}: Props) {
  const { updateNode, selectIds, saveHistory, activeTool } = useBoardStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const imgRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const image = new window.Image();
    image.src = node.src;
    image.onload = () => setImg(image);
  }, [node.src]);

  useEffect(() => {
    if (isSelected && !node.locked && trRef.current && imgRef.current) {
      trRef.current.nodes([imgRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, node.locked]);

  const handleTransformEnd = () => {
    const n = imgRef.current!;
    const scaleX = n.scaleX();
    const scaleY = n.scaleY();
    const newWidth = Math.max(20, n.width() * scaleX);
    const newHeight = Math.max(20, n.height() * scaleY);
    n.scaleX(1);
    n.scaleY(1);
    updateNode(node.id, {
      x: n.x(),
      y: n.y(),
      width: newWidth,
      height: newHeight,
      rotation: n.rotation(),
    });
  };

  return (
    <>
      <KonvaImage
        ref={imgRef}
        image={img ?? undefined}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rotation={node.rotation ?? 0}
        draggable={!node.locked}
        onClick={() => {
          if (activeTool !== 'image' && activeTool !== 'pan') selectIds([node.id]);
        }}
        onTap={() => {
          if (activeTool !== 'image' && activeTool !== 'pan') selectIds([node.id]);
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          e.evt.stopPropagation();
          onContextMenu?.(node.id, e.evt.clientX, e.evt.clientY);
        }}
        onDragStart={(e) => {
          if (e.evt.altKey) onAltDragStart?.(node.id);
          onMultiDragStart?.(node.id, e.target.x(), e.target.y());
          if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
          selectIds([node.id]);
        }}
        onDragMove={(e) => {
          let nx = e.target.x(), ny = e.target.y();
          if (onSnapMove) {
            const snapped = onSnapMove(node.id, nx, ny, node.width, node.height);
            nx = snapped.x; ny = snapped.y;
            e.target.x(nx); e.target.y(ny);
          }
          onMultiDragMove?.(node.id, nx, ny);
        }}
        onDragEnd={(e) => {
          onSnapEnd?.();
          onAltDragEnd?.();
          onMultiDragEnd?.();
          updateNode(node.id, { x: e.target.x(), y: e.target.y() });
        }}
        onTransformStart={() => saveHistory()}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          resizeEnabled={true}
          rotateEnabled={true}
          keepRatio={false}
          borderStroke="#6366f1"
          borderStrokeWidth={1.5}
          borderDash={[4, 3]}
          anchorSize={8}
          anchorStroke="#6366f1"
          anchorFill="white"
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}
