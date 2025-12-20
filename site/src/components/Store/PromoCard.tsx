import React, { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';

const DISCORD_URL = 'https://discord.gg/promptfoo';

export function PromoCard() {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <ButtonBase
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        aspectRatio: '1',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: 0,
        transition: 'transform 0.2s ease-out, opacity 0.15s ease-out',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        '@media (hover: hover)': {
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        '&:active': {
          opacity: 0.8,
          transform: 'scale(0.98)',
        },
        '&:focus-visible': {
          outline: '2px solid #000',
          outlineOffset: '2px',
        },
      }}
      aria-label="Get PR contributor discount - click to open Discord"
    >
      {/* Animated background effect on hover */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
        }}
      />

      {/* Main content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 2,
          gap: 1,
        }}
      >
        {/* Fun emoji/icon */}
        <Typography
          sx={{
            fontSize: { xs: '2.5rem', sm: '3.5rem' },
            lineHeight: 1,
            mb: 0.5,
            transition: 'transform 0.3s ease-out',
            transform: isHovered ? 'scale(1.1) rotate(-5deg)' : 'scale(1)',
          }}
        >
          🎟️
        </Typography>

        {/* Title */}
        <Typography
          variant="body1"
          sx={{
            color: '#fff',
            fontWeight: 700,
            fontSize: { xs: '0.85rem', sm: '1rem' },
            letterSpacing: '0.02em',
          }}
        >
          Secret Discount
        </Typography>

        {/* Subtitle - code style */}
        <Box
          component="code"
          sx={{
            display: 'block',
            color: 'rgba(255,255,255,0.7)',
            fontSize: { xs: '0.65rem', sm: '0.75rem' },
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0,0,0,0.3)',
            px: 1,
            py: 0.5,
            borderRadius: 0.5,
          }}
        >
          if (pr.merged) discount()
        </Box>

        {/* CTA hint */}
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: { xs: '0.6rem', sm: '0.7rem' },
            mt: 0.5,
          }}
        >
          {isHovered ? 'click to join Discord' : 'open a PR, get a code'}
        </Typography>
      </Box>

      {/* Corner badge */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: '#e94560',
          color: '#fff',
          fontSize: { xs: '0.5rem', sm: '0.6rem' },
          fontWeight: 700,
          px: 1,
          py: 0.25,
          borderRadius: 0.5,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Free*
      </Box>

      {/* Asterisk explanation */}
      <Typography
        sx={{
          position: 'absolute',
          bottom: 6,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '0.5rem',
        }}
      >
        *requires merged pull request
      </Typography>
    </ButtonBase>
  );
}
