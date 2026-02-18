import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import { useColorMode } from '@docusaurus/theme-common';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  ProductGrid,
  ProductModal,
  StoreErrorBoundary,
  useCartContext,
  useProducts,
} from '@site/src/components/Store';
// CSS module for store-specific styles
import styles from '@site/src/components/Store/store.module.css';
import Layout from '@theme/Layout';

function FloatingCartButton() {
  const { itemCount, openCart } = useCartContext();

  return (
    <Fab
      onClick={openCart}
      aria-label={`Shopping cart with ${itemCount} items`}
      sx={{
        position: 'fixed',
        bottom: { xs: 16, sm: 24 },
        right: { xs: 16, sm: 24 },
        backgroundColor: 'var(--ifm-color-primary-darker)',
        color: 'var(--ifm-button-color, #fff)',
        '&:hover': {
          backgroundColor: 'var(--ifm-color-primary-darkest)',
        },
        zIndex: 1000,
      }}
    >
      <Badge
        badgeContent={itemCount}
        sx={{
          '& .MuiBadge-badge': {
            backgroundColor: 'var(--ifm-background-surface-color)',
            color: 'var(--ifm-color-primary-darker)',
            border: '1px solid var(--ifm-color-emphasis-300)',
            fontSize: '0.7rem',
            fontWeight: 600,
            top: -4,
            right: -4,
          },
        }}
      >
        <ShoppingBagOutlinedIcon />
      </Badge>
    </Fab>
  );
}

function StoreContent() {
  const { products, isLoading, error } = useProducts('all');
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
        },
      }),
    [colorMode],
  );

  // Hide footer only on this page by adding a body class
  useEffect(() => {
    document.body.classList.add(styles.storePageBody);
    return () => {
      document.body.classList.remove(styles.storePageBody);
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          minHeight: 'calc(100vh - 60px)', // Account for navbar
          backgroundColor: 'var(--ifm-background-color)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box component="main" sx={{ flex: 1 }}>
          <ProductGrid products={products} isLoading={isLoading} error={error} />
        </Box>

        {/* Floating cart button for easier access while shopping */}
        <FloatingCartButton />

        {/* Product detail modal */}
        <ProductModal />
      </Box>
    </ThemeProvider>
  );
}

export default function StorePage() {
  return (
    <Layout
      title="The Prompt Shop | Promptfoo Merch"
      description="Official Promptfoo merchandise and swag"
    >
      <Head>
        <meta property="og:title" content="The Prompt Shop" />
        <meta property="og:description" content="Official Promptfoo merchandise and swag" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/og/store-og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/og/store-og.png" />
        <link rel="preconnect" href="https://storefront-api.fourthwall.com" />
      </Head>
      <StoreErrorBoundary>
        <StoreContent />
      </StoreErrorBoundary>
    </Layout>
  );
}
