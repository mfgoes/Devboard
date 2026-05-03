import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import { generateMarkdownFilename, htmlToMarkdown } from '../utils/exportMarkdown';
import { hasWorkspaceHandle, saveTextFileToWorkspace } from '../utils/workspaceManager';

const DEBOUNCE_MS = 1500;

interface UseDocumentAutoSaveOptions {
  node?: DocumentNode;
  docId?: string | null;
  enabled?: boolean;
  suspended?: boolean;
  onSaved?: () => void;
}

export function useDocumentAutoSave({
  node,
  docId,
  enabled = true,
  suspended = false,
  onSaved,
}: UseDocumentAutoSaveOptions) {
  const updateNode = useBoardStore((s) => s.updateNode);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const documents = useBoardStore((s) => s.documents);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSignatureRef = useRef<string | null>(null);

  const resolvedDocId = docId ?? node?.docId ?? null;
  const doc = resolvedDocId ? documents.find((d) => d.id === resolvedDocId) : undefined;
  const title = doc?.title ?? node?.title ?? '';
  const content = doc?.content ?? node?.content ?? '';
  const linkedFile = doc?.linkedFile ?? node?.linkedFile;
  const signature = `${title}\u0000${content}\u0000${linkedFile ?? ''}`;

  useEffect(() => {
    if (previousSignatureRef.current === null) {
      previousSignatureRef.current = signature;
      return;
    }

    if (previousSignatureRef.current === signature) return;
    previousSignatureRef.current = signature;

    if (!enabled || suspended) return;
    if (!hasWorkspaceHandle()) return;
    if (!title.trim()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const md = htmlToMarkdown(content);
      const fileName = generateMarkdownFilename(title);
      const resolvedLinkedFile = linkedFile ?? `notes/${fileName}`;
      const parts = resolvedLinkedFile.split('/').filter(Boolean);
      const file = parts.pop();
      if (!file) return;

      const folder = parts.join('/');
      const ok = await saveTextFileToWorkspace(folder, file, md);
      if (!ok) return;

      if (!linkedFile) {
        if (doc) {
          updateDocument(doc.id, { linkedFile: resolvedLinkedFile });
        } else if (node) {
          updateNode(node.id, { linkedFile: resolvedLinkedFile } as Partial<DocumentNode>);
        }
      }

      onSaved?.();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, doc, enabled, linkedFile, node, onSaved, signature, suspended, title, updateDocument, updateNode]);
}
