'use client';

import React from 'react';
import Navigation from '@/app/components/Navigation';
import { AuthProvider } from '@/supabase-client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import './PageShell.css';

export { PageShell };

function PageShell({ children }: { children: React.ReactNode }) {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = React.useState(prefersDarkMode);

  const theme = React.useMemo(() => {
    return createTheme({
      typography: {
        fontFamily: 'inherit',
      },
      palette: {
        mode: darkMode || prefersDarkMode ? 'dark' : 'light',
      },
    });
  }, [darkMode, prefersDarkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  React.useEffect(() => {
    if (prefersDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [prefersDarkMode]);

  return (
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <AuthProvider>
          <Layout>
            <Navigation darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
            <div>{children}</div>
          </Layout>
        </AuthProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
