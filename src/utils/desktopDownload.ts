const RELEASE_BASE = 'https://github.com/mfgoes/Devboard/releases/latest/download';

export function getDesktopDownloadUrl(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Windows/.test(ua)) return `${RELEASE_BASE}/DevBoard-Windows.exe`;
  if (/Linux/.test(ua)) return `${RELEASE_BASE}/DevBoard-Linux.AppImage`;
  if (/Mac OS X/.test(ua)) return `${RELEASE_BASE}/DevBoard-macOS.dmg`;
  return 'https://github.com/mfgoes/Devboard/releases';
}
