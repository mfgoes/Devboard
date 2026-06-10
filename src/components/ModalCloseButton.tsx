type ModalCloseButtonProps = {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
};

export default function ModalCloseButton({
  onClick,
  ariaLabel = 'Close',
  className = '',
}: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--c-text-lo)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
        className,
      ].join(' ')}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M3.5 3.5 12.5 12.5" />
        <path d="M12.5 3.5 3.5 12.5" />
      </svg>
    </button>
  );
}
