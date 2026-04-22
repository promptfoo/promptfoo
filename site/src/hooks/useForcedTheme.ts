import { useEffect, useRef } from 'react';

type ThemeMode = 'light' | 'dark';

export function useForcedTheme(theme: ThemeMode) {
  const previousThemeRef = useRef<string | null>(null);

  useEffect(() => {
    previousThemeRef.current = document.documentElement.getAttribute('data-theme');
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
      if (previousThemeRef.current) {
        document.documentElement.setAttribute('data-theme', previousThemeRef.current);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };
  }, [theme]);
}
