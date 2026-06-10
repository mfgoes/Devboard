import { useBoardStore } from '../store/boardStore';
import { markdownBodyToHtml, titleFromMarkdown } from './exportMarkdown';
import { IS_TAURI, getWorkspaceName, listDirectory, saveTextFileToWorkspace, saveWorkspace } from './workspaceManager';
import { toast } from './toast';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'txt']);

interface ImportableMarkdownSource {
  name: string;
  readText: () => Promise<string>;
}

export interface ImportNotesResult {
  imported: number;
  openedDocId: string | null;
}

function fileExtension(name: string): string {
  return name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';
}

function isMarkdownName(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(fileExtension(name));
}

function normalizeImportedFilename(name: string): string {
  const trimmed = name.trim() || 'untitled.md';
  if (isMarkdownName(trimmed)) return trimmed;
  return `${trimmed}.md`;
}

async function existingWorkspaceNoteNames(): Promise<Set<string>> {
  try {
    const entries = await listDirectory(['notes']);
    return new Set(
      entries
        .filter((entry) => entry.kind === 'file')
        .map((entry) => entry.name.toLowerCase()),
    );
  } catch {
    return new Set();
  }
}

function uniqueFilename(preferred: string, usedNames: Set<string>): string {
  const normalized = normalizeImportedFilename(preferred);
  const dotIndex = normalized.lastIndexOf('.');
  const stem = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
  const extension = dotIndex > 0 ? normalized.slice(dotIndex) : '.md';
  let candidate = normalized;
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function readPickedMarkdownSources(): Promise<ImportableMarkdownSource[]> {
  if (IS_TAURI) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: true,
      title: 'Import Notes',
      filters: [{ name: 'Markdown Notes', extensions: Array.from(MARKDOWN_EXTENSIONS) }],
    });
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    return paths.map((path) => ({
      name: path.replace(/\\/g, '/').split('/').pop() ?? 'untitled.md',
      readText: () => readTextFile(path),
    }));
  }

  return new Promise<ImportableMarkdownSource[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter((file) => isMarkdownName(file.name));
      resolve(files.map((file) => ({ name: file.name, readText: () => file.text() })));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

async function importMarkdownSources(sources: ImportableMarkdownSource[]): Promise<ImportNotesResult> {
  const markdownSources = sources.filter((source) => isMarkdownName(source.name));
  if (markdownSources.length === 0) return { imported: 0, openedDocId: null };

  const state = useBoardStore.getState();
  const inWorkspace = !!getWorkspaceName();
  const usedNames = inWorkspace ? await existingWorkspaceNoteNames() : new Set<string>();
  const importedDocIds: string[] = [];

  for (const source of markdownSources) {
    const content = await source.readText();
    const title = titleFromMarkdown(source.name, content);
    const linkedFile = inWorkspace
      ? `notes/${uniqueFilename(source.name, usedNames)}`
      : undefined;

    if (linkedFile) {
      const filename = linkedFile.split('/').pop() ?? normalizeImportedFilename(source.name);
      const ok = await saveTextFileToWorkspace('notes', filename, content);
      if (!ok) {
        toast(`Could not import ${source.name}`);
        continue;
      }
    }

    const docId = state.addDocument({
      title,
      content: markdownBodyToHtml(content, title),
      linkedFile,
      pageId: state.activePageId,
    });
    importedDocIds.push(docId);
  }

  if (importedDocIds.length === 0) return { imported: 0, openedDocId: null };

  useBoardStore.getState().openDocument(importedDocIds[0]);
  if (inWorkspace) {
    void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
  }

  toast(importedDocIds.length === 1
    ? `Imported note: ${useBoardStore.getState().documents.find((doc) => doc.id === importedDocIds[0])?.title ?? 'Untitled'}`
    : `Imported ${importedDocIds.length} notes`);

  return { imported: importedDocIds.length, openedDocId: importedDocIds[0] ?? null };
}

export function extractMarkdownFiles(files: FileList | File[] | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => isMarkdownName(file.name));
}

export async function importMarkdownFileObjects(files: File[]): Promise<ImportNotesResult> {
  return importMarkdownSources(files.map((file) => ({ name: file.name, readText: () => file.text() })));
}

export async function promptAndImportMarkdownNotes(): Promise<ImportNotesResult> {
  const sources = await readPickedMarkdownSources();
  return importMarkdownSources(sources);
}
