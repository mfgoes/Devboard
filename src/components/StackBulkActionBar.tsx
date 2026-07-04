import { useEffect, useRef, useState } from 'react';
import { IconFolder } from './icons';

interface MoveTarget {
  id: string;
  name: string;
}

interface StackBulkActionBarProps {
  count: number;
  moveTargets: MoveTarget[];
  onMove: (targetPageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}

export default function StackBulkActionBar({ count, moveTargets, onMove, onDelete, onClear }: StackBulkActionBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);
  const moveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moveOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moveRef.current?.contains(target) || moveBtnRef.current?.contains(target)) return;
      setMoveOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoveOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moveOpen]);

  if (count === 0) return null;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[9050] flex items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ fontFamily: 'inherit' }}
    >
      <div className="px-3 py-2 text-[12px] font-semibold text-[var(--c-text-hi)] whitespace-nowrap">
        {count} selected
      </div>
      <div className="w-px h-6 bg-[var(--c-border)]" />
      <div className="relative">
        <button
          ref={moveBtnRef}
          type="button"
          className="px-3 py-2 text-[12px] font-medium text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] transition-colors whitespace-nowrap"
          onClick={() => setMoveOpen((v) => !v)}
        >
          Move to… ▾
        </button>
        {moveOpen && (
          <div
            ref={moveRef}
            className="absolute top-full left-0 mt-1 py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl min-w-[200px] max-h-[280px] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {moveTargets.length === 0 && (
              <div className="px-3 py-1.5 text-[12px] text-[var(--c-text-off)]">No other folders</div>
            )}
            {moveTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                onClick={() => {
                  setMoveOpen(false);
                  onMove(target.id);
                }}
              >
                <span className="text-[var(--c-text-lo)]"><IconFolder size={13} /></span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{target.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-[var(--c-border)]" />
      <button
        type="button"
        className="px-3 py-2 text-[12px] font-medium transition-colors whitespace-nowrap hover:bg-[rgba(239,68,68,0.12)]"
        style={{ color: '#f87171' }}
        onClick={onDelete}
      >
        Delete
      </button>
      <div className="w-px h-6 bg-[var(--c-border)]" />
      <button
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        className="px-3 py-2 text-[12px] font-medium text-[var(--c-text-lo)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] transition-colors"
        onClick={onClear}
      >
        ✕
      </button>
    </div>
  );
}
