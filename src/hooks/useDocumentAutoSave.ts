import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import { htmlToMarkdown } from '../utils/exportMarkdown';
import { generateMarkdownFilename } from '../utils/exportMarkdown';
import { saveTextFileToWorkspace, hasWorkspaceHandle } from '../utils/workspaceManager';

const DEBOUNCE_MS = 1500;

export function useDocumentAutoSave(node: DocumentNode) {
  const updateNode = useBoardStore((s) => s.updateNode);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const documents = useBoardStore((s) => s.documents);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve title/content/linkedFile from Document entity or legacy inline fields
  const doc = node.docId ? documents.find((d) => d.id === node.docId) : undefined;
  const title = doc?.title ?? node.title ?? '';
  const content = doc?.content ?? node.content ?? '';
  const linkedFile = doc?.linkedFile ?? node.linkedFile;

  useEffect(() => {
    if (!hasWorkspaceHandle()) return;
    if (!title.trim()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const md = htmlToMarkdown(content);
      const fileName = generateMarkdownFilename(title);
      const resolvedLinkedFile = linkedFile ?? `documents/${fileName}`;
      const parts = resolvedLinkedFile.split('/').filter(Boolean);
      const file = parts.pop()!;
      const folder = parts.join('/');
      const ok = await saveTextFileToWorkspace(folder, file, md);
      if (ok && !linkedFile) {
        if (doc) {
          updateDocument(doc.id, { linkedFile: resolvedLinkedFile });
        } else {
          updateNode(node.id, { linkedFile: resolvedLinkedFile } as Partial<DocumentNode>);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, linkedFile]);
}
