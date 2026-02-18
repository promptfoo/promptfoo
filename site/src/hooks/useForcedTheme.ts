import { useEffect } from 'react';

type ThemeMode = 'light' | 'dark';

export function useForcedTheme(theme: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');

    root.setAttribute('data-theme', theme);

    return () => {
      if (previousTheme === null) {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', previousTheme);
      }
    };
  }, [theme]);
}
