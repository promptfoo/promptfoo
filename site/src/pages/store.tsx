import React from 'react';

import Head from '@docusaurus/Head';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import {
  ProductGrid,
  ProductModal,
  StoreErrorBoundary,
  useCartContext,
  useProducts,
} from '@site/src/components/Store';
import { useCopyToClipboard } from '@site/src/components/Store/useCopyToClipboard';
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

function PromoBanner() {
  const { couponCode, clearCoupon } = useCartContext();
  const { copied, handleCopy } = useCopyToClipboard(couponCode);

  if (!couponCode) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        py: 1,
        px: 2,
        backgroundColor: 'var(--ifm-color-success-contrast-background)',
        borderBottom: '1px solid var(--ifm-color-success-dark)',
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          color: 'var(--ifm-color-success-darkest)',
        }}
      >
        Promo code{' '}
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontFamily: 'monospace',
            backgroundColor: 'var(--ifm-color-success-dark)',
            color: '#fff',
            px: 0.75,
            py: 0.25,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          {couponCode}
        </Box>{' '}
        ready — enter it at checkout
      </Typography>
      <IconButton
        size="small"
        onClick={handleCopy}
        aria-label="Copy promo code"
        title={copied ? 'Copied!' : 'Copy code'}
        sx={{
          color: 'var(--ifm-color-success-darkest)',
          p: 0.5,
        }}
      >
        <ContentCopyIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
      {copied && (
        <Typography
          variant="caption"
          sx={{ color: 'var(--ifm-color-success-darkest)', fontWeight: 500 }}
        >
          Copied!
        </Typography>
      )}
      <IconButton
        size="small"
        onClick={clearCoupon}
        aria-label="Dismiss promo code"
        sx={{
          color: 'var(--ifm-color-success-darkest)',
          p: 0.5,
          ml: 'auto',
        }}
      >
        <CloseIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
    </Box>
  );
}

function StoreContent() {
  const { products, isLoading, error } = useProducts('all');

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 60px)',
        backgroundColor: 'var(--ifm-background-color)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PromoBanner />
      <Box component="main" sx={{ flex: 1 }}>
        {/* Store header */}
        <Box
          sx={{
            textAlign: 'center',
            pt: { xs: 3, sm: 4 },
            pb: { xs: 1, sm: 2 },
            px: 2,
          }}
        >
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 900,
              letterSpacing: '-0.03em',
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
              color: 'var(--ifm-heading-color)',
            }}
          >
            The Prompt Shop
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'var(--ifm-color-emphasis-700)',
              mt: 0.5,
              fontSize: { xs: '0.95rem', sm: '1.1rem' },
            }}
          >
            Official Promptfoo merch for the AI testing community
          </Typography>
        </Box>

        <ProductGrid products={products} isLoading={isLoading} error={error} />
      </Box>

      <FloatingCartButton />
      <ProductModal />
    </Box>
  );
}

export default function StorePage() {
  return (
    <Layout
      title="The Prompt Shop | Promptfoo Merch"
      description="Official Promptfoo merchandise and swag"
      noFooter
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
