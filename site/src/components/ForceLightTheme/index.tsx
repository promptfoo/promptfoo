import { useEffect } from 'react';

/**
 * Forces light theme via DOM attribute without touching Docusaurus state or
 * localStorage, so the user's stored preference (dark/system) survives
 * navigation through non-docs pages.
 */
export default function ForceLightTheme(): null {
  useEffect(() => {
    const root = document.documentElement;

    const forceLight = () => {
      if (root.getAttribute('data-theme') !== 'light') {
        root.setAttribute('data-theme', 'light');
      }
    };

    forceLight();

    // Re-enforce if Docusaurus reacts to system preference or stored value
    const observer = new MutationObserver(forceLight);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, []);

  return null;
}
