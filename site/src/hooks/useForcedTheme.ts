import { useEffect } from 'react';

type ThemeMode = 'light' | 'dark';

export function useForcedTheme(theme: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    const previousChoice = root.getAttribute('data-theme-choice');

    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-choice', theme);

    return () => {
      if (previousTheme === null) {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', previousTheme);
      }

      if (previousChoice === null) {
        root.removeAttribute('data-theme-choice');
      } else {
        root.setAttribute('data-theme-choice', previousChoice);
      }
    };
  }, [theme]);
}
