import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import { documentMarkdownFromParts, generateMarkdownFilename } from '../utils/exportMarkdown';
import { hasWorkspaceHandle, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { saveLinkedWorkspaceToCloud, type NoteSaveStatus } from '../utils/saveStatus';

const DEBOUNCE_MS = 1500;

interface UseDocumentAutoSaveOptions {
  node?: DocumentNode;
  docId?: string | null;
  enabled?: boolean;
  suspended?: boolean;
  onSaved?: () => void;
}

function sameStatus(a: NoteSaveStatus, b: NoteSaveStatus): boolean {
  return a.phase === b.phase && a.destination === b.destination && a.errorMessage === b.errorMessage;
}

export function useDocumentAutoSave({
  node,
  docId,
  enabled = true,
  suspended = false,
  onSaved,
}: UseDocumentAutoSaveOptions): NoteSaveStatus {
  const updateNode = useBoardStore((s) => s.updateNode);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const documents = useBoardStore((s) => s.documents);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const markLocalSaved = useBoardStore((s) => s.markLocalSaved);

  const resolvedDocId = docId ?? node?.docId ?? null;
  const doc = resolvedDocId ? documents.find((d) => d.id === resolvedDocId) : undefined;
  const title = doc?.title ?? node?.title ?? '';
  const content = doc?.content ?? node?.content ?? '';
  const linkedFile = doc?.linkedFile ?? node?.linkedFile;
  const identityKey = resolvedDocId ?? node?.id ?? 'none';
  const signature = `${title}\u0000${content}\u0000${linkedFile ?? ''}`;
  const destination: NoteSaveStatus['destination'] = hasWorkspaceHandle()
    ? 'local'
    : cloudBoardId
      ? 'cloud'
      : 'none';

  const [status, setStatus] = useState<NoteSaveStatus>(() => ({
    phase: 'idle',
    destination,
    errorMessage: null,
  }));

  const timerRef = useRef<number | null>(null);
  const latestSignatureRef = useRef(signature);
  const pendingSignatureRef = useRef<string | null>(null);
  const savedSignatureRef = useRef<string | null>(null);
  const bootstrappedIdentityRef = useRef<string | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
    latestSignatureRef.current = signature;
    pendingSignatureRef.current = null;
    savedSignatureRef.current = signature;
    bootstrappedIdentityRef.current = null;
    setStatus({
      phase: 'idle',
      destination,
      errorMessage: null,
    });
  }, [destination, identityKey]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    latestSignatureRef.current = signature;
  }, [signature]);

  useEffect(() => {
    const nextStatus: NoteSaveStatus = {
      phase: 'idle',
      destination,
      errorMessage: null,
    };

    const setNextStatus = (candidate: NoteSaveStatus) => {
      setStatus((current) => sameStatus(current, candidate) ? current : candidate);
    };

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleAutosave = (signatureToSave: string) => {
      clearTimer();
      pendingSignatureRef.current = signatureToSave;
      setNextStatus({
        phase: 'queued',
        destination,
        errorMessage: null,
      });

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runAutosave(signatureToSave);
      }, DEBOUNCE_MS);
    };

    const runAutosave = async (signatureToSave: string) => {
      const currentDestination = hasWorkspaceHandle()
        ? 'local'
        : cloudBoardId
          ? 'cloud'
          : 'none';

      if (currentDestination === 'none' || !enabled || suspended) {
        pendingSignatureRef.current = null;
        setNextStatus({
          phase: 'idle',
          destination: currentDestination,
          errorMessage: null,
        });
        return;
      }

      setNextStatus({
        phase: 'saving',
        destination: currentDestination,
        errorMessage: null,
      });

      try {
        if (currentDestination === 'local') {
          const md = documentMarkdownFromParts(title, content);
          const fileName = generateMarkdownFilename(title);
          const resolvedLinkedFile = linkedFile ?? `notes/${fileName}`;
          const parts = resolvedLinkedFile.split('/').filter(Boolean);
          const file = parts.pop();
          if (!file) return;

          const folder = parts.join('/');
          const ok = await saveTextFileToWorkspace(folder, file, md);
          if (!ok) throw new Error('Could not save the note to the local workspace.');

          markLocalSaved();

          if (!linkedFile) {
            if (doc) {
              updateDocument(doc.id, { linkedFile: resolvedLinkedFile });
            } else if (node) {
              updateNode(node.id, { linkedFile: resolvedLinkedFile } as Partial<DocumentNode>);
            }
          }

          savedSignatureRef.current = `${title}\u0000${content}\u0000${resolvedLinkedFile}`;
        } else {
          const ok = await saveLinkedWorkspaceToCloud('note', {
            failureMessage: 'Cloud autosave failed.',
          });
          if (!ok) throw new Error('Cloud autosave failed.');
          savedSignatureRef.current = signatureToSave;
        }

        const latestSignature = latestSignatureRef.current;
        if (latestSignature === savedSignatureRef.current) {
          pendingSignatureRef.current = null;
          setNextStatus({
            phase: 'saved',
            destination: currentDestination,
            errorMessage: null,
          });
          onSaved?.();
          return;
        }

        pendingSignatureRef.current = latestSignature;
        setNextStatus({
          phase: 'queued',
          destination: currentDestination,
          errorMessage: null,
        });

        if (timerRef.current === null && latestSignature !== savedSignatureRef.current) {
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            void runAutosave(latestSignature);
          }, DEBOUNCE_MS);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (latestSignatureRef.current === signatureToSave) {
          pendingSignatureRef.current = null;
          setNextStatus({
            phase: 'error',
            destination: currentDestination,
            errorMessage: message,
          });
        }
      }
    };

    if (suspended || !enabled || destination === 'none') {
      clearTimer();
      pendingSignatureRef.current = null;
      setNextStatus(nextStatus);
      return () => {
        clearTimer();
      };
    }

    if (bootstrappedIdentityRef.current !== identityKey) {
      bootstrappedIdentityRef.current = identityKey;
      savedSignatureRef.current = signature;
      pendingSignatureRef.current = null;
      setNextStatus({
        phase: 'idle',
        destination,
        errorMessage: null,
      });
      return () => {
        clearTimer();
      };
    }

    if (savedSignatureRef.current === signature && pendingSignatureRef.current !== signature) {
      setNextStatus({
        phase: 'saved',
        destination,
        errorMessage: null,
      });
      return () => {
        clearTimer();
      };
    }

    if (pendingSignatureRef.current !== signature) {
      scheduleAutosave(signature);
    } else if (statusRef.current.phase === 'error') {
      setNextStatus({
        phase: 'queued',
        destination,
        errorMessage: null,
      });
    }

    return () => {
      clearTimer();
    };
  }, [cloudBoardId, content, destination, doc, enabled, linkedFile, node, onSaved, signature, suspended, title, updateDocument, updateNode, markLocalSaved]);

  return status;
}
