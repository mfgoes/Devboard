import { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import timerDoneSound from '../assets/get1.mp3';

const DEFAULT_SECONDS = 3 * 60;

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimerWidget({ onClose }: { onClose: () => void }) {
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_SECONDS);
  const [remaining, setRemaining] = useState(DEFAULT_SECONDS);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('03:00');
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 130, y: 60 });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const boardTitle = useBoardStore((s) => s.boardTitle);

  // Sync tab title while timer is active
  useEffect(() => {
    if (running || remaining !== totalSeconds) {
      document.title = `${boardTitle} — ${fmt(remaining)}`;
    } else {
      document.title = boardTitle;
    }
    return () => { document.title = boardTitle; };
  }, [remaining, running, boardTitle, totalSeconds]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            new Audio(timerDoneSound).play().catch(() => {});
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const handleReset = () => {
    setRunning(false);
    setRemaining(totalSeconds);
  };

  const handleAddMin = () => {
    setRemaining((r) => r + 60);
    setTotalSeconds((t) => t + 60);
  };

  const handleStartEdit = () => {
    if (running) return;
    setEditValue(fmt(remaining));
    setEditing(true);
  };

  const handleCommitEdit = () => {
    const parts = editValue.split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s) && m >= 0 && s >= 0 && s < 60) {
        const secs = m * 60 + s;
        setTotalSeconds(secs);
        setRemaining(secs);
      }
    }
    setEditing(false);
  };

  const onMouseDownHeader = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const start = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    dragRef.current = start;
    const onMove = (me: MouseEvent) => {
      setPos({
        x: start.origX + me.clientX - start.startX,
        y: start.origY + me.clientY - start.startY,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const isFinished = remaining === 0;
  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;

  return (
    <div
      className="fixed z-[500] rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl w-[260px] select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--c-border)] cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDownHeader}
      >
        <span className="font-mono text-[11px] font-semibold text-[var(--c-text-hi)] tracking-widest uppercase flex items-center gap-1.5">
          <IconTimer />
          Timer
        </span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3">
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-[var(--c-hover)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFinished ? 'bg-red-400' : 'bg-[var(--c-line)]'}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Clock display */}
        <div
          className={`rounded-lg px-3 py-4 flex items-center justify-center ${
            isFinished ? 'bg-red-500/10' : 'bg-[var(--c-hover)]'
          } ${!running ? 'cursor-pointer' : ''}`}
          onClick={handleStartEdit}
          title={!running ? 'Click to edit time' : undefined}
        >
          {editing ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleCommitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="font-mono text-[42px] font-bold bg-transparent text-[var(--c-text-hi)] outline-none text-center w-full"
              style={{ letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' }}
            />
          ) : (
            <span
              className={`font-mono text-[42px] font-bold ${isFinished ? 'text-red-400 animate-pulse' : 'text-[var(--c-text-hi)]'}`}
              style={{ letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(remaining)}
            </span>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleAddMin}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[var(--c-border)] font-mono text-[11px] text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
          >
            <span className="text-[13px] leading-none font-bold">+</span> 1 min
          </button>

          <div className="flex items-center gap-2">
            {/* Reset */}
            <button
              onClick={handleReset}
              title="Reset"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--c-border)] text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7a5 5 0 1 0 1.5-3.5L2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Play / Pause */}
            <button
              onClick={() => remaining > 0 && setRunning((r) => !r)}
              disabled={remaining === 0}
              title={running ? 'Pause' : 'Start'}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                remaining === 0
                  ? 'bg-[var(--c-border)] text-[var(--c-text-off)] cursor-default'
                  : 'bg-[var(--c-line)] text-white hover:opacity-80'
              }`}
            >
              {running ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
                  <rect x="7" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconTimer() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <circle cx="5.5" cy="6" r="4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 3.5v3l1.5 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 1h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
