import React, { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from '@app/components/Navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

const createAppTheme = (darkMode: boolean) =>
  createTheme({
    typography: {
      fontFamily: 'inherit',
    },
    palette: {
      mode: darkMode ? 'dark' : 'light',
      background: {
        default: '#ffffff', // Set all MUI components to have a white background
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#121212' : '#fff',
            boxShadow: darkMode ? 'none' : '0 2px 3px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#121212' : '#fff',
            boxShadow: darkMode ? 'none' : '0 2px 3px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1E1E1E' : '#F5F5F5',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: 'inherit',
            color: darkMode ? '#FFFFFF' : '#000000',
            fontWeight: 'bold',
          },
          stickyHeader: {
            backgroundColor: darkMode ? '#1E1E1E' : '#F5F5F5',
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#333' : '#fff',
          },
        },
      },
    },
  });

const lightTheme = createAppTheme(false);
const darkTheme = createAppTheme(true);

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function PageShell() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState<boolean | null>(null);

  useEffect(() => {
    // Initialize from localStorage, fallback to system preference
    const savedMode = localStorage.getItem('darkMode');
    setDarkMode(savedMode === null ? prefersDarkMode : savedMode === 'true');
  }, [prefersDarkMode]);

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
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <Layout>
        <Navigation darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
        <Outlet />
      </Layout>
    </ThemeProvider>
  );
}
