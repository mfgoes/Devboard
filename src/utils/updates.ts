const DOWNLOAD_PAGE_URL = 'https://mfgoes.github.io/Devboard/download.html';
const LAST_CHECK_AT_KEY = 'devboard:last-update-check-at';
const LAST_NOTIFIED_VERSION_KEY = 'devboard:last-update-notified-version';
const AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type UpdateCheckResult =
  | {
      status: 'unsupported';
    }
  | {
      status: 'update-available';
      update: import('@tauri-apps/plugin-updater').Update;
      currentVersion: string;
      latestVersion: string;
      publishedAt?: string;
      notes?: string;
    }
  | {
      status: 'up-to-date';
      currentVersion: string;
      latestVersion: string;
    }
  | {
      status: 'error';
      currentVersion?: string;
      message: string;
    };

function readNumber(key: string): number {
  if (typeof window === 'undefined') return 0;
  const value = window.localStorage.getItem(key);
  return value ? Number.parseInt(value, 10) || 0 : 0;
}

export function shouldAutoCheckForUpdates(now = Date.now()): boolean {
  return now - readNumber(LAST_CHECK_AT_KEY) >= AUTO_CHECK_INTERVAL_MS;
}

export function markUpdateCheck(now = Date.now()) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_CHECK_AT_KEY, String(now));
}

export function getLastNotifiedVersion(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_NOTIFIED_VERSION_KEY);
}

export function markUpdateNotified(version: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, version.trim().replace(/^v/i, ''));
}

export function getUpdateDownloadUrl() {
  return DOWNLOAD_PAGE_URL;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (!isTauri()) return { status: 'unsupported' };

    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (update) {
      return {
        status: 'update-available',
        update,
        currentVersion: update.currentVersion,
        latestVersion: update.version,
        publishedAt: update.date,
        notes: update.body,
      };
    }

    const { getVersion } = await import('@tauri-apps/api/app');
    const currentVersion = await getVersion();

    return {
      status: 'up-to-date',
      currentVersion,
      latestVersion: currentVersion,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown update check error';
    return {
      status: 'error',
      message,
    };
  }
}
