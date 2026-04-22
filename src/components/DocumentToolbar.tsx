import { useState } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import { useToolbarPosition } from '../utils/useToolbarPosition';
import { documentToMarkdown, generateMarkdownFilename } from '../utils/exportMarkdown';
import { saveTextFileToWorkspace, hasWorkspaceHandle } from '../utils/workspaceManager';
import { toast } from '../utils/toast';

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative px-0.5 py-1" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onClick}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]"
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

export default function DocumentToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, camera, updateNode } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as DocumentNode | undefined;
  const [nameHovered, setNameHovered] = useState(false);

  const CANVAS_TOP = 44;
  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width  * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;
  const anchorDotY = sy - 20 * camera.scale;
  const toolbarTop = anchorDotY - 40 - 8 - CANVAS_TOP;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: toolbarTop,
    nodeScreenBottom: sy + sh - CANVAS_TOP,
  });

  if (!node) return null;

  const fileName = node.linkedFile
    ? node.linkedFile.split('/').pop() ?? generateMarkdownFilename(node.title)
    : generateMarkdownFilename(node.title);
  const folder = node.linkedFile
    ? node.linkedFile.split('/').slice(0, -1).join('/') || '.'
    : 'documents';
  const inWorkspace = hasWorkspaceHandle();

  const handleDownload = async () => {
    const md = documentToMarkdown(node);
    if (inWorkspace && node.linkedFile) {
      await saveTextFileToWorkspace(folder === '.' ? '' : folder, fileName, md);
      toast(`Saved · ${node.linkedFile}`);
    } else if (inWorkspace && !node.linkedFile) {
      const linkedFile = `documents/${fileName}`;
      const ok = await saveTextFileToWorkspace('documents', fileName, md);
      if (ok) {
        updateNode(node.id, { linkedFile } as Partial<DocumentNode>);
        toast(`Linked · ${linkedFile}`);
      }
    } else {
      saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), fileName);
    }
  };

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-visible"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── File name / path ────────────────────────────────────────── */}
      <div
        className="relative flex items-center gap-1.5 px-3 py-1 h-10"
        onMouseEnter={() => setNameHovered(true)}
        onMouseLeave={() => setNameHovered(false)}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[var(--c-text-lo)] shrink-0">
          <path d="M2.5 1.5h5l2.5 2.5v7.5h-7.5v-10z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M7.5 1.5v2.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M4.5 6.5h4M4.5 8.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
        <span className="font-sans text-[11px] max-w-[160px] truncate text-[var(--c-text-md)]">
          {fileName}
        </span>
        {nameHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--c-panel)] border border-[var(--c-border)] shadow-xl pointer-events-none z-50 flex flex-col gap-0.5" style={{ minWidth: 'max-content' }}>
            <span className="font-sans text-[9px] text-[var(--c-text-off)] uppercase tracking-widest">path</span>
            <span className="font-sans text-[11px] text-[var(--c-text-hi)]">
              {node.linkedFile
                ? <><span className="text-[var(--c-text-off)]">{folder}/</span>{fileName}</>
                : <span className="text-[var(--c-text-off)] italic">not linked to file</span>
              }
            </span>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Download / Save ─────────────────────────────────────────── */}
      <IconBtn
        onClick={handleDownload}
        label={inWorkspace && node.linkedFile ? `Save to ${node.linkedFile}` : inWorkspace ? `Save to documents/${fileName}` : 'Download as .md'}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 10h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </IconBtn>
    </div>
  );
}
