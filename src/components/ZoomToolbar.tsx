import { useBoardStore } from '../store/boardStore';

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export default function ZoomToolbar() {
  const { camera, setCamera } = useBoardStore();

  const zoomIn = () => {
    const next = ZOOM_PRESETS.find((z) => z > camera.scale) ?? 8;
    setCamera({ scale: Math.min(next, 8) });
  };
  const zoomOut = () => {
    const prev = [...ZOOM_PRESETS].reverse().find((z) => z < camera.scale) ?? 0.08;
    setCamera({ scale: Math.max(prev, 0.08) });
  };
  const zoomReset = () => setCamera({ scale: 1, x: 0, y: 0 });

  const zoomPct = Math.round(camera.scale * 100);

  return (
    <div className="absolute bottom-20 right-4 sm:bottom-5 sm:right-5 z-50 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-0.5 px-1 py-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl">
        <button
          title="Zoom out"
          onClick={zoomOut}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-lg leading-none"
        >
          −
        </button>
        <button
          title="Reset zoom (100%)"
          onClick={zoomReset}
          className="min-w-[52px] h-8 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-[11px] tabular-nums"
        >
          {zoomPct}%
        </button>
        <button
          title="Zoom in"
          onClick={zoomIn}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-lg leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
