'use client';

import React from 'react';
import Link from 'next/link';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Stack } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import Logo from './Logo';
import LoggedInAs from './LoggedInAs';
import DarkMode from './DarkMode';
import { AuthProvider } from '@/supabase-client';

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

function Navigation({
  darkMode,
  onToggleDarkMode,
}: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  if (process.env.NEXT_PUBLIC_NO_BROWSING) {
    return (
      <Stack direction="row" spacing={2} className="nav">
        <Logo />
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={2} className="nav">
      <Logo />
      <Link href="/setup">New Eval</Link>
      <Link href="/eval">View Evals</Link>
      <div className="right-aligned">
        <LoggedInAs />
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </div>
    </Stack>
  );
}
