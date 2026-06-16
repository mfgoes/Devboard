import type { DeviceKind } from '../utils/deviceIdentity';

export function IconGitHub() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.47-.15.47-.33v-1.18c-1.9.41-2.3-.8-2.3-.8-.3-.78-.74-.99-.74-.99-.6-.41.05-.4.05-.4.67.05 1.03.69 1.03.69.6 1.02 1.57.72 1.95.55.06-.43.24-.72.43-.89-1.52-.17-3.13-.76-3.13-3.38 0-.75.27-1.36.7-1.84-.07-.17-.3-.87.07-1.82 0 0 .58-.19 1.9.7a6.6 6.6 0 0 1 3.46 0c1.32-.89 1.89-.7 1.89-.7.38.95.15 1.65.08 1.82.44.48.7 1.09.7 1.84 0 2.63-1.61 3.2-3.15 3.37.25.21.46.62.46 1.26v1.87c0 .18.12.39.48.33A6.8 6.8 0 0 0 8 1.2Z" />
    </svg>
  );
}

export function IconGoogle() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M16.45 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.18a3.58 3.58 0 0 1-1.55 2.35v2h2.52c1.48-1.36 2.3-3.37 2.3-5.99Z" fill="currentColor" />
      <path d="M9 16.75c2.09 0 3.85-.69 5.14-1.87l-2.52-2c-.7.47-1.6.75-2.62.75-2.01 0-3.71-1.36-4.32-3.19H2.08v2.06A7.75 7.75 0 0 0 9 16.75Z" fill="currentColor" opacity="0.9" />
      <path d="M4.68 10.44A4.66 4.66 0 0 1 4.44 9c0-.5.08-.99.24-1.44V5.5H2.08A7.75 7.75 0 0 0 1.25 9c0 1.24.3 2.42.83 3.5l2.6-2.06Z" fill="currentColor" opacity="0.75" />
      <path d="M9 4.37c1.14 0 2.16.39 2.96 1.16l2.22-2.22C12.84 2.06 11.09 1.25 9 1.25A7.75 7.75 0 0 0 2.08 5.5l2.6 2.06C5.29 5.73 6.99 4.37 9 4.37Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function IconDevice({ kind }: { kind: DeviceKind }) {
  if (kind === 'mac') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Mac">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M11.9 8.5c0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.1-2.2-1.1-.9-.1-1.8.5-2.3.5s-1.2-.5-2-.5c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.8.8 6.3.5.8 1.1 1.6 2 1.6.8 0 1.1-.5 2-.5s1.2.5 2 .5.1.1 2-1.7c.4-.6.6-1.2.7-1.3-.1 0-1.6-.6-1.6-2.5ZM10.4 4.1c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.5-.7 1.2-.6 1.8.6.1 1.3-.3 1.7-.8Z" />
        </svg>
      </span>
    );
  }
  if (kind === 'windows') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Windows">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.7 3.1 7 2.4v5.1H1.7V3.1Zm6-.8 6.6-.9v6.1H7.7V2.3ZM1.7 8.2H7v5.2l-5.3-.7V8.2Zm6 0h6.6v6.1l-6.6-.9V8.2Z" />
        </svg>
      </span>
    );
  }
  if (kind === 'mobile') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Mobile">
        <svg width="12" height="13" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <rect x="2.2" y="1.4" width="7.6" height="13.2" rx="1.6" />
          <path d="M5 12.2h2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Device">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="2" y="3" width="12" height="8" rx="1.2" />
        <path d="M6 13h4M8 11v2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function tablerDeviceClass(kind: DeviceKind | null | undefined): string {
  return kind === 'mac' ? 'ti-brand-apple' : 'ti-device-desktop';
}

export function IconRefresh() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M10.2 4.2a4.1 4.1 0 1 0 .2 4.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M10.4 1.9v2.6H7.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconFolderOpen() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.4 4.3a1 1 0 0 1 1-1h2.2l1 1h5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M1.8 5.6h9.8l-1 4.4a1 1 0 0 1-1 .8H2.8a1 1 0 0 1-1-.8l-.6-3.2a1 1 0 0 1 .6-1.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M3 4.3 5.5 6.8 8 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconNewWorkspace() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.5 4.1a1 1 0 0 1 1-1h2.2l1 1h4.8a1 1 0 0 1 1 1v4.4a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V4.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.5 5.7v3M5 7.2h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconEmptyCloud() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5.8 13.4H13a3 3 0 0 0 .3-6 4.3 4.3 0 0 0-8.2-1.1A3.6 3.6 0 0 0 5.8 13.4Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.2v3.2M7.4 9.8h3.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="currentColor" opacity="0.18" />
      <path d="M3.2 6.1 5.1 7.9 8.9 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPage() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <path d="M3 2h5.1L11 4.9V12H3V2Z" />
      <path d="M8 2v3h3M4.8 7.2h4.4M4.8 9.2h3" strokeLinecap="round" />
    </svg>
  );
}

export function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <path d="M3 2.5h8v9H3z" />
      <path d="M5 5h4M5 7h4M5 9h2.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconAsset() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <rect x="2.5" y="3" width="9" height="8" rx="1.4" />
      <path d="M4.3 9.2 6.2 7.3l1.3 1.2.9-1 1.4 1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.2" cy="5.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="7" r="1.15" />
      <circle cx="7" cy="7" r="1.15" />
      <circle cx="11" cy="7" r="1.15" />
    </svg>
  );
}
