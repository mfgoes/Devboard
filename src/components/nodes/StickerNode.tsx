import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import { useBoardStore } from '../../store/boardStore';
import { StickerNode as StickerNodeType } from '../../types';
import { resolveStickerSrc } from '../../assets/stickerAssets';

interface Props {
  node: StickerNodeType;
  isSelected: boolean;
  onSnapMove?: (nodeId: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onSnapEnd?: () => void;
  onAltDragStart?: (nodeId: string) => void;
  onAltDragEnd?: () => void;
  onMultiDragStart?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragMove?: (nodeId: string, worldX: number, worldY: number) => void;
  onMultiDragEnd?: () => void;
  getShouldSaveHistory?: () => boolean;
}

export default function StickerNodeComponent({ node, isSelected, onSnapMove, onSnapEnd, onAltDragStart, onAltDragEnd, onMultiDragStart, onMultiDragMove, onMultiDragEnd, getShouldSaveHistory }: Props) {
  const { updateNode, selectIds, saveHistory, activeTool } = useBoardStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const imgRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const image = new window.Image();
    image.src = resolveStickerSrc(node.src);
    image.onload = () => setImg(image);
  }, [node.src]);

  useEffect(() => {
    if (isSelected && trRef.current && imgRef.current) {
      trRef.current.nodes([imgRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleTransformEnd = () => {
    const img = imgRef.current!;
    const scaleX = img.scaleX();
    const scaleY = img.scaleY();
    const newWidth = Math.max(20, img.width() * scaleX);
    const newHeight = Math.max(20, img.height() * scaleY);
    img.scaleX(1);
    img.scaleY(1);
    updateNode(node.id, {
      x: img.x(),
      y: img.y(),
      width: newWidth,
      height: newHeight,
      rotation: img.rotation(),
    });
    // Keep offsets in sync after resize
    img.offsetX(newWidth / 2);
    img.offsetY(newHeight / 2);
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
        rotation={node.rotation}
        offsetX={node.width / 2}
        offsetY={node.height / 2}
        draggable
        onClick={() => { if (activeTool !== 'sticker' && activeTool !== 'pan') selectIds([node.id]); }}
        onTap={() => { if (activeTool !== 'sticker' && activeTool !== 'pan') selectIds([node.id]); }}
        onDragStart={(e) => {
          if (e.evt.altKey) onAltDragStart?.(node.id);
          onMultiDragStart?.(node.id, e.target.x(), e.target.y());
          if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
          selectIds([node.id]);
        }}
        onDragMove={(e) => {
          // Sticker x/y is center; convert to TL for snap, restore after
          let cx = e.target.x(), cy = e.target.y();
          if (onSnapMove) {
            const snapped = onSnapMove(node.id, cx - node.width / 2, cy - node.height / 2, node.width, node.height);
            cx = snapped.x + node.width / 2; cy = snapped.y + node.height / 2;
            e.target.x(cx); e.target.y(cy);
          }
          onMultiDragMove?.(node.id, cx, cy);
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
          rotateEnabled={false}
          keepRatio={true}
          borderStroke="#6366f1"
          borderStrokeWidth={1.5}
          borderDash={[4, 3]}
          anchorSize={8}
          anchorStroke="#6366f1"
          anchorFill="white"
          anchorCornerRadius={2}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
}
