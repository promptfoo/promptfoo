import React from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import EventsBanner from '@site/src/components/EventsBanner';
import ForceLightTheme from '@site/src/components/ForceLightTheme';
import { CartDrawer, CartProvider } from '@site/src/components/Store';
import { useIsDocsPage, useIsEventDetailPage, useIsStorePage } from '@site/src/hooks/useIsDocsPage';
import OriginalLayout from '@theme-original/Layout';
import type { Props } from '@theme/Layout';

function StoreThemeProvider({
  children,
  forceLight,
}: {
  children: React.ReactNode;
  forceLight: boolean;
}) {
  const { colorMode } = useColorMode();
  // When ForceLightTheme is active the DOM is forced to light, but useColorMode
  // still returns the user's preference. Derive the effective mode so portaled
  // MUI components (CartDrawer, Dialogs) match the visible page theme.
  const effectiveMode = forceLight ? 'light' : colorMode === 'dark' ? 'dark' : 'light';

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: effectiveMode,
          primary: {
            main: effectiveMode === 'dark' ? '#ff7a7a' : '#e53a3a',
            dark: effectiveMode === 'dark' ? '#e53a3a' : '#b32e2e',
            light: effectiveMode === 'dark' ? '#ffa0a0' : '#ff7a7a',
          },
          background: {
            default: effectiveMode === 'dark' ? '#10191c' : '#ffffff',
            paper: effectiveMode === 'dark' ? '#17252b' : '#ffffff',
          },
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: 'var(--ifm-font-family-base)' },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 8,
                textTransform: 'none' as const,
                fontWeight: 600,
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                backgroundColor: `${effectiveMode === 'dark' ? '#17252b' : '#ffffff'} !important`,
              },
            },
          },
        },
      }),
    [effectiveMode],
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/**
 * Inner component that renders inside OriginalLayout (and thus inside
 * Docusaurus's ColorModeProvider), so useColorMode is available.
 */
function LayoutInner({
  children,
  shouldForceLight,
}: {
  children: React.ReactNode;
  shouldForceLight: boolean;
}) {
  return (
    <StoreThemeProvider forceLight={shouldForceLight}>
      {shouldForceLight && <ForceLightTheme />}
      {children}
      <CartDrawer />
    </StoreThemeProvider>
  );
}

export default function Layout(props: Props): React.ReactElement {
  const isDocsPage = useIsDocsPage();
  const isEventDetailPage = useIsEventDetailPage();
  const isStorePage = useIsStorePage();
  const shouldForceLight = !isDocsPage && !isEventDetailPage && !isStorePage;

  return (
    <CartProvider>
      <EventsBanner />
      <OriginalLayout {...props}>
        <LayoutInner shouldForceLight={shouldForceLight}>{props.children}</LayoutInner>
      </OriginalLayout>
    </CartProvider>
  );
}
