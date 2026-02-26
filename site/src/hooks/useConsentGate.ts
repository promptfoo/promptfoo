import { useEffect, useState } from 'react';

type ConsentCategory = 'analytics' | 'marketing';

function getFlag(category: ConsentCategory): string {
  return category === 'analytics' ? '__pf_analytics_loaded' : '__pf_marketing_loaded';
}

function getSnapshot(category: ConsentCategory): boolean {
  return typeof window !== 'undefined' && !!(window as any)[getFlag(category)];
}

/**
 * Returns true when the given consent category has been granted.
 * Components should use this to gate third-party script injection.
 *
 * Reacts to consent changes in real time — when a user clicks "Accept All"
 * on the banner, gated components re-render immediately without navigation.
 *
 * consent.js dispatches 'pf_consent_change' on window when consent is granted.
 */
export function useConsentGate(category: ConsentCategory): boolean {
  const [allowed, setAllowed] = useState(() => getSnapshot(category));

  useEffect(() => {
    // Check on mount (covers SSR → hydration gap)
    if (getSnapshot(category)) {
      setAllowed(true);
      return;
    }

    function onConsentChange() {
      if (getSnapshot(category)) {
        setAllowed(true);
      }
    }

    window.addEventListener('pf_consent_change', onConsentChange);
    return () => window.removeEventListener('pf_consent_change', onConsentChange);
  }, [category]);

  return allowed;
}
