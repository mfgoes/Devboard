import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Transformer, Group, Rect, Text, Line } from 'react-konva';
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
  const [imgError, setImgError] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  const imgRef = useRef<Konva.Image>(null);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!node.src) {
      setImg(null);
      setImgError(true);
      return;
    }
    setImgError(false);
    const image = new window.Image();
    image.src = node.src;
    image.onload = () => setImg(image);
    image.onerror = () => setImgError(true);
  }, [node.src]);

  const isMissing = imgError || !node.src;

  const activeRef = (): Konva.Image | Konva.Group | null => imgRef.current ?? groupRef.current;

  useEffect(() => {
    const target = activeRef();
    if (isSelected && !node.locked && trRef.current && target) {
      trRef.current.nodes([target]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, node.locked, imgError]);

  const handleTransformEnd = () => {
    const n = activeRef()!;
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

  const sharedDragProps = {
    draggable: !node.locked,
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.evt.altKey) onAltDragStart?.(node.id);
      onMultiDragStart?.(node.id, e.target.x(), e.target.y());
      if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
      selectIds([node.id]);
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      let nx = e.target.x(), ny = e.target.y();
      if (onSnapMove) {
        const snapped = onSnapMove(node.id, nx, ny, node.width, node.height);
        nx = snapped.x; ny = snapped.y;
        e.target.x(nx); e.target.y(ny);
      }
      onMultiDragMove?.(node.id, nx, ny);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onSnapEnd?.();
      onAltDragEnd?.();
      onMultiDragEnd?.();
      updateNode(node.id, { x: e.target.x(), y: e.target.y() });
    },
    onClick: () => { if (activeTool !== 'image' && activeTool !== 'pan') selectIds([node.id]); },
    onTap: () => { if (activeTool !== 'image' && activeTool !== 'pan') selectIds([node.id]); },
    onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.evt.stopPropagation();
      onContextMenu?.(node.id, e.evt.clientX, e.evt.clientY);
    },
    onTransformStart: () => saveHistory(),
    onTransformEnd: handleTransformEnd,
  };

  const w = node.width;
  const h = node.height;
  // icon box dimensions (centred)
  const iconW = Math.min(w * 0.4, 64);
  const iconH = Math.min(h * 0.4, 48);
  const iconX = (w - iconW) / 2;
  const iconY = (h - iconH) / 2 - 10;

  return (
    <>
      {isMissing ? (
        <Group
          ref={groupRef}
          x={node.x}
          y={node.y}
          width={w}
          height={h}
          rotation={node.rotation ?? 0}
          {...sharedDragProps}
        >
          {/* Background */}
          <Rect
            width={w}
            height={h}
            fill="#1a1a2e"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dash={[6, 4]}
            cornerRadius={4}
          />
          {/* Broken image icon — outer frame */}
          <Rect
            x={iconX}
            y={iconY}
            width={iconW}
            height={iconH}
            stroke="#f59e0b"
            strokeWidth={1.5}
            cornerRadius={3}
            fill="transparent"
          />
          {/* Diagonal slash */}
          <Line
            points={[iconX, iconY, iconX + iconW, iconY + iconH]}
            stroke="#f59e0b"
            strokeWidth={1.5}
            opacity={0.6}
          />
          {/* Filename */}
          <Text
            x={4}
            y={iconY + iconH + 10}
            width={w - 8}
            text={node.assetName ?? 'Missing image'}
            fontSize={Math.max(10, Math.min(13, w / 14))}
            fontFamily="monospace"
            fill="#f59e0b"
            align="center"
            ellipsis={true}
            wrap="none"
          />
          {/* "Missing" label */}
          <Text
            x={4}
            y={8}
            width={w - 8}
            text="⚠ Missing"
            fontSize={Math.max(9, Math.min(11, w / 16))}
            fontFamily="monospace"
            fill="#f59e0b"
            align="center"
            opacity={0.7}
          />
        </Group>
      ) : (
        <KonvaImage
          ref={imgRef}
          image={img ?? undefined}
          x={node.x}
          y={node.y}
          width={w}
          height={h}
          rotation={node.rotation ?? 0}
          {...sharedDragProps}
          {...(node.imageRendering === 'pixelated' && img
            ? {
                sceneFunc: (ctx, shape) => {
                  const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
                  raw.imageSmoothingEnabled = false;
                  raw.drawImage(img, 0, 0, shape.width(), shape.height());
                  raw.imageSmoothingEnabled = true;
                },
              }
            : {})}
        />
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          resizeEnabled={true}
          rotateEnabled={true}
          keepRatio={!shiftHeld}
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
