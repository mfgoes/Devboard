import { type MouseEvent, type ReactNode } from 'react';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export const SURFACE_CLASS = {
  header: 'bg-[color-mix(in_srgb,var(--c-panel)_78%,var(--c-canvas))]',
  leftPane: 'bg-[color-mix(in_srgb,var(--c-canvas)_82%,var(--c-panel))]',
  second: 'bg-[var(--color-background-secondary)]',
  quiet: 'bg-[color-mix(in_srgb,var(--c-canvas)_42%,var(--c-panel))]',
} as const;

const BUTTON_BASE_CLASS = 'inline-flex items-center justify-center rounded-lg font-sans font-semibold transition-colors disabled:cursor-default disabled:opacity-60';
const BUTTON_SIZE_CLASS = {
  xs: 'px-2.5 py-1.5 text-[11px]',
  sm: 'px-4 py-2 text-[12px]',
  md: 'px-4 py-2.5 text-[13px]',
} as const;
const BUTTON_VARIANT_CLASS = {
  primary: 'border border-transparent bg-[var(--c-line)] text-white transition-opacity hover:opacity-90',
  secondary: 'border border-[var(--c-border)] bg-[var(--c-panel)] text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
  ghost: 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)]',
  danger: 'border border-transparent bg-[var(--c-red)] text-white transition-opacity hover:opacity-90',
} as const;

type ModalActionButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: keyof typeof BUTTON_VARIANT_CLASS;
  size?: keyof typeof BUTTON_SIZE_CLASS;
  className?: string;
};

export function ModalActionButton({
  children,
  onClick,
  type = 'button',
  disabled,
  variant = 'secondary',
  size = 'xs',
  className,
}: ModalActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(BUTTON_BASE_CLASS, BUTTON_SIZE_CLASS[size], BUTTON_VARIANT_CLASS[variant], className)}
    >
      {children}
    </button>
  );
}

type InlinePanelProps = {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'quiet' | 'accent' | 'warning';
};

export function InlinePanel({ children, className, tone = 'neutral' }: InlinePanelProps) {
  const toneClass = {
    neutral: cx('border-[var(--c-border)]', SURFACE_CLASS.second),
    quiet: cx('border-[var(--c-border)]', SURFACE_CLASS.quiet),
    accent: 'border-[var(--c-line)]/25 bg-[color-mix(in_srgb,var(--c-line)_10%,transparent)]',
    warning: 'border-[var(--c-yellow)]/35 bg-[color-mix(in_srgb,var(--c-yellow)_10%,transparent)]',
  }[tone];

  return (
    <div className={cx('rounded-lg border px-3 py-2', toneClass, className)}>
      {children}
    </div>
  );
}

type DropdownMenuProps = {
  children: ReactNode;
  className?: string;
  onMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
};

export function DropdownMenu({ children, className, onMouseDown }: DropdownMenuProps) {
  return (
    <div
      className={cx('absolute right-4 top-12 z-30 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl', className)}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}

type DropdownMenuItemProps = {
  children: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  className?: string;
};

export function DropdownMenuItem({ children, onClick, tone = 'default', disabled, className }: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold transition-colors disabled:cursor-default disabled:opacity-60',
        tone === 'danger'
          ? 'text-[var(--c-red)] hover:bg-[color-mix(in_srgb,var(--c-red)_12%,transparent)] hover:text-[var(--c-red)]'
          : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

type ProgressPanelProps = {
  label: string;
  percent: number;
  warning?: string;
  className?: string;
};

export function ProgressPanel({ label, percent, warning, className }: ProgressPanelProps) {
  return (
    <InlinePanel className={className} tone="accent">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">{label}</p>
        <span className="shrink-0 font-sans text-[11px] font-semibold text-[var(--c-line)]">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--c-border)]/60">
        <div className="h-full rounded-full bg-[var(--c-line)] transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      {warning && (
        <p className="mt-2 font-sans text-[11px] leading-relaxed text-[var(--c-red)]">{warning}</p>
      )}
    </InlinePanel>
  );
}
