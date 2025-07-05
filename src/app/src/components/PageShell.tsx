import React, { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from '@app/components/Navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

const createAppTheme = (darkMode: boolean) =>
  createTheme({
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      /*
      // TODO(ian): Uncomment once we've standardized on Typography
      h1: {
        fontWeight: 700,
        fontSize: '2.5rem',
      },
      h2: {
        fontWeight: 600,
        fontSize: '2rem',
      },
      h3: {
        fontWeight: 600,
        fontSize: '1.5rem',
      },
      h4: {
        fontWeight: 600,
        fontSize: '1.25rem',
      },
      */
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
    },
    shape: {
      borderRadius: 12,
    },
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: darkMode ? '#3b82f6' : '#2563eb', // Lighter blue for dark mode
        light: darkMode ? '#60a5fa' : '#3b82f6',
        dark: darkMode ? '#2563eb' : '#1d4ed8',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#8b5cf6', // Modern purple
        light: '#a78bfa',
        dark: '#7c3aed',
        contrastText: '#ffffff',
      },
      background: {
        default: darkMode ? '#121212' : '#f8fafc',
        paper: darkMode ? '#1e1e1e' : '#ffffff',
      },
      text: {
        primary: darkMode ? '#ffffff' : '#0f172a',
        secondary: darkMode ? '#a0a0a0' : '#475569',
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 500,
            padding: '8px 16px',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-1px)',
            },
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 4px 8px -2px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            borderRadius: '16px',
            border: `1px solid ${darkMode ? '#2c2c2c' : '#e2e8f0'}`,
            transition: 'all 0.2s ease-in-out',
            boxShadow: darkMode
              ? 'none'
              : '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
            '&:hover': {
              boxShadow: darkMode
                ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                : '0 4px 12px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.05)',
            },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            boxShadow: darkMode
              ? 'none'
              : '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
            border: `1px solid ${darkMode ? '#2c2c2c' : '#e2e8f0'}`,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#f8fafc',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: 'inherit',
            color: darkMode ? '#ffffff' : '#0f172a',
            fontWeight: 600,
            fontSize: '0.875rem',
          },
          stickyHeader: {
            backgroundColor: darkMode ? '#1e1e1e' : '#f8fafc',
          },
          root: {
            borderBottom: `1px solid ${darkMode ? '#2c2c2c' : '#e2e8f0'}`,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            borderRadius: '8px',
            transition: 'all 0.2s ease-in-out',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              transition: 'all 0.2s ease-in-out',
            },
          },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: {
            transition: 'color 0.2s ease-in-out',
            '&.Mui-focused': {
              color: darkMode ? '#3b82f6' : '#2563eb',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            boxShadow: 'none',
            borderBottom: `1px solid ${darkMode ? '#2c2c2c' : '#e2e8f0'}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            boxShadow: darkMode ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
            border: `1px solid ${darkMode ? '#2c2c2c' : '#e2e8f0'}`,
            '&[class*="elevation"]': {
              boxShadow: darkMode ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
            },
          },
          elevation1: {
            boxShadow: darkMode ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
          },
          elevation2: {
            boxShadow: darkMode
              ? 'none'
              : '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
          },
          elevation3: {
            boxShadow: darkMode
              ? '0 4px 12px rgba(0, 0, 0, 0.3)'
              : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.05)',
          },
          elevation4: {
            boxShadow: darkMode
              ? '0 8px 16px rgba(0, 0, 0, 0.4)'
              : '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: '16px',
            boxShadow: darkMode
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            padding: 8,
          },
          track: {
            borderRadius: 22 / 2,
            backgroundColor: darkMode ? '#404040' : '#cbd5e1',
          },
          thumb: {
            backgroundColor: darkMode ? '#ffffff' : '#ffffff',
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
