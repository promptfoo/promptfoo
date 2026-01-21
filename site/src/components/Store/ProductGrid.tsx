import React from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useCartContext } from './CartProvider';
import { ProductCard } from './ProductCard';
import { PromoCard } from './PromoCard';

import type { FourthwallProduct } from './types';

interface ProductGridProps {
  products: FourthwallProduct[];
  isLoading: boolean;
  error: string | null;
}

export function ProductGrid({ products, isLoading, error }: ProductGridProps) {
  const { openProductModal } = useCartContext();

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <CircularProgress sx={{ color: '#000' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
          px: 3,
        }}
      >
        <Typography color="error" align="center">
          Failed to load products. Please try again later.
        </Typography>
      </Box>
    );
  }

  if (products.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
          px: 3,
        }}
      >
        <Typography color="text.secondary" align="center">
          No products available.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
          md: 'repeat(4, 1fr)',
          lg: 'repeat(5, 1fr)',
        },
        gap: { xs: 1, sm: 2 },
        px: { xs: 1, sm: 2, md: 4 },
        py: { xs: 2, sm: 3 },
      }}
    >
      {products.map((product, index) => (
        <React.Fragment key={product.id}>
          <ProductCard product={product} onClick={openProductModal} />
          {/* Insert promo card after 3rd product */}
          {index === 2 && <PromoCard />}
        </React.Fragment>
      ))}
      {/* If less than 3 products, still show promo card at end */}
      {products.length > 0 && products.length <= 2 && <PromoCard />}
    </Box>
  );
}
