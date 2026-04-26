import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Transformer, Group, Rect, Text, Line, Circle } from 'react-konva';
import Konva from 'konva';
import { useBoardStore } from '../../store/boardStore';
import { ImageNode as ImageNodeType, AnchorSide } from '../../types';
import { useTheme } from '../../theme';
import { resolveCssColor } from '../../utils/palette';
import { FONTS } from '../../utils/fonts';

interface Props {
  node: ImageNodeType;
  isSelected: boolean;
  isDrawingLine?: boolean;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
  snapAnchor?: AnchorSide | null;
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
  isDrawingLine,
  onAnchorDown,
  onAnchorEnter,
  onAnchorLeave,
  snapAnchor,
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
  const t = useTheme();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

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
  const isLineTool = activeTool === 'line';
  const showAnchors = (isSelected && !node.locked) || isLineTool || isDrawingLine === true;

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

  const activeRef = (): Konva.Group | null => groupRef.current;

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
    const newWidth = Math.max(20, w * scaleX);
    const newHeight = Math.max(20, h * scaleY);
    n.scaleX(1);
    n.scaleY(1);
    updateNode(node.id, {
      x: n.x() - n.offsetX(),
      y: n.y() - n.offsetY(),
      width: newWidth,
      height: newHeight,
      rotation: n.rotation(),
    });
  };

  const sharedDragProps = {
    draggable: !node.locked,
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.evt.altKey) onAltDragStart?.(node.id);
      const ox = e.target.offsetX();
      const oy = e.target.offsetY();
      onMultiDragStart?.(node.id, e.target.x() - ox, e.target.y() - oy);
      if (!getShouldSaveHistory || getShouldSaveHistory()) saveHistory();
      selectIds([node.id]);
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const ox = e.target.offsetX();
      const oy = e.target.offsetY();
      let nx = e.target.x() - ox;
      let ny = e.target.y() - oy;
      if (onSnapMove) {
        const snapped = onSnapMove(node.id, nx, ny, node.width, node.height);
        nx = snapped.x;
        ny = snapped.y;
        e.target.x(nx + ox);
        e.target.y(ny + oy);
      }
      setDragPos({ x: nx, y: ny });
      updateNode(node.id, { x: nx, y: ny });
      onMultiDragMove?.(node.id, nx, ny);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      setDragPos(null);
      onSnapEnd?.();
      onAltDragEnd?.();
      onMultiDragEnd?.();
      updateNode(node.id, {
        x: e.target.x() - e.target.offsetX(),
        y: e.target.y() - e.target.offsetY(),
      });
    },
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeTool === 'image' || activeTool === 'pan') return;
      e.cancelBubble = true;
      const { selectedIds } = useBoardStore.getState();
      if (e.evt.shiftKey) {
        const alreadySelected = selectedIds.includes(node.id);
        selectIds(alreadySelected
          ? selectedIds.filter((id) => id !== node.id)
          : [...selectedIds, node.id]);
      } else {
        selectIds([node.id]);
      }
    },
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
  const rot = node.rotation ?? 0;
  const nx = dragPos?.x ?? node.x;
  const ny = dragPos?.y ?? node.y;
  // icon box dimensions (centred)
  const iconW = Math.min(w * 0.4, 64);
  const iconH = Math.min(h * 0.4, 48);
  const iconX = (w - iconW) / 2;
  const iconY = (h - iconH) / 2 - 10;

  const DOT_OFFSET = 16;
  const ANCHOR_DEFS: {
    side: AnchorSide;
    cx: (w: number, h: number) => number;
    cy: (w: number, h: number) => number;
    dx: number;
    dy: number;
  }[] = [
    { side: 'top', cx: (aw) => aw / 2, cy: () => 0, dx: 0, dy: -DOT_OFFSET },
    { side: 'bottom', cx: (aw) => aw / 2, cy: (_, ah) => ah, dx: 0, dy: DOT_OFFSET },
    { side: 'left', cx: () => 0, cy: (_, ah) => ah / 2, dx: -DOT_OFFSET, dy: 0 },
    { side: 'right', cx: (aw) => aw, cy: (_, ah) => ah / 2, dx: DOT_OFFSET, dy: 0 },
  ];
  const GHOST_LEN = 90;
  const GHOST_DIR: Record<AnchorSide, [number, number]> = {
    right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1],
  };
  const CHEVRON: Record<AnchorSide, number[]> = {
    right: [-4, -3.5, 3, 0, -4, 3.5],
    left: [4, -3.5, -3, 0, 4, 3.5],
    top: [-3.5, 4, 0, -3, 3.5, 4],
    bottom: [-3.5, -4, 0, 3, 3.5, -4],
  };
  const TOOLTIP_OFFSET: Record<AnchorSide, [number, number]> = {
    right: [14, -9], left: [-102, -9], top: [-44, -28], bottom: [-44, 12],
  };

  const makeRotateCursor = (deg: number): string => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${Math.round(deg)} 12 12)"><path d="M4.5 12 A7.5 7.5 0 0 1 19.5 12" stroke="white" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M22.5 12 L16.5 9 L18 12 L16.5 15 Z" fill="white" stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M4.5 12 A7.5 7.5 0 0 1 19.5 12" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M22.5 12 L16.5 9 L18 12 L16.5 15 Z" fill="#1a1a2e"/></g></svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}") 12 12, pointer`;
  };

  type RotateState = { worldCx: number; worldCy: number; startAngle: number; startRot: number; stageEl: HTMLElement };
  const rotateRef = useRef<RotateState | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!rotateRef.current) return;
      const { worldCx, worldCy, startAngle, startRot, stageEl } = rotateRef.current;
      const camera = useBoardStore.getState().camera;
      const rect = stageEl.getBoundingClientRect();
      const wx = (e.clientX - rect.left - camera.x) / camera.scale;
      const wy = (e.clientY - rect.top - camera.y) / camera.scale;
      let newRot = startRot + (Math.atan2(wy - worldCy, wx - worldCx) * 180 / Math.PI - startAngle);
      if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
      updateNode(node.id, { rotation: newRot });
    };
    const onUp = () => {
      if (!rotateRef.current) return;
      rotateRef.current.stageEl.style.cursor = '';
      saveHistory();
      rotateRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [node.id, saveHistory, updateNode]);

  const rad = rot * Math.PI / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const worldCx = nx + w / 2;
  const worldCy = ny + h / 2;
  const rotatedPt = (dx: number, dy: number): [number, number] => [
    worldCx + dx * cosR - dy * sinR,
    worldCy + dx * sinR + dy * cosR,
  ];
  const ZONE = 16;
  const GAP = 6;
  const rotZones = [
    { key: 'tl', dx: -w / 2, dy: -h / 2, cursorDeg: 0 + rot },
    { key: 'tr', dx: w / 2, dy: -h / 2, cursorDeg: 90 + rot },
    { key: 'br', dx: w / 2, dy: h / 2, cursorDeg: 180 + rot },
    { key: 'bl', dx: -w / 2, dy: h / 2, cursorDeg: 270 + rot },
  ].map(({ key, dx, dy, cursorDeg }) => {
    const mag = Math.sqrt(dx * dx + dy * dy);
    const scale = 1 + GAP / mag;
    const [wx, wy] = rotatedPt(dx * scale, dy * scale);
    return { key, wx: wx - ZONE / 2, wy: wy - ZONE / 2, cursor: makeRotateCursor(cursorDeg) };
  });

  return (
    <>
      <Group
        ref={groupRef}
        x={nx + w / 2}
        y={ny + h / 2}
        offsetX={w / 2}
        offsetY={h / 2}
        width={w}
        height={h}
        rotation={rot}
        {...sharedDragProps}
      >
        {isMissing ? (
          <>
            <Rect
              width={w}
              height={h}
              fill="#1a1a2e"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dash={[6, 4]}
              cornerRadius={4}
            />
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
            <Line
              points={[iconX, iconY, iconX + iconW, iconY + iconH]}
              stroke="#f59e0b"
              strokeWidth={1.5}
              opacity={0.6}
            />
            <Text
              x={4}
              y={iconY + iconH + 10}
              width={w - 8}
              text={node.assetName ?? 'Missing image'}
              fontSize={Math.max(10, Math.min(13, w / 14))}
              fontFamily={FONTS.ui}
              fill="#d4835a"
              align="center"
              ellipsis={true}
              wrap="none"
            />
            <Text
              x={4}
              y={8}
              width={w - 8}
              text="⚠ Missing"
              fontSize={Math.max(9, Math.min(11, w / 16))}
              fontFamily={FONTS.ui}
              fill="#f59e0b"
              align="center"
              opacity={0.7}
            />
          </>
        ) : (
          <KonvaImage
            ref={imgRef}
            image={img ?? undefined}
            width={w}
            height={h}
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
      </Group>

      {showAnchors &&
        ANCHOR_DEFS.map(({ side, cx, cy, dx, dy }) => {
          const bx = nx + cx(w, h);
          const by = ny + cy(w, h);
          const vx = bx + dx;
          const vy = by + dy;
          const snapped = snapAnchor === side;
          const hovered = hoveredAnchor === side;
          const active = snapped || hovered;
          const [gdx, gdy] = GHOST_DIR[side];
          const [tx, ty] = TOOLTIP_OFFSET[side];
          return (
            <Group key={side}>
              {hovered && (
                <>
                  <Line
                    points={[bx, by, bx + gdx * GHOST_LEN, by + gdy * GHOST_LEN]}
                    stroke={resolveCssColor('--c-line')}
                    strokeWidth={2}
                    opacity={0.22}
                    dash={[6, 4]}
                    lineCap="round"
                    listening={false}
                  />
                  <Line
                    x={bx + gdx * GHOST_LEN}
                    y={by + gdy * GHOST_LEN}
                    points={CHEVRON[side]}
                    stroke={resolveCssColor('--c-line')}
                    strokeWidth={2}
                    opacity={0.35}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                </>
              )}
              <Circle
                x={vx}
                y={vy}
                radius={active ? 8 : 5}
                fill={active ? resolveCssColor('--c-line') : 'white'}
                stroke={resolveCssColor('--c-line')}
                strokeWidth={2}
                opacity={active ? 1 : 0.85}
                shadowEnabled={active}
                shadowColor={resolveCssColor('--c-select-glow')}
                shadowBlur={18}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onAnchorDown?.(node.id, side, bx, by);
                }}
                onMouseEnter={() => {
                  setHoveredAnchor(side);
                  onAnchorEnter?.(node.id, side);
                }}
                onMouseLeave={() => {
                  setHoveredAnchor(null);
                  onAnchorLeave?.();
                }}
              />
              {active && (
                <Line
                  x={vx}
                  y={vy}
                  points={CHEVRON[side]}
                  stroke="white"
                  strokeWidth={2}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              )}
              {hovered && (
                <Group x={vx + tx} y={vy + ty}>
                  <Rect width={60} height={18} fill={t.panelBg} cornerRadius={4} opacity={0.92} />
                  <Text
                    width={60}
                    height={18}
                    text="Connect"
                    fontSize={10}
                    fontFamily={FONTS.ui}
                    fill={t.textHi}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                </Group>
              )}
            </Group>
          );
        })}

      {isSelected && !isLineTool &&
        rotZones.map(({ key, wx, wy, cursor }) => (
          <Rect
            key={`rot-${key}`}
            x={wx}
            y={wy}
            width={ZONE}
            height={ZONE}
            fill="transparent"
            onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = cursor; }}
            onMouseLeave={(e) => { if (!rotateRef.current) e.target.getStage()!.container().style.cursor = ''; }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage()!;
              const pointer = stage.getPointerPosition()!;
              const camera = useBoardStore.getState().camera;
              const mwx = (pointer.x - camera.x) / camera.scale;
              const mwy = (pointer.y - camera.y) / camera.scale;
              const startAngle = Math.atan2(mwy - worldCy, mwx - worldCx) * 180 / Math.PI;
              rotateRef.current = { worldCx, worldCy, startAngle, startRot: rot, stageEl: stage.container() };
              stage.container().style.cursor = cursor;
            }}
          />
        ))}

      {isSelected && !isLineTool && (
        <Transformer
          ref={trRef}
          resizeEnabled={true}
          rotateEnabled={false}
          keepRatio={!shiftHeld}
          borderStroke={resolveCssColor('--c-line')}
          borderStrokeWidth={1.5}
          borderDash={[4, 3]}
          anchorSize={8}
          anchorStroke={resolveCssColor('--c-line')}
          anchorFill="white"
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}
