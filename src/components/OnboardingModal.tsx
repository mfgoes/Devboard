import { useState } from 'react';
import ModalCloseButton from './ModalCloseButton';

interface Props {
  onClose: () => void;
  onCreateProject?: () => void;
  onStartWriting?: () => void;
  onStartMapping?: () => void;
  onShowTemplates?: () => void;
}

export default function OnboardingModal({ onClose, onCreateProject, onStartWriting, onStartMapping, onShowTemplates }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) localStorage.setItem('devboard-onboarding-dismissed', '1');
    else localStorage.removeItem('devboard-onboarding-dismissed');
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7 font-sans">
        <ModalCloseButton onClick={onClose} className="absolute right-4 top-4" />

        {/* Logo */}
        <div className="mb-5">
          <span className="text-[var(--c-line)] text-[11px] font-semibold tracking-[0.15em] uppercase">
            DevBoard
          </span>
        </div>

        {/* Main heading */}
        <h1 className="text-[var(--c-text-hi)] text-[20px] font-bold leading-tight mb-2">
          Start with notes. Map what matters.
        </h1>

        {/* Tagline */}
        <p className="text-[var(--c-text-lo)] text-[13px] leading-relaxed mb-6">
          Projects are real folders on your device.
        </p>

        {/* Primary action */}
        <button
          onClick={() => (onCreateProject ? onCreateProject() : onClose())}
          className="w-full px-4 py-2.5 bg-[var(--c-line)] hover:opacity-80 text-white text-sm rounded-lg transition-colors font-semibold"
        >
          Create project…
        </button>

        {/* Secondary action */}
        <button
          onClick={() => (onStartWriting ? onStartWriting() : onClose())}
          className="w-full mt-2 px-4 py-2.5 bg-transparent hover:bg-[var(--c-hover)] border border-[var(--c-border)] text-[var(--c-text-hi)] text-sm rounded-lg transition-colors font-semibold"
        >
          Just start a note
        </button>

        {/* Tertiary actions */}
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            onClick={() => (onShowTemplates ? onShowTemplates() : onClose())}
            className="text-[12px] text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] transition-colors"
          >
            Use a starter workspace
          </button>
          <span className="text-[var(--c-text-lo)]">·</span>
          <button
            onClick={() => (onStartMapping ? onStartMapping() : onClose())}
            className="text-[12px] text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] transition-colors"
          >
            Map ideas on canvas
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-[var(--c-border)]">
          <p className="text-[var(--c-text-lo)] text-[11px] leading-relaxed">
            <kbd className="px-1 py-px rounded border border-[var(--c-border)] text-[10px] font-mono">⌘N</kbd> new note ·{' '}
            <kbd className="px-1 py-px rounded border border-[var(--c-border)] text-[10px] font-mono">⌘K</kbd> search
          </p>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--c-text-lo)] hover:text-[var(--c-text-md)] transition-colors whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleDontShowAgainChange(e.target.checked)}
              className="w-3 h-3 rounded-sm accent-[var(--c-line)]"
            />
            Don't show again
          </label>
        </div>
      </div>
    </div>
  );
}
