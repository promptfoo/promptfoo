import React, { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { PromoModal } from './PromoModal';

export function PromoCard() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <ButtonBase
        onClick={() => setIsModalOpen(true)}
        sx={{
          display: 'block',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--ifm-background-surface-color)',
          borderRadius: '8px',
          transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          '@media (hover: hover)': {
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: 'var(--store-card-shadow-hover)',
            },
          },
          '&:active': {
            opacity: 0.9,
            transform: 'scale(0.98)',
          },
          '&:focus-visible': {
            outline: '2px solid var(--ifm-color-primary)',
            outlineOffset: '2px',
          },
        }}
        aria-label="Open source contributor perks - merge a PR to get a discount code"
      >
        {/* Gradient area — matches the product card image slot */}
        <Box
          sx={{
            width: '100%',
            aspectRatio: '1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'linear-gradient(135deg, var(--ifm-color-primary-darkest) 0%, var(--ifm-color-primary-darker) 50%, var(--ifm-color-primary-dark) 100%)',
            px: 2,
            gap: 1,
          }}
        >
          <Typography
            sx={{
              color: '#fff',
              fontWeight: 800,
              fontSize: { xs: '1.1rem', sm: '1.4rem' },
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            PRs → Perks
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: { xs: '0.7rem', sm: '0.8rem' },
              textAlign: 'center',
            }}
          >
            Ship code, get merch
          </Typography>
        </Box>

        {/* Text area — matches the product card name/price slot */}
        <Box sx={{ px: 1.5, py: 1.25, textAlign: 'left' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              lineHeight: 1.3,
              color: 'var(--ifm-font-color-base)',
            }}
          >
            Contributor Discount
          </Typography>
          <Typography
            variant="body2"
            sx={{
              mt: 0.25,
              color: 'var(--ifm-color-emphasis-700)',
              fontSize: '0.8rem',
            }}
          >
            Learn more
          </Typography>
        </Box>
      </ButtonBase>

      <PromoModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
