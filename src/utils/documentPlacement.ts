import { Camera, CanvasNode } from '../types';

const DEFAULT_CARD_WIDTH = 280;
const DEFAULT_CARD_HEIGHT = 176;
const DEFAULT_GAP = 28;
const DEFAULT_COLUMNS = 3;
const MAX_ROWS = 20;

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap: number) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

export function getViewportCenter(camera: Camera) {
  return {
    x: (-camera.x + window.innerWidth / 2) / camera.scale,
    y: (-camera.y + window.innerHeight / 2) / camera.scale,
  };
}

export function findDocumentPlacement(
  nodes: CanvasNode[],
  camera: Camera,
  width = DEFAULT_CARD_WIDTH,
  height = DEFAULT_CARD_HEIGHT,
  gap = DEFAULT_GAP,
) {
  const center = getViewportCenter(camera);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;
  const occupied = nodes
    .filter((node) => node.type !== 'connector')
    .map((node) => {
      const rect = node as { x?: number; y?: number; width?: number; height?: number };
      return {
        x: rect.x ?? 0,
        y: rect.y ?? 0,
        width: rect.width ?? width,
        height: rect.height ?? height,
      };
    });

  for (let row = 0; row < MAX_ROWS; row += 1) {
    for (let col = 0; col < DEFAULT_COLUMNS; col += 1) {
      const x = originX + (col - 1) * (width + gap);
      const y = originY + row * (height + gap);
      const candidate = { x, y, width, height };
      if (!occupied.some((rect) => overlaps(candidate, rect, gap))) {
        return { x, y };
      }
    }
  }

  return { x: originX, y: originY };
}
