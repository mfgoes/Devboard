const DEVICE_ID_KEY = 'devboard:device-id';

export type DeviceKind = 'mac' | 'windows' | 'linux' | 'mobile' | 'device';

export interface DeviceInfo {
  kind: DeviceKind;
  platform: string;
  browser: string;
}

export interface WorkspaceLocationMetadata {
  workspaceName?: string;
  folderName?: string | null;
  deviceKind: DeviceKind;
  platform: string;
  browser: string;
  pathKind: 'full-path' | 'folder-name' | 'unknown';
  lastLocalSavedAt?: number | null;
  lastSyncedAt?: number | null;
  action?: string;
}

export interface WorkspaceLocationLabel {
  label: string;
  deviceLabel: string;
  folderName: string | null;
  fullPath: string | null;
  deviceKind: DeviceKind;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown-device';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = randomId();
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function browserFromUserAgent(userAgent: string): string {
  return userAgent.includes('Firefox')
    ? 'Firefox'
    : userAgent.includes('Edg/')
      ? 'Edge'
      : userAgent.includes('Chrome')
        ? 'Chrome'
        : userAgent.includes('Safari')
          ? 'Safari'
          : 'Browser';
}

function kindFromPlatform(platform: string, userAgent = ''): DeviceKind {
  const haystack = `${platform} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|android|mobile/.test(haystack)) return 'mobile';
  if (/mac/.test(haystack)) return 'mac';
  if (/win/.test(haystack)) return 'windows';
  if (/linux|x11/.test(haystack)) return 'linux';
  return 'device';
}

export function getCurrentDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { kind: 'device', platform: 'Unknown device', browser: 'Browser' };
  }
  const platform = navigator.platform || 'Device';
  const userAgent = navigator.userAgent || '';
  return {
    kind: kindFromPlatform(platform, userAgent),
    platform,
    browser: browserFromUserAgent(userAgent),
  };
}

export function getDeviceLabel(): string {
  const info = getCurrentDeviceInfo();
  return `${info.platform} · ${info.browser}`;
}

export function parseDeviceLabel(label?: string | null): DeviceInfo {
  const [platformPart, browserPart] = (label ?? '').split('·').map((part) => part.trim());
  const platform = platformPart || 'Device';
  const browser = browserPart || 'Browser';
  return {
    kind: kindFromPlatform(platform),
    platform,
    browser,
  };
}

export function folderNameFromPath(path?: string | null): string | null {
  const normalized = path?.replace(/\\/g, '/').replace(/\/+$/, '').trim();
  if (!normalized) return null;
  return normalized.split('/').filter(Boolean).pop() ?? normalized;
}

export function friendlyDeviceName(
  label?: string | null,
  options: { isCurrent?: boolean } = {},
): { name: string; kind: DeviceKind } {
  const info = label ? parseDeviceLabel(label) : getCurrentDeviceInfo();
  const base = info.kind === 'mac'
    ? 'Mac'
    : info.kind === 'windows'
      ? 'Windows PC'
      : info.kind === 'linux'
        ? 'Linux desktop'
        : info.kind === 'mobile'
          ? 'Mobile device'
          : 'Device';
  return {
    name: options.isCurrent ? `This ${base}` : base,
    kind: info.kind,
  };
}

export function buildWorkspaceLocationMetadata(options: {
  workspaceName?: string;
  localPathHint?: string | null;
  lastLocalSavedAt?: number | null;
  lastSyncedAt?: number | null;
  action?: string;
}): WorkspaceLocationMetadata {
  const info = getCurrentDeviceInfo();
  const folderName = folderNameFromPath(options.localPathHint);
  return {
    workspaceName: options.workspaceName,
    folderName,
    deviceKind: info.kind,
    platform: info.platform,
    browser: info.browser,
    pathKind: options.localPathHint
      ? options.localPathHint.includes('/') || options.localPathHint.includes('\\')
        ? 'full-path'
        : 'folder-name'
      : 'unknown',
    lastLocalSavedAt: options.lastLocalSavedAt ?? null,
    lastSyncedAt: options.lastSyncedAt ?? null,
    action: options.action,
  };
}

export function formatWorkspaceLocationLabel(location: {
  deviceId?: string | null;
  deviceLabel?: string | null;
  localPathHint?: string | null;
  folderName?: string | null;
}): WorkspaceLocationLabel {
  const currentDeviceId = getDeviceId();
  const isCurrent = !!location.deviceId && location.deviceId === currentDeviceId;
  const device = friendlyDeviceName(location.deviceLabel, { isCurrent });
  const folderName = location.folderName ?? folderNameFromPath(location.localPathHint);
  return {
    label: folderName ? `${device.name} · ${folderName}` : device.name,
    deviceLabel: device.name,
    folderName,
    fullPath: location.localPathHint ?? null,
    deviceKind: device.kind,
  };
}
