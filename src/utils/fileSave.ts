import { saveAs } from 'file-saver';
import { BoardData } from '../types';
import { toast } from './toast';

// Module-level handle — persists for the browser session
let fileHandle: FileSystemFileHandle | null = null;

const FSA_SUPPORTED = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

type FSAWindow = Window & typeof globalThis & {
  showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>;
};

interface SaveBoardOptions {
  notify?: boolean;
}

export interface SaveBoardResult {
  saved: boolean;
  location: 'file' | 'download';
  targetName?: string;
}

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
export async function saveBoard(data: BoardData, options: SaveBoardOptions = {}): Promise<SaveBoardResult> {
  const shouldNotify = options.notify !== false;

  if (!FSA_SUPPORTED) {
    saveAs(jsonBlob(data), suggestedName(data));
    if (shouldNotify) toast(`Downloaded · ${suggestedName(data)}`);
    return { saved: true, location: 'download', targetName: suggestedName(data) };
  }

  const isOverwrite = !!fileHandle;
  if (!fileHandle) {
    try {
      fileHandle = await (window as FSAWindow).showSaveFilePicker({
        suggestedName: suggestedName(data),
        types: [{ description: 'DevBoard file', accept: { 'application/json': ['.json', '.devboard.json'] } }],
      });
    } catch {
      return { saved: false, location: 'file' }; // user cancelled
    }
  }

  await writeHandle(fileHandle, data);
  if (shouldNotify) toast(isOverwrite ? `Overwritten · ${fileHandle.name}` : `Saved · ${fileHandle.name}`);
  return { saved: true, location: 'file', targetName: fileHandle.name };
}

/** "Save as JSON" — always opens picker so user can choose a new location. */
export async function saveBoardAs(data: BoardData, options: SaveBoardOptions = {}): Promise<SaveBoardResult> {
  const shouldNotify = options.notify !== false;

  if (!FSA_SUPPORTED) {
    saveAs(jsonBlob(data), suggestedName(data));
    if (shouldNotify) toast(`Downloaded · ${suggestedName(data)}`);
    return { saved: true, location: 'download', targetName: suggestedName(data) };
  }
  try {
    fileHandle = await (window as FSAWindow).showSaveFilePicker({
      suggestedName: suggestedName(data),
      types: [{ description: 'DevBoard file', accept: { 'application/json': ['.json', '.devboard.json'] } }],
    });
  } catch {
    return { saved: false, location: 'file' }; // user cancelled
  }
  await writeHandle(fileHandle, data);
  if (shouldNotify) toast(`Saved · ${fileHandle.name}`);
  return { saved: true, location: 'file', targetName: fileHandle.name };
}

/** Call when loading a board so ⌘S doesn't overwrite the wrong file. */
export function clearFileHandle(): void {
  fileHandle = null;
}
