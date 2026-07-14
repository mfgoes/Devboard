import { type PointerEvent } from 'react';
import { type DocumentCommandDefinition } from './documentCommands';
import { IconGrip } from './icons';

export interface LineHandleState {
  block: HTMLElement;
  rect: { left: number; top: number; width: number; height: number };
}

interface DocumentLineHandleProps {
  lineHandle: LineHandleState | null;
  lineHandleMenu: LineHandleState | null;
  turnIntoCommands: DocumentCommandDefinition[];
  onCancelHide: () => void;
  onScheduleHide: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, handle: LineHandleState) => void;
  onTurnInto: (command: DocumentCommandDefinition, block: HTMLElement) => void;
}

export default function DocumentLineHandle({
  lineHandle,
  lineHandleMenu,
  turnIntoCommands,
  onCancelHide,
  onScheduleHide,
  onPointerDown,
  onTurnInto,
}: DocumentLineHandleProps) {
  return (
    <>
      {lineHandle && !lineHandleMenu && (() => {
        const hitTop = Math.max(8, lineHandle.rect.top - 4);
        const hitHeight = Math.max(34, lineHandle.rect.height + 8);
        return (
          <>
            <div
              aria-hidden="true"
              style={{
                position: 'fixed',
                left: lineHandle.rect.left - 6,
                top: lineHandle.rect.top - 2,
                width: lineHandle.rect.width + 12,
                height: lineHandle.rect.height + 4,
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--c-line) 6%, transparent)',
                boxShadow: 'inset 2px 0 0 color-mix(in srgb, var(--c-line) 45%, transparent)',
                pointerEvents: 'none',
                zIndex: 10005,
              }}
            />
            <div
              data-line-turn-ui="true"
              onPointerEnter={onCancelHide}
              onPointerLeave={onScheduleHide}
              onPointerDown={(event) => onPointerDown(event, lineHandle)}
              style={{
                position: 'fixed',
                left: Math.max(4, lineHandle.rect.left - 44),
                top: hitTop,
                zIndex: 10020,
                width: 44,
                height: hitHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingLeft: 7,
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
            <button
              type="button"
              title="Drag to move. Click to open menu."
              aria-label="Drag to move. Click to open menu."
              onPointerDown={(event) => onPointerDown(event, lineHandle)}
              style={{
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 7,
                border: '1px solid color-mix(in srgb, var(--c-border) 82%, transparent)',
                background: 'color-mix(in srgb, var(--c-panel) 92%, transparent)',
                color: 'var(--c-text-lo)',
                boxShadow: 'none',
                cursor: 'grab',
                touchAction: 'none',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.color = 'var(--c-text-hi)';
                event.currentTarget.style.borderColor = 'rgba(184,119,80,0.42)';
                event.currentTarget.style.background = 'color-mix(in srgb, var(--c-hover) 82%, var(--c-panel))';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color = 'var(--c-text-lo)';
                event.currentTarget.style.borderColor = 'color-mix(in srgb, var(--c-border) 82%, transparent)';
                event.currentTarget.style.background = 'color-mix(in srgb, var(--c-panel) 92%, transparent)';
              }}
            >
              <IconGrip />
            </button>
            </div>
          </>
        );
      })()}

      {lineHandleMenu && (
        <div
          data-line-turn-ui="true"
          onPointerEnter={onCancelHide}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(lineHandleMenu.rect.left - 36, window.innerWidth - 238)),
            top: Math.max(8, Math.min(lineHandleMenu.rect.top + 28, window.innerHeight - 332)),
            zIndex: 10000,
            width: 230,
            padding: 6,
            borderRadius: 10,
            border: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            boxShadow: '0 14px 36px rgba(0,0,0,0.32)',
          }}
        >
          <div style={{ padding: '7px 10px 6px', color: 'var(--c-text-off)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 }}>
            Turn into
          </div>
          {turnIntoCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              title={`Turn into ${command.label.toLowerCase()}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTurnInto(command, lineHandleMenu.block);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--c-text-md)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                textAlign: 'left',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--c-hover)';
                event.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
                event.currentTarget.style.color = 'var(--c-text-md)';
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 22,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: 'rgba(184,119,80,0.12)',
                  color: 'var(--c-line)',
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: command.id === 'code-block' ? 'JetBrains Mono, monospace' : 'inherit',
                }}
              >
                {command.glyph}
              </span>
              <span>{command.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
