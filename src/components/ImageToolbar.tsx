import { useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { ImageNode } from '../types';
import { saveImageAsset, saveWorkspace, getWorkspaceName } from '../utils/workspaceManager';
import { useToolbarPosition } from '../utils/useToolbarPosition';

function IconBtn({
  onClick,
  label,
  amber,
  children,
}: {
  onClick: () => void;
  label: string;
  amber?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative px-0.5 py-1" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onClick}
        className={[
          'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
          amber
            ? 'text-[#f59e0b] hover:bg-[#f59e0b]/15'
            : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        {children}
      </button>
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-md bg-[var(--c-panel)] border border-[var(--c-border)] shadow-lg pointer-events-none whitespace-nowrap font-sans text-[10px] text-[var(--c-text-md)] z-50">
          {label}
        </div>
      )}
    </div>
  );
}

interface Props {
  nodeId: string;
}

export default function ImageToolbar({ nodeId }: Props) {
  const { nodes, camera, updateNode, imageAssetFolder } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as ImageNode | undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameHovered, setNameHovered] = useState(false);

  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;
  const anchorDotY = sy - 20 * camera.scale;
  const toolbarTop = anchorDotY - 40 - 8;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: toolbarTop,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  const isMissing = !node.src;
  const fileName = node.assetName ?? 'image.png';
  const folder = node.assetFolder ?? imageAssetFolder;
  const fullPath = node.assetName ? `${folder}/${fileName}` : fileName;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = node.src;
    a.download = fileName;
    a.click();
  };

  const handleRelink = async (file: File) => {
    const inWorkspace = !!getWorkspaceName();
    if (inWorkspace && node.assetName) {
      // Overwrite the existing asset file in the same folder, keep the same assetName
      const folder = node.assetFolder ?? 'assets';
      const objectUrl = URL.createObjectURL(file);
      await saveImageAsset(node.assetName, file, folder);
      updateNode(nodeId, { src: objectUrl } as Partial<ImageNode>);
      setTimeout(() => saveWorkspace(useBoardStore.getState().exportData()), 0);
    } else {
      // Standalone mode: embed as base64
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateNode(nodeId, { src: ev.target?.result as string, assetName: file.name } as Partial<ImageNode>);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleRelink(file);
        }}
      />
      <div
        ref={tbRef}
        style={tbStyle}
        className="flex items-center gap-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-visible"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── File name / missing indicator ──────────────────────────── */}
        <div
          className="relative flex items-center gap-1.5 px-3 py-1 h-10"
          onMouseEnter={() => setNameHovered(true)}
          onMouseLeave={() => setNameHovered(false)}
        >
          {isMissing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#f59e0b] shrink-0">
              <path d="M7 1.5L13 12H1L7 1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
              <path d="M7 6v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <circle cx="7" cy="10.5" r="0.6" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--c-text-lo)] shrink-0">
              <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M1 9.5l3-3 2.5 2.5L9 7l4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
            </svg>
          )}
          <span className={['font-sans text-[11px] max-w-[160px] truncate', isMissing ? 'text-[#f59e0b]' : 'text-[var(--c-text-md)]'].join(' ')}>
            {isMissing ? `Missing: ${fileName}` : fileName}
          </span>
          {nameHovered && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--c-panel)] border border-[var(--c-border)] shadow-xl pointer-events-none z-50 flex flex-col gap-0.5" style={{ minWidth: 'max-content' }}>
              <span className="font-sans text-[9px] text-[var(--c-text-off)] uppercase tracking-widest">path</span>
              <span className="font-sans text-[11px] text-[var(--c-text-hi)]">
                <span className="text-[var(--c-text-off)]">{folder}/</span>{fileName}
              </span>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-[var(--c-border)]" />

        {/* ── Replace / Re-link ──────────────────────────────────────── */}
        <IconBtn
          onClick={() => fileInputRef.current?.click()}
          label={isMissing ? 'Re-link file' : 'Replace image'}
          amber={isMissing}
        >
          {/* Loop / cycle arrow icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7A4.5 4.5 0 0 1 7 2.5c1.5 0 2.8.73 3.6 1.86" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M11.5 7A4.5 4.5 0 0 1 7 11.5c-1.5 0-2.8-.73-3.6-1.86" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M10 2l1.6 2.36L9 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 12l-1.6-2.36L5 9.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconBtn>

        {/* ── Download (only when image is loaded) ────────────────────── */}
        {!isMissing && (
          <>
            <div className="w-px h-6 bg-[var(--c-border)]" />
            <IconBtn onClick={handleDownload} label="Download image">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 10h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </IconBtn>
          </>
        )}
      </div>
    </>
  );
}
