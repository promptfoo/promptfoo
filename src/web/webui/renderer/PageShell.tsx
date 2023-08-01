import React from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Stack } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { PageContextProvider } from './usePageContext';
import { Link } from './Link';
import Logo from './Logo';
import DarkMode from './DarkMode';

import type { PageContext } from './types';

import './PageShell.css';

export { PageShell };

function PageShell({
  children,
  pageContext,
}: {
  children: React.ReactNode;
  pageContext: PageContext;
}) {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = React.useState(prefersDarkMode);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
        },
      }),
    [darkMode],
  );

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
        <PageContextProvider pageContext={pageContext}>
          <Layout>
            <Navigation darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
            <div>{children}</div>
          </Layout>
        </PageContextProvider>
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
  return (
    <Stack direction="row" spacing={2} className="nav">
      <Logo />
      <Link href="/">Home</Link>
      <Link href="/setup">Create Eval</Link>
      <Link href="/eval">View Eval</Link>
      <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
    </Stack>
  );
}
