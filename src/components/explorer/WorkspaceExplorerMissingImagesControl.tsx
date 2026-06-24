import { forwardRef } from 'react';
import { type ImageNode } from '../../types';
import { FONTS } from '../../utils/fonts';
import { hasWorkspaceHandle } from '../../utils/workspaceManager';

interface WorkspaceExplorerMissingImagesControlProps {
  open: boolean;
  missingImages: ImageNode[];
  missingImagesFixing: boolean;
  missingImagePath: (image: ImageNode) => string;
  backgroundTone?: 'danger' | 'warning' | 'neutral' | 'success' | 'cloud';
  onToggleOpen: () => void;
  onClose: () => void;
  onFindMissingImages: () => void;
  onIgnoreMissingImages: () => void;
  onOpenFolder: () => void;
}

const WorkspaceExplorerMissingImagesControl = forwardRef<HTMLDivElement, WorkspaceExplorerMissingImagesControlProps>(
  function WorkspaceExplorerMissingImagesControl(
    {
      open,
      missingImages,
      missingImagesFixing,
      missingImagePath,
      backgroundTone,
      onToggleOpen,
      onClose,
      onFindMissingImages,
      onIgnoreMissingImages,
      onOpenFolder,
    }: WorkspaceExplorerMissingImagesControlProps,
    ref,
  ) {
    const toneBg = backgroundTone === 'danger'
      ? '#fef0f0'
      : backgroundTone === 'warning'
        ? '#fef5ec'
        : 'transparent';

    return (
      <div ref={ref} style={{ position: 'relative', marginBottom: 8 }}>
        {open && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'calc(100% + 8px)',
              zIndex: 9200,
              padding: 12,
              border: '1px solid rgba(245,158,11,0.38)',
              borderRadius: 12,
              background: 'var(--c-panel)',
              boxShadow: '0 18px 46px rgba(25,18,14,0.22)',
              fontFamily: FONTS.ui,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--c-text-hi)' }}>
                  {missingImages.length} missing image{missingImages.length === 1 ? '' : 's'}
                </div>
                <p style={{ margin: '5px 0 0', fontSize: 10.5, lineHeight: 1.45, color: 'var(--c-text-lo)' }}>
                  DevBoard has image cards, but the image files are not loaded from this workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close missing images help"
                style={{
                  width: 22,
                  height: 22,
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--c-text-lo)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {missingImages.slice(0, 4).map((image) => (
                <div
                  key={image.id}
                  title={missingImagePath(image)}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    color: 'var(--c-text-md)',
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--c-hover) 46%, transparent)',
                  }}
                >
                  {missingImagePath(image)}
                </div>
              ))}
              {missingImages.length > 4 && (
                <div style={{ fontSize: 10, color: 'var(--c-text-lo)', padding: '2px 6px' }}>
                  +{missingImages.length - 4} more
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={onFindMissingImages}
                disabled={missingImagesFixing || !hasWorkspaceHandle()}
                title={hasWorkspaceHandle() ? 'Search the workspace for missing image files' : 'Reopen the workspace folder first'}
                style={{
                  flex: 1,
                  height: 32,
                  border: 'none',
                  borderRadius: 8,
                  background: hasWorkspaceHandle() ? 'var(--c-line)' : 'var(--c-hover)',
                  color: hasWorkspaceHandle() ? '#fff' : 'var(--c-text-lo)',
                  cursor: missingImagesFixing || !hasWorkspaceHandle() ? 'default' : 'pointer',
                  fontFamily: FONTS.ui,
                  fontSize: 11,
                  fontWeight: 750,
                  opacity: missingImagesFixing ? 0.72 : 1,
                }}
              >
                {missingImagesFixing ? 'Finding...' : 'Find images'}
              </button>
              <button
                type="button"
                onClick={onIgnoreMissingImages}
                disabled={missingImagesFixing}
                title="Hide this missing image warning until the missing image list changes"
                style={{
                  flex: 1,
                  height: 32,
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--c-text-md)',
                  cursor: missingImagesFixing ? 'default' : 'pointer',
                  fontFamily: FONTS.ui,
                  fontSize: 11,
                  fontWeight: 650,
                  opacity: missingImagesFixing ? 0.72 : 1,
                }}
              >
                Ignore
              </button>
              <button
                type="button"
                onClick={onOpenFolder}
                style={{
                  flex: 1,
                  height: 32,
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--c-text-md)',
                  cursor: 'pointer',
                  fontFamily: FONTS.ui,
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                Reopen folder
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleOpen}
          title="Fix missing images"
          style={{
            width: '100%',
            minHeight: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 4px',
            border: 'none',
            borderRadius: 6,
            background: toneBg,
            color: 'var(--c-text-lo)',
            cursor: 'pointer',
            fontFamily: FONTS.ui,
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--c-text-md)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--c-text-lo)';
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: '#f59e0b', flexShrink: 0, opacity: 0.9 }} />
          <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600 }}>
            Some notes have missing images
          </span>
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: '#b45309' }}>
            {missingImages.length}
          </span>
        </button>
      </div>
    );
  }
);

export default WorkspaceExplorerMissingImagesControl;
