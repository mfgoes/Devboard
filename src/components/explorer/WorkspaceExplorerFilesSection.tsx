/**
 * Real files on disk, listed straight from the opened workspace folder.
 *
 * Purely presentational: the caller owns the tree (useTreeState), the row
 * handlers (useWorkspaceExplorerFileActions) and the flattened/searched entry
 * list (useWorkspaceExplorerNavigation).
 */
import React from 'react';
import { FONTS } from '../../utils/fonts';
import { SectionChevron } from './WorkspaceExplorerParts';
import { FileIcon, fileColor, type TreeEntry } from './fileTreeUtils';
import { IconChevronDown, IconEye, IconEyeOff } from '../icons';

const ROW_HEIGHT = 24;
const INDENT_STEP = 10;
const BASE_INDENT = 6;

interface WorkspaceExplorerFilesSectionProps {
  open: boolean;
  sectionOpen: boolean;
  entries: TreeEntry[];
  focusedPath: string[] | null;
  isDark: boolean;
  rootLoading: boolean;
  rootError: string | null;
  searching: boolean;
  unopenableFilesVisible: boolean;
  renamingPath: string[] | null;
  renameDraft: string;
  newFolderParent: string[] | null;
  newFolderName: string;
  newFolderInputRef: React.RefObject<HTMLInputElement>;
  onToggleSection: () => void;
  onToggleUnopenableFiles: () => void;
  onNewFolder: () => void;
  onToggleDirectory: (path: string[]) => void;
  onFileClick: (entry: TreeEntry, clientY: number) => void;
  onFileOpen: (entry: TreeEntry) => void;
  onFileDragStart: (entry: TreeEntry, e: React.DragEvent) => void;
  onFileHover: (entry: TreeEntry, clientY: number) => void;
  onFileLeave: () => void;
  onContextMenu: (entry: TreeEntry, x: number, y: number) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: (entry: TreeEntry) => void;
  onRenameCancel: () => void;
  onNewFolderNameChange: (value: string) => void;
  onNewFolderCommit: () => void;
  onNewFolderCancel: () => void;
}

const pathKey = (path: string[]) => path.join('/');

function inlineInputStyle(indent: number): React.CSSProperties {
  return {
    width: `calc(100% - ${indent + 10}px)`,
    marginLeft: indent,
    height: 18,
    padding: '0 6px',
    background: 'var(--c-canvas)',
    border: '1px solid rgba(184,119,80,0.28)',
    borderRadius: 5,
    outline: 'none',
    fontFamily: FONTS.ui,
    fontSize: 9.75,
    color: 'var(--c-text-hi)',
  };
}

export default function WorkspaceExplorerFilesSection({
  open,
  sectionOpen,
  entries,
  focusedPath,
  isDark,
  rootLoading,
  rootError,
  searching,
  unopenableFilesVisible,
  renamingPath,
  renameDraft,
  newFolderParent,
  newFolderName,
  newFolderInputRef,
  onToggleSection,
  onToggleUnopenableFiles,
  onNewFolder,
  onToggleDirectory,
  onFileClick,
  onFileOpen,
  onFileDragStart,
  onFileHover,
  onFileLeave,
  onContextMenu,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onNewFolderNameChange,
  onNewFolderCommit,
  onNewFolderCancel,
}: WorkspaceExplorerFilesSectionProps) {
  if (!open) return null;

  const focusedKey = focusedPath ? pathKey(focusedPath) : null;
  const renamingKey = renamingPath ? pathKey(renamingPath) : null;
  const newFolderKey = newFolderParent ? pathKey(newFolderParent) : null;

  const renderNewFolderInput = (indent: number) => (
    <input
      ref={newFolderInputRef}
      value={newFolderName}
      placeholder="New folder"
      onChange={(e) => onNewFolderNameChange(e.target.value)}
      onBlur={onNewFolderCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onNewFolderCommit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onNewFolderCancel();
        }
        e.stopPropagation();
      }}
      style={inlineInputStyle(indent)}
    />
  );

  return (
    <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--c-sidebar-border)' }}>
      <div
        onClick={onToggleSection}
        className="group"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minHeight: 22,
          padding: '4px 10px 3px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 650, letterSpacing: '0.02em', color: 'var(--c-sidebar-section)' }}>Files</span>
        <SectionChevron open={sectionOpen} />
        <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 8.5, color: 'var(--c-sidebar-meta)' }}>{entries.length}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleUnopenableFiles();
          }}
          title={unopenableFilesVisible
            ? 'Hide files DevBoard can’t open'
            : 'Show files DevBoard can’t open'}
          aria-pressed={!unopenableFilesVisible}
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 4,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            color: unopenableFilesVisible ? 'var(--c-sidebar-item-text)' : 'var(--c-line)',
            cursor: 'pointer',
            flexShrink: 0,
            // Stays visible while filtering so the hidden rows are never a mystery.
            opacity: unopenableFilesVisible ? 0 : 1,
            transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
          }}
          className="group-hover:opacity-100 focus:opacity-100"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--c-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {unopenableFilesVisible ? <IconEye size={11} /> : <IconEyeOff size={11} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNewFolder();
          }}
          title="New folder"
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 4,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            color: 'var(--c-sidebar-item-text)',
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: FONTS.ui,
            fontSize: 12,
            lineHeight: 1,
            opacity: 0,
            transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
          }}
          className="group-hover:opacity-100 focus:opacity-100"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--c-hover)';
            e.currentTarget.style.color = 'var(--c-text-hi)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--c-text-lo)';
          }}
        >
          +
        </button>
      </div>

      {sectionOpen && (
        <div style={{ padding: '0 8px 6px' }}>
          {newFolderKey === '' && renderNewFolderInput(BASE_INDENT)}

          {rootError && (
            <div style={{ padding: '4px 8px', fontFamily: FONTS.ui, fontSize: 9.5, color: '#f87171' }}>
              {rootError}
            </div>
          )}

          {!rootError && rootLoading && entries.length === 0 && (
            <div style={{ padding: '4px 8px', fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-sidebar-meta)' }}>
              Loading…
            </div>
          )}

          {!rootError && !rootLoading && entries.length === 0 && (
            <div style={{ padding: '4px 8px', fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-sidebar-meta)' }}>
              {searching
                ? 'No matching files'
                : unopenableFilesVisible
                  ? 'No files in this folder'
                  : 'No openable files — use the eye icon to show the rest'}
            </div>
          )}

          {entries.map((entry) => {
            const key = pathKey(entry.path);
            const isDirectory = entry.kind === 'directory';
            const isFocused = key === focusedKey;
            const isRenaming = key === renamingKey;
            // Search results are flat; only the real tree is indented.
            const depth = searching ? 0 : entry.path.length - 1;
            const indent = BASE_INDENT + depth * INDENT_STEP;

            return (
              <React.Fragment key={key}>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => onRenameDraftChange(e.target.value)}
                    onBlur={() => onRenameCommit(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onRenameCommit(entry);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        onRenameCancel();
                      }
                      e.stopPropagation();
                    }}
                    style={inlineInputStyle(indent)}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={-1}
                    data-focused={isFocused ? 'true' : undefined}
                    title={searching ? key : entry.name}
                    draggable={!isDirectory}
                    onDragStart={(e) => {
                      if (isDirectory) {
                        e.preventDefault();
                        return;
                      }
                      onFileDragStart(entry, e);
                    }}
                    onClick={(e) => {
                      if (isDirectory) onToggleDirectory(entry.path);
                      else onFileClick(entry, e.clientY);
                    }}
                    onDoubleClick={() => {
                      if (!isDirectory) onFileOpen(entry);
                    }}
                    onMouseEnter={(e) => {
                      if (!isDirectory) onFileHover(entry, e.clientY);
                    }}
                    onMouseLeave={() => {
                      if (!isDirectory) onFileLeave();
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onContextMenu(entry, e.clientX, e.clientY);
                    }}
                    style={{
                      width: '100%',
                      minHeight: ROW_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 6px',
                      paddingLeft: indent,
                      background: isFocused ? 'var(--c-sidebar-item-active)' : 'none',
                      borderLeft: isFocused ? '2px solid var(--c-line)' : '2px solid transparent',
                      borderRadius: 5,
                      cursor: 'pointer',
                      textAlign: 'left',
                      opacity: entry.loading ? 0.6 : 1,
                    }}
                    className="hover:bg-[var(--c-sidebar-item-hover)]"
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'var(--c-sidebar-item-text)',
                        transform: isDirectory && !entry.expanded ? 'rotate(-90deg)' : 'none',
                        transition: 'transform 0.12s ease',
                        opacity: isDirectory ? 1 : 0,
                      }}
                    >
                      {isDirectory && <IconChevronDown size={10} />}
                    </span>
                    <FileIcon name={entry.name} kind={entry.kind} />
                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: FONTS.ui,
                        fontSize: 9.75,
                        fontWeight: isDirectory ? 600 : 520,
                        color: isDirectory
                          ? 'var(--c-sidebar-item-text)'
                          : fileColor(entry.name, isDark),
                      }}
                    >
                      {entry.name}
                    </span>
                  </div>
                )}

                {newFolderKey === key && renderNewFolderInput(indent + INDENT_STEP)}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
