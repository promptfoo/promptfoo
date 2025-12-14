import React, { useCallback, useEffect, useState } from 'react';

import Navigation from '@app/components/Navigation';
import { PostHogProvider } from '@app/components/PostHogProvider';
import UpdateBanner from '@app/components/UpdateBanner';
import { red } from '@mui/material/colors';
import { alpha, createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Severity } from '@promptfoo/redteam/constants';
import { Outlet } from 'react-router-dom';
import { PostHogPageViewTracker } from './PostHogPageViewTracker';

declare module '@mui/material/styles' {
  interface Palette {
    custom: {
      darkOverlay: string;
      lightOverlay: string;
      severity: Record<
        Severity,
        {
          light: string;
          main: string;
          dark: string;
          contrastText: string;
        }
      >;
    };
  }
  interface PaletteOptions {
    custom?: {
      darkOverlay: string;
      lightOverlay: string;
      severity: Record<
        Severity,
        {
          light: string;
          main: string;
          dark: string;
          contrastText: string;
        }
      >;
    };
  }
}

// Grey scale for consistent theming
const greys = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
};

// Tailwind-inspired shadow system for subtle, natural depth
const createShadows = (
  isDark: boolean,
): [
  'none',
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] => {
  const shadowColor = isDark ? '0 0 0' : '0 0 0';
  const shadowOpacity = isDark ? 0.3 : 0.1;
  const elevatedShadow = isDark
    ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
    : '0 25px 50px -12px rgba(0, 0, 0, 0.25)';

  return [
    'none',
    `0 1px 2px 0 rgba(${shadowColor} / ${shadowOpacity * 0.5})`,
    `0 1px 3px 0 rgba(${shadowColor} / ${shadowOpacity}), 0 1px 2px -1px rgba(${shadowColor} / ${shadowOpacity})`,
    `0 4px 6px -1px rgba(${shadowColor} / ${shadowOpacity}), 0 2px 4px -2px rgba(${shadowColor} / ${shadowOpacity})`,
    `0 10px 15px -3px rgba(${shadowColor} / ${shadowOpacity}), 0 4px 6px -4px rgba(${shadowColor} / ${shadowOpacity})`,
    `0 20px 25px -5px rgba(${shadowColor} / ${shadowOpacity}), 0 8px 10px -6px rgba(${shadowColor} / ${shadowOpacity})`,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
    elevatedShadow,
  ];
};

export const createAppTheme = (darkMode: boolean) => {
  const primaryColor = darkMode ? '#3b82f6' : '#2563eb';
  const borderColor = darkMode ? '#2c2c2c' : greys[200];

  // We need to instantiate the theme so that contrast settings can be applied in the actual theme below;
  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      // Custom colors for specific use cases
      custom: {
        darkOverlay: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
        lightOverlay: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        severity: {
          // @ts-expect-error - full colors will be added in the actual theme below
          critical: {
            main: red[900],
          },
          // @ts-expect-error - full colors will be added in the actual theme below
          high: {
            main: red[500],
          },
        },
      },
    },
  });

  return createTheme({
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: {
        fontSize: '2rem',
        fontWeight: 700,
        letterSpacing: '-0.025em',
        lineHeight: 1.2,
      },
      h2: {
        fontSize: '1.5rem',
        fontWeight: 700,
        letterSpacing: '-0.025em',
        lineHeight: 1.3,
      },
      h3: {
        fontSize: '1.25rem',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.4,
      },
      h4: {
        fontSize: '1.125rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.4,
      },
      h5: {
        fontSize: '1rem',
        fontWeight: 600,
        lineHeight: 1.5,
      },
      h6: {
        fontSize: '0.875rem',
        fontWeight: 600,
        lineHeight: 1.5,
      },
      subtitle1: {
        fontSize: '1rem',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      subtitle2: {
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      body1: {
        fontSize: '0.9375rem',
        lineHeight: 1.6,
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.6,
      },
      caption: {
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: greys[500],
      },
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
    },
    shape: {
      borderRadius: 10,
    },
    shadows: createShadows(darkMode),
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: primaryColor,
        light: darkMode ? '#60a5fa' : '#3b82f6',
        dark: darkMode ? '#2563eb' : '#1d4ed8',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#8b5cf6',
        light: '#a78bfa',
        dark: '#7c3aed',
        contrastText: '#ffffff',
      },
      success: {
        main: '#059669',
        light: '#34D399',
        dark: '#047857',
        contrastText: '#ffffff',
      },
      warning: {
        main: '#D97706',
        light: '#FBBF24',
        dark: '#B45309',
        contrastText: '#ffffff',
      },
      error: {
        main: '#DC2626',
        light: '#F87171',
        dark: '#B91C1C',
        contrastText: '#ffffff',
      },
      info: {
        main: '#0891B2',
        light: '#22D3EE',
        dark: '#0E7490',
        contrastText: '#ffffff',
      },
      grey: greys,
      background: {
        default: darkMode ? '#121212' : greys[50],
        paper: darkMode ? '#1e1e1e' : '#ffffff',
      },
      text: {
        primary: darkMode ? '#ffffff' : greys[900],
        secondary: darkMode ? '#a0a0a0' : greys[600],
      },
      divider: borderColor,
      action: {
        hover: alpha(primaryColor, 0.04),
        selected: alpha(primaryColor, 0.08),
        focus: alpha(primaryColor, 0.12),
      },
      custom: {
        darkOverlay: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
        lightOverlay: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        severity: {
          critical: theme.palette.augmentColor({
            color: {
              main: theme.palette.custom.severity.critical.main,
            },
            name: 'custom.severity.critical',
          }),
          high: theme.palette.augmentColor({
            color: {
              main: theme.palette.custom.severity.high.main,
            },
            name: 'custom.severity.high',
          }),
          medium: theme.palette.augmentColor({
            color: {
              main: theme.palette.warning.main,
            },
            name: 'custom.severity.medium',
          }),
          low: theme.palette.augmentColor({
            color: {
              main: theme.palette.success.main,
            },
            name: 'custom.severity.low',
          }),
        },
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: darkMode ? greys[800] : greys[100],
            },
            '&::-webkit-scrollbar-thumb': {
              background: darkMode ? greys[600] : greys[300],
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: darkMode ? greys[500] : greys[400],
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 500,
            padding: '8px 16px',
            transition: 'all 0.15s ease-in-out',
          },
          contained: {
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            '&:hover': {
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
            },
          },
          outlined: {
            borderColor: darkMode ? greys[600] : greys[300],
            '&:hover': {
              borderColor: darkMode ? greys[500] : greys[400],
              backgroundColor: darkMode ? alpha('#ffffff', 0.05) : greys[50],
            },
          },
          sizeSmall: {
            padding: '6px 12px',
            fontSize: '0.8125rem',
          },
          sizeLarge: {
            padding: '12px 24px',
            fontSize: '0.9375rem',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 0.15s ease-in-out',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            transition: 'all 0.15s ease-in-out',
            boxShadow: darkMode
              ? 'none'
              : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: 20,
            '&:last-child': {
              paddingBottom: 20,
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
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : greys[50],
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: 'inherit',
            color: darkMode ? '#ffffff' : greys[900],
            fontWeight: 600,
            fontSize: '0.8125rem',
          },
          stickyHeader: {
            backgroundColor: darkMode ? '#1e1e1e' : greys[50],
          },
          root: {
            borderBottom: `1px solid ${borderColor}`,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            borderRadius: 8,
            transition: 'all 0.15s ease-in-out',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: darkMode ? greys[600] : greys[300],
              transition: 'all 0.15s ease-in-out',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: darkMode ? greys[500] : greys[400],
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: primaryColor,
              borderWidth: 2,
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: {
            transition: 'color 0.15s ease-in-out',
            '&.Mui-focused': {
              color: primaryColor,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            boxShadow: 'none',
            borderBottom: `1px solid ${borderColor}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            border: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
          },
          rounded: {
            borderRadius: 12,
          },
          outlined: {
            border: `1px solid ${borderColor}`,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: darkMode
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '1.125rem',
            fontWeight: 600,
            padding: '20px 24px 12px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '12px 24px 20px',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '12px 24px 20px',
            gap: 8,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 8px',
            padding: '10px 12px',
            transition: 'all 0.15s ease-in-out',
            '&.Mui-selected': {
              backgroundColor: alpha(primaryColor, 0.1),
              '&:hover': {
                backgroundColor: alpha(primaryColor, 0.15),
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            borderRadius: 6,
          },
          sizeSmall: {
            height: 24,
            fontSize: '0.75rem',
          },
          colorSuccess: {
            backgroundColor: alpha('#059669', 0.1),
            color: '#047857',
          },
          colorError: {
            backgroundColor: alpha('#DC2626', 0.1),
            color: '#B91C1C',
          },
          colorWarning: {
            backgroundColor: alpha('#D97706', 0.1),
            color: '#B45309',
          },
          colorInfo: {
            backgroundColor: alpha('#0891B2', 0.1),
            color: '#0E7490',
          },
          colorPrimary: {
            backgroundColor: alpha(primaryColor, 0.1),
            color: darkMode ? '#60a5fa' : '#1d4ed8',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
          standardSuccess: {
            backgroundColor: alpha('#059669', 0.1),
            color: '#047857',
          },
          standardError: {
            backgroundColor: alpha('#DC2626', 0.1),
            color: '#B91C1C',
          },
          standardWarning: {
            backgroundColor: alpha('#D97706', 0.1),
            color: '#B45309',
          },
          standardInfo: {
            backgroundColor: alpha('#0891B2', 0.1),
            color: '#0E7490',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 44,
          },
          indicator: {
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
            minHeight: 44,
            padding: '12px 16px',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: greys[800],
            fontSize: '0.75rem',
            padding: '6px 12px',
            borderRadius: 6,
          },
          arrow: {
            color: greys[800],
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            padding: 8,
            '& .MuiSwitch-switchBase': {
              padding: 10,
            },
          },
          switchBase: {
            '&.Mui-checked': {
              color: '#fff',
              '& + .MuiSwitch-track': {
                backgroundColor: primaryColor,
                opacity: 1,
              },
            },
          },
          thumb: {
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.2), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
          },
          track: {
            borderRadius: 10,
            backgroundColor: darkMode ? greys[600] : greys[300],
            opacity: 1,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: borderColor,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            borderRadius: 8,
            padding: '8px 16px',
            borderColor: darkMode ? greys[600] : greys[300],
            '&.Mui-selected': {
              backgroundColor: alpha(primaryColor, 0.1),
              borderColor: primaryColor,
              color: primaryColor,
              '&:hover': {
                backgroundColor: alpha(primaryColor, 0.15),
              },
            },
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? greys[800] : greys[100],
            padding: 4,
            borderRadius: 10,
            gap: 4,
          },
          grouped: {
            border: 'none',
            borderRadius: '6px !important',
            '&:not(:first-of-type)': {
              marginLeft: 0,
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            boxShadow: darkMode
              ? '0 4px 20px rgba(0, 0, 0, 0.5)'
              : '0 4px 20px rgba(0, 0, 0, 0.15)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            margin: '2px 4px',
            transition: 'background-color 0.15s ease-in-out',
          },
        },
      },
    },
  });
};

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
      <PostHogProvider>
        <Layout>
          <Navigation onToggleDarkMode={toggleDarkMode} />
          <UpdateBanner />
          <Outlet />
          <PostHogPageViewTracker />
        </Layout>
      </PostHogProvider>
    </ThemeProvider>
  );
}
