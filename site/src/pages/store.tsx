import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
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
        backgroundColor: '#1a1a2e',
        color: '#fff',
        '&:hover': {
          backgroundColor: '#2a2a4e',
        },
        zIndex: 1000,
      }}
    >
      <Badge
        badgeContent={itemCount}
        sx={{
          '& .MuiBadge-badge': {
            backgroundColor: '#fff',
            color: '#1a1a2e',
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

  // Hide footer only on this page by adding a body class
  useEffect(() => {
    document.body.classList.add(styles.storePageBody);
    return () => {
      document.body.classList.remove(styles.storePageBody);
    };
  }, []);

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 60px)', // Account for navbar
        backgroundColor: '#fafafa',
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
        <meta name="theme-color" content="#fafafa" />
        <link rel="preconnect" href="https://storefront-api.fourthwall.com" />
      </Head>
      <StoreErrorBoundary>
        <StoreContent />
      </StoreErrorBoundary>
    </Layout>
  );
}
