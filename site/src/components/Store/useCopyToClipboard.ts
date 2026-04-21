import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(text: string | null) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          timerRef.current = setTimeout(() => setCopied(false), 2000);
        },
        () => {
          // Clipboard write denied — ignore silently
        },
      );
    }
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { copied, handleCopy };
}
