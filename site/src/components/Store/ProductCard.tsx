import React, { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';

import type { FourthwallProduct } from './types';

interface ProductCardProps {
  product: FourthwallProduct;
  onClick: (product: FourthwallProduct) => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const primaryImage = product.images[0];
  const hoverImage = product.images[1] || primaryImage;

  const displayImage = isHovered && product.images.length > 1 ? hoverImage : primaryImage;

  return (
    <ButtonBase
      onClick={() => onClick(product)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: 'block',
        width: '100%',
        aspectRatio: '1',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#f5f5f5',
        borderRadius: 0,
        transition: 'transform 0.2s ease-out, opacity 0.15s ease-out',
        // Touch-friendly: prevent zoom and improve tap response
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        // Only apply hover effect on devices that support hover
        '@media (hover: hover)': {
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        // Active state for touch feedback
        '&:active': {
          opacity: 0.8,
          transform: 'scale(0.98)',
        },
        '&:focus-visible': {
          outline: '2px solid #000',
          outlineOffset: '2px',
        },
      }}
      aria-label={`View ${product.name}`}
    >
      {!imageLoaded && (
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
      <Box
        component="img"
        src={displayImage?.url}
        alt={product.name}
        onLoad={() => setImageLoaded(true)}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: imageLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
        }}
      />
    </ButtonBase>
  );
}
