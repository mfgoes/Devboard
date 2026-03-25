export interface ToastPayload {
  msg: string;
  action?: { label: string; onClick: () => void };
}

type Listener = (payload: ToastPayload) => void;
let _listener: Listener | null = null;

export function setToastListener(fn: Listener) {
  _listener = fn;
}

/** Simple string toast (backwards-compatible) */
export function toast(msg: string): void;
/** Toast with optional action button */
export function toast(msg: string, action: { label: string; onClick: () => void }): void;
export function toast(msg: string, action?: { label: string; onClick: () => void }) {
  _listener?.({ msg, action });
}
