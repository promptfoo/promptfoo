import React from 'react';
import type { BoxProps } from '@mui/material';
import { Box } from '@mui/material';

interface ResponsiveImageProps extends Omit<BoxProps, 'component'> {
  src: string;
  src2x?: string;
  srcDark?: string;
  src2xDark?: string;
  alt: string;
  isDarkTheme?: boolean;
}

export default function ResponsiveImage({
  src,
  src2x,
  srcDark,
  src2xDark,
  alt,
  isDarkTheme,
  sx,
  ...props
}: ResponsiveImageProps) {
  const activeSrc = isDarkTheme && srcDark ? srcDark : src;
  const activeSrc2x = isDarkTheme && src2xDark ? src2xDark : src2x;

  return (
    <Box
      component="img"
      src={activeSrc}
      srcSet={activeSrc2x ? `${activeSrc} 1x, ${activeSrc2x} 2x` : undefined}
      alt={alt}
      sx={{
        width: '100%',
        height: 'auto',
        borderRadius: 1,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        transition: 'transform 0.3s ease',
        '&:hover': {
          transform: 'scale(1.02)',
        },
        ...sx,
      }}
      {...props}
    />
  );
}
