import { useBoardStore } from '../store/boardStore';

export function focusNode(nodeId: string, afterMs = 0) {
  const run = () => {
    const state = useBoardStore.getState();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const n = node as { x: number; y: number; width?: number; height?: number };
    const w = n.width ?? 200;
    const h = n.height ?? 120;
    const scale = state.camera.scale;
    const topH = 44;
    state.setCamera({
      x: window.innerWidth / 2 - (n.x + w / 2) * scale,
      y: topH + (window.innerHeight - topH) / 2 - (n.y + h / 2) * scale,
    });
    state.selectIds([nodeId]);
  };
  if (afterMs > 0) setTimeout(run, afterMs);
  else run();
}
