import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';
export type ThemePreference = ResolvedTheme | 'system';

const DARK_MODE_STORAGE_KEY = 'darkMode';
const SYSTEM_DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

function getStoredThemePreference(): ThemePreference {
  let savedMode: string | null = null;

  try {
    savedMode = localStorage.getItem(DARK_MODE_STORAGE_KEY);
  } catch {
    return 'system';
  }

  if (savedMode === 'true') {
    return 'dark';
  }

  if (savedMode === 'false') {
    return 'light';
  }

  return 'system';
}

export function useThemePreference() {
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(getStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }

    try {
      return window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (resolvedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    let systemPreference: MediaQueryList;

    try {
      systemPreference = window.matchMedia(SYSTEM_DARK_MODE_QUERY);
    } catch {
      return;
    }

    const handleSystemPreferenceChange = ({ matches }: MediaQueryListEvent) => {
      setSystemTheme(matches ? 'dark' : 'light');
    };

    if (
      typeof systemPreference.addEventListener === 'function' &&
      typeof systemPreference.removeEventListener === 'function'
    ) {
      systemPreference.addEventListener('change', handleSystemPreferenceChange);
      return () => {
        systemPreference.removeEventListener('change', handleSystemPreferenceChange);
      };
    }

    if (
      typeof systemPreference.addListener === 'function' &&
      typeof systemPreference.removeListener === 'function'
    ) {
      systemPreference.addListener(handleSystemPreferenceChange);
      return () => {
        systemPreference.removeListener(handleSystemPreferenceChange);
      };
    }

    return () => {};
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === DARK_MODE_STORAGE_KEY || event.key === null) {
        setThemePreferenceState(getStoredThemePreference());
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    try {
      if (preference === 'system') {
        localStorage.removeItem(DARK_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(DARK_MODE_STORAGE_KEY, String(preference === 'dark'));
      }
    } catch (error) {
      console.debug('[ThemeSelector] Failed to persist theme preference', { error, preference });
    }
    setThemePreferenceState(preference);
  }, []);

  return useMemo(
    () => ({
      setThemePreference,
      systemTheme,
      themePreference,
    }),
    [setThemePreference, systemTheme, themePreference],
  );
}
