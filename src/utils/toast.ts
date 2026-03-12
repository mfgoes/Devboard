type Listener = (msg: string) => void;
let _listener: Listener | null = null;

export function setToastListener(fn: Listener) {
  _listener = fn;
}

export function toast(msg: string) {
  _listener?.(msg);
}
