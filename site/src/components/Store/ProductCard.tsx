import React, { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { formatPrice } from './useFourthwall';

import type { FourthwallProduct } from './types';

interface ProductCardProps {
  product: FourthwallProduct;
  onClick: (product: FourthwallProduct) => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const [primaryLoaded, setPrimaryLoaded] = useState(false);
  const [hoverLoaded, setHoverLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const primaryImage = product.images[0];
  const hoverImage = product.images[1];
  const hasHoverImage = Boolean(hoverImage);

  const lowestPrice = useMemo(
    () =>
      product.variants.reduce(
        (min, v) => (v.unitPrice.value < min.value ? v.unitPrice : min),
        product.variants[0]?.unitPrice ?? { value: 0, currency: 'USD' },
      ),
    [product.variants],
  );

  return (
    <ButtonBase
      onClick={() => onClick(product)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: 'block',
        width: '100%',
        position: 'relative',
        backgroundColor: 'var(--ifm-background-surface-color)',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out, opacity 0.15s ease-out',
        // Touch-friendly: prevent zoom and improve tap response
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        // Only apply hover effect on devices that support hover
        '@media (hover: hover)': {
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 'var(--store-card-shadow-hover)',
          },
        },
        // Active state for touch feedback
        '&:active': {
          opacity: 0.8,
          transform: 'scale(0.98)',
        },
        '&:focus-visible': {
          outline: '2px solid var(--ifm-color-primary)',
          outlineOffset: '2px',
        },
      }}
      aria-label={`View ${product.name}`}
    >
      <Box
        sx={{
          width: '100%',
          aspectRatio: '1',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {!primaryLoaded && (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }}
          />
        )}
        {/* Primary image — always rendered */}
        <Box
          component="img"
          src={primaryImage?.url}
          alt={product.name}
          onLoad={() => setPrimaryLoaded(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: primaryLoaded && !(isHovered && hasHoverImage && hoverLoaded) ? 1 : 0,
            transition: 'opacity 0.3s ease-out',
          }}
        />
        {/* Hover image — rendered once to preload, shown on hover */}
        {hasHoverImage && (
          <Box
            component="img"
            src={hoverImage.url}
            alt={`${product.name} alternate view`}
            onLoad={() => setHoverLoaded(true)}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: isHovered && hoverLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-out',
            }}
          />
        )}
      </Box>
      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          textAlign: 'left',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            lineHeight: 1.3,
            color: 'var(--ifm-font-color-base)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {product.name}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            mt: 0.25,
            color: 'var(--ifm-color-emphasis-700)',
            fontSize: '0.8rem',
          }}
        >
          {formatPrice(lowestPrice)}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
