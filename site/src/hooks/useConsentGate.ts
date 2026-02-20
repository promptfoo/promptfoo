import { useEffect, useState } from 'react';

type ConsentCategory = 'analytics' | 'marketing';

/**
 * Returns true when the given consent category has been granted.
 * Components should use this to gate third-party script injection.
 *
 * consent.js sets window.__pf_analytics_loaded / __pf_marketing_loaded
 * before React hydrates (consent.js is loaded synchronously).
 */
export function useConsentGate(category: ConsentCategory): boolean {
  const flag = category === 'analytics' ? '__pf_analytics_loaded' : '__pf_marketing_loaded';

  const [allowed, setAllowed] = useState(() => {
    return typeof window !== 'undefined' && !!(window as any)[flag];
  });

  useEffect(() => {
    // Re-check on mount in case consent was granted after SSR
    if ((window as any)[flag]) {
      setAllowed(true);
    }
  }, [flag]);

  return allowed;
}
