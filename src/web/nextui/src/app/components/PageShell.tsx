'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Navigation from '@/app/components/Navigation';
import { AuthProvider } from '@/supabase-client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import './PageShell.css';

const createAppTheme = (darkMode: boolean) =>
  createTheme({
    typography: {
      fontFamily: 'inherit',
    },
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

const lightTheme = createAppTheme(false);
const darkTheme = createAppTheme(true);

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState<boolean | null>(null);

  useEffect(() => {
    // Initialize from localStorage, fallback to system preference
    const savedMode = localStorage.getItem('darkMode');
    setDarkMode(savedMode !== null ? savedMode === 'true' : prefersDarkMode);
  }, [prefersDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prevMode) => {
      const newMode = !prevMode;
      localStorage.setItem('darkMode', String(newMode));
      return newMode;
    });
  }, []);

  useEffect(() => {
    if (darkMode === null) return;

    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  // Render null until darkMode is determined
  if (darkMode === null) return null;

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <AuthProvider>
        <Layout>
          <Navigation darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
          <div>{children}</div>
        </Layout>
      </AuthProvider>
    </ThemeProvider>
  );
}
