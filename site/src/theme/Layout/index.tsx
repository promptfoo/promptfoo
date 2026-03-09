import React from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import EventsBanner from '@site/src/components/EventsBanner';
import ForceLightTheme from '@site/src/components/ForceLightTheme';
import { CartDrawer, CartProvider } from '@site/src/components/Store';
import { useIsDocsPage, useIsEventDetailPage, useIsStorePage } from '@site/src/hooks/useIsDocsPage';
import OriginalLayout from '@theme-original/Layout';
import type { Props } from '@theme/Layout';

function StoreThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
          primary: {
            main: colorMode === 'dark' ? '#ff7a7a' : '#e53a3a',
            dark: colorMode === 'dark' ? '#e53a3a' : '#b32e2e',
            light: colorMode === 'dark' ? '#ffa0a0' : '#ff7a7a',
          },
          background: {
            default: colorMode === 'dark' ? '#10191c' : '#ffffff',
            paper: colorMode === 'dark' ? '#17252b' : '#ffffff',
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
                backgroundColor: `${colorMode === 'dark' ? '#17252b' : '#ffffff'} !important`,
              },
            },
          },
        },
      }),
    [colorMode],
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
    <StoreThemeProvider>
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
