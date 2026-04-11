import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode } from '../types';

const REACTIONS = ['👍', '❤️', '😄', '🎉', '🔥'];

// Smiley icon for "add / change reaction"
function SmileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3.8" cy="4.5" r="0.7" fill="currentColor" />
      <circle cx="7.2" cy="4.5" r="0.7" fill="currentColor" />
      <path d="M3.5 6.8 C4 7.8 7 7.8 7.5 6.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  nodeId: string;
  isSelected: boolean;
}

export default function EmojiReactionPicker({ nodeId, isSelected }: Props) {
  const { nodes, camera, setReaction } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as StickyNoteNode | undefined;
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!node) return null;
  if (!node.reaction && !isSelected) return null;

  const sx = node.x * camera.scale + camera.x;
  const sy = node.y * camera.scale + camera.y;
  const sw = node.width * camera.scale;
  const sh = node.height * camera.scale;

  // Anchor point: bottom-right corner of the sticky, 6px inset
  const anchorLeft = sx + sw - 6;
  const anchorTop  = sy + sh - 6;

  return (
    <div
      style={{
        position: 'absolute',
        left: anchorLeft,
        top: anchorTop,
        zIndex: 200,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Picker popup — appears above anchor when open */}
      {pickerOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '4px 6px',
            borderRadius: 10,
            border: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
            whiteSpace: 'nowrap',
          }}
        >
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                setReaction(nodeId, node.reaction === emoji ? null : emoji);
                setPickerOpen(false);
              }}
              style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: node.reaction === emoji ? '1.5px solid var(--c-line)' : '1.5px solid transparent',
                background: node.reaction === emoji ? 'rgba(99,102,241,0.12)' : 'transparent',
                cursor: 'pointer',
                fontSize: 15,
                lineHeight: 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                if (node.reaction !== emoji)
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-hover)';
              }}
              onMouseLeave={(e) => {
                if (node.reaction !== emoji)
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
          {node.reaction && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--c-border)', margin: '0 2px' }} />
              <button
                onClick={() => { setReaction(nodeId, null); setPickerOpen(false); }}
                title="Remove reaction"
                style={{
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 5,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--c-text-lo)',
                  fontSize: 12,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-hover)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-text-lo)';
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}

      {/* Corner badge — translated to sit inside bottom-right corner */}
      <div
        style={{
          transform: 'translate(-100%, -100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px',
          borderRadius: 8,
          background: node.reaction ? 'rgba(255,255,255,0.72)' : 'transparent',
          border: node.reaction ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
          backdropFilter: node.reaction ? 'blur(4px)' : 'none',
        }}
      >
        {/* Emoji (if set) */}
        {node.reaction && (
          <span style={{ fontSize: 13, lineHeight: 1 }}>{node.reaction}</span>
        )}

        {/* Change icon — only shown when selected */}
        {isSelected && (
          <button
            onClick={() => setPickerOpen((v) => !v)}
            title={node.reaction ? 'Change reaction' : 'Add reaction'}
            style={{
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 5,
              border: pickerOpen ? '1px solid var(--c-line)' : '1px solid transparent',
              background: pickerOpen ? 'rgba(99,102,241,0.12)' : 'transparent',
              cursor: 'pointer',
              color: pickerOpen ? 'var(--c-line)' : 'rgba(0,0,0,0.4)',
              padding: 0,
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!pickerOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-line)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (!pickerOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.4)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }
            }}
          >
            <SmileIcon />
          </button>
        )}
      </div>
    </div>
  );
}
