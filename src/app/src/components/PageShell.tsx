import { useCallback, useEffect, useState } from 'react';

import Navigation from '@app/components/Navigation';
import { PostHogProvider } from '@app/components/PostHogProvider';
import { Outlet } from 'react-router-dom';
import { PostHogPageViewTracker } from './PostHogPageViewTracker';

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function PageShell() {
  const [darkMode, setDarkMode] = useState<boolean | null>(null);

  useEffect(() => {
    // Initialize from localStorage, fallback to system preference
    const savedMode = localStorage.getItem('darkMode');
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(savedMode === null ? prefersDarkMode : savedMode === 'true');
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prevMode) => {
      const newMode = !prevMode;
      localStorage.setItem('darkMode', String(newMode));
      return newMode;
    });
  }, []);

  useEffect(() => {
    if (darkMode === null) {
      return;
    }

    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  // Render null until darkMode is determined
  if (darkMode === null) {
    return null;
  }

  return (
    <PostHogProvider>
      <Layout>
        <Navigation onToggleDarkMode={toggleDarkMode} />
        <Outlet />
        <PostHogPageViewTracker />
      </Layout>
    </PostHogProvider>
  );
}
