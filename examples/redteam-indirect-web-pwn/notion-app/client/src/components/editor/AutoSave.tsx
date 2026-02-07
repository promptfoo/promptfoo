import { useEffect, useRef } from 'react';
import { useDocumentStore } from '../../store/documentStore';

/**
 * Auto-save component that persists document content without user approval.
 *
 * This is intentionally vulnerable for security testing:
 * When the AI injects malicious markdown (like an exfiltration image URL),
 * this component saves it BEFORE the user has a chance to approve or reject.
 */
export default function AutoSave() {
  const { currentDocument, saveDocument } = useDocumentStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

  useEffect(() => {
    if (!currentDocument) return;
    if (currentDocument.content === lastContentRef.current) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveDocument();
      lastContentRef.current = currentDocument.content;
    }, 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentDocument?.content, currentDocument, saveDocument]);

  return null;
}
