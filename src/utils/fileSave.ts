import { saveAs } from 'file-saver';
import { BoardData } from '../types';
import { toast } from './toast';

// Module-level handle — persists for the browser session
let fileHandle: FileSystemFileHandle | null = null;

const FSA_SUPPORTED = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

type FSAWindow = Window & typeof globalThis & {
  showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>;
};

function jsonBlob(data: BoardData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

function suggestedName(data: BoardData): string {
  return `${data.boardTitle.replace(/\s+/g, '_')}.devboard.json`;
}

async function writeHandle(handle: FileSystemFileHandle, data: BoardData): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/** ⌘S — reuse existing handle, or open picker on first call. */
export async function saveBoard(data: BoardData): Promise<void> {
  if (!FSA_SUPPORTED) {
    saveAs(jsonBlob(data), suggestedName(data));
    toast(`Downloaded · ${suggestedName(data)}`);
    return;
  }
  const isOverwrite = !!fileHandle;
  if (!fileHandle) {
    try {
      fileHandle = await (window as FSAWindow).showSaveFilePicker({
        suggestedName: suggestedName(data),
        types: [{ description: 'DevBoard file', accept: { 'application/json': ['.json', '.devboard.json'] } }],
      });
    } catch {
      return; // user cancelled
    }
  }
  await writeHandle(fileHandle, data);
  toast(isOverwrite ? `Overwritten · ${fileHandle.name}` : `Saved · ${fileHandle.name}`);
}

/** "Save as JSON" — always opens picker so user can choose a new location. */
export async function saveBoardAs(data: BoardData): Promise<void> {
  if (!FSA_SUPPORTED) {
    saveAs(jsonBlob(data), suggestedName(data));
    toast(`Downloaded · ${suggestedName(data)}`);
    return;
  }
  try {
    fileHandle = await (window as FSAWindow).showSaveFilePicker({
      suggestedName: suggestedName(data),
      types: [{ description: 'DevBoard file', accept: { 'application/json': ['.json', '.devboard.json'] } }],
    });
  } catch {
    return; // user cancelled
  }
  await writeHandle(fileHandle, data);
  toast(`Saved · ${fileHandle.name}`);
}

/** Call when loading a board so ⌘S doesn't overwrite the wrong file. */
export function clearFileHandle(): void {
  fileHandle = null;
}
