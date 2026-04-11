/**
 * First-time-use notice shown when a user places their first image
 * without a workspace folder open. Explains storage trade-offs.
 */
const LS_KEY = 'devboard-image-notice-seen';

export function hasSeenImageNotice(): boolean {
  return !!localStorage.getItem(LS_KEY);
}
export function markImageNoticeSeen(): void {
  localStorage.setItem(LS_KEY, '1');
}

interface Props {
  isWorkspaceOpen: boolean;
  onClose: () => void;
  onOpenFolder: () => void;
}

export default function ImageFirstUseModal({ isWorkspaceOpen, onClose, onOpenFolder }: Props) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl p-6 font-mono">

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl shrink-0">🖼️</span>
          <div>
            <h2 className="text-[var(--c-text-hi)] font-semibold text-sm">Images on the canvas</h2>
            <p className="text-[var(--c-text-lo)] text-xs mt-1 leading-relaxed">
              This is a new pattern — here's what you need to know before placing images.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 text-[var(--c-text-off)] hover:text-[var(--c-text-hi)] transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>

        {/* Two storage modes */}
        <div className="space-y-2 mb-5">
          {/* Workspace mode — always shown as the recommended path */}
          <div className="flex gap-3 rounded-xl border border-[var(--c-line)]/40 bg-[var(--c-line)]/10 p-3">
            <span className="text-lg shrink-0">📁</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--c-text-hi)]">Folder workspace</span>
                {isWorkspaceOpen
                  ? <span className="text-[9px] bg-[var(--c-line)] text-white px-1.5 py-0.5 rounded-full">active</span>
                  : <span className="text-[9px] bg-[var(--c-line)] text-white px-1.5 py-0.5 rounded-full">recommended</span>
                }
              </div>
              <p className="text-[10px] text-[var(--c-text-lo)] mt-0.5 leading-snug">
                Images saved as actual files in <code className="text-[var(--c-line)]">assets/</code>.
                Board JSON stays small. Works like VS Code workspaces.
              </p>
            </div>
          </div>

          {/* Standalone mode */}
          <div className="flex gap-3 rounded-xl border border-[var(--c-border)] p-3 opacity-70">
            <span className="text-lg shrink-0">📄</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--c-text-hi)]">Standalone JSON</span>
                {!isWorkspaceOpen && (
                  <span className="text-[9px] bg-amber-500/80 text-white px-1.5 py-0.5 rounded-full">fallback</span>
                )}
              </div>
              <p className="text-[10px] text-[var(--c-text-lo)] mt-0.5 leading-snug">
                Images embedded as base64 — file gets large (1 MB image ≈ 1.3 MB added to JSON).
                Use <strong>Export as ZIP</strong> for cleaner sharing.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isWorkspaceOpen && (
            <button
              onClick={onOpenFolder}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--c-line)] hover:opacity-80 text-white text-[11px] font-semibold transition-colors"
            >
              Open folder workspace
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--c-border)] hover:bg-[var(--c-hover)] text-[var(--c-text-hi)] text-[11px] transition-colors"
          >
            {isWorkspaceOpen ? 'Got it' : 'Continue with base64'}
          </button>
        </div>
      </div>
    </div>
  );
}
