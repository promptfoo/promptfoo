import React from 'react';
import Link from '@docusaurus/Link';
import { Box, Stack, Typography } from '@mui/material';
import styles from '../pages/index.module.css';

interface FeaturedCardProps {
  href: string;
  logo: {
    src: string;
    alt: string;
    maxWidth?: number;
  };
  title: string;
  quote: string;
  ctaText: string;
  ariaLabel: string;
}

export default function FeaturedCard({
  href,
  logo,
  title,
  quote,
  ctaText,
  ariaLabel,
}: FeaturedCardProps) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.asSeenOnCard}
      aria-label={ariaLabel}
    >
      <Box className={styles.asSeenOnContent}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          component="h3"
          sx={{
            fontSize: '1.25rem',
            mb: 1,
            justifyContent: 'center',
          }}
        >
          <Box
            component="img"
            src={logo.src}
            alt={logo.alt}
            className={styles.asSeenOnLogoInline}
            sx={logo.maxWidth ? { maxWidth: logo.maxWidth } : undefined}
          />
          {title}
        </Stack>
        <Typography
          sx={{
            fontSize: '1rem',
            mb: 2,
            color: (theme) =>
              theme.palette.mode === 'dark'
                ? 'var(--ifm-color-gray-200)'
                : 'var(--ifm-color-emphasis-700)',
          }}
        >
          {quote}
        </Typography>
        <Typography
          className={styles.watchNow}
          sx={{
            display: 'inline-block',
            color: 'primary.main',
            fontWeight: 500,
            transition: (theme) => theme.custom.transitions.fast,
          }}
        >
          {ctaText}
        </Typography>
      </Box>
    </Link>
  );
}
