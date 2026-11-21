import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyFeedback(durationMs: number) {
  const [visible, setVisible] = useState(false);
  const mounted = useRef(true);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeout.current !== undefined) {
        clearTimeout(timeout.current);
        timeout.current = undefined;
      }
    };
  }, []);

  const showFeedback = useCallback(() => {
    // A clipboard write may resolve after the control that started it has unmounted.
    if (!mounted.current) {
      return;
    }
    setVisible(true);
    if (timeout.current !== undefined) {
      clearTimeout(timeout.current);
    }
    timeout.current = setTimeout(() => {
      timeout.current = undefined;
      setVisible(false);
    }, durationMs);
  }, [durationMs]);

  return [visible, showFeedback] as const;
}
