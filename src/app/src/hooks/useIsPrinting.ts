import { useEffect, useState } from 'react';

/**
 * Hook that detects when the page is in print mode.
 * Returns true when the browser is printing, false otherwise.
 */
export function useIsPrinting(): boolean {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('print');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsPrinting(e.matches);
    };

    // Set initial state
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isPrinting;
}
