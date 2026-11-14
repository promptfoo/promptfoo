import { useEffect } from 'react';

type ThemeMode = 'light' | 'dark';

export function useForcedTheme(theme: ThemeMode) {
  useEffect(() => {
    const previousTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);

    // Re-enforce if something (e.g. system preference change) overrides the theme
    const observer = new MutationObserver(() => {
      if (document.documentElement.getAttribute('data-theme') !== theme) {
        document.documentElement.setAttribute('data-theme', theme);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
      if (previousTheme) {
        document.documentElement.setAttribute('data-theme', previousTheme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };
  }, [theme]);
}
