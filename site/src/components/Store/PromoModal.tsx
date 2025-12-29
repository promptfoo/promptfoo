import React from 'react';

import CloseIcon from '@mui/icons-material/Close';
import GitHubIcon from '@mui/icons-material/GitHub';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

const DISCORD_URL = 'https://discord.gg/promptfoo';
const GITHUB_URL = 'https://github.com/promptfoo/promptfoo';

interface PromoModalProps {
  open: boolean;
  onClose: () => void;
}

export function PromoModal({ open, onClose }: PromoModalProps) {
  const handleDiscordClick = () => {
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
  };

  const handleGitHubClick = () => {
    window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullScreen
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: '90vw' },
          maxWidth: { xs: '100%', sm: '600px' },
          height: { xs: '100%', sm: 'auto' },
          maxHeight: { xs: '100%', sm: '90vh' },
          m: { xs: 0, sm: 2 },
          borderRadius: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      sx={{
        '& .MuiDialog-container': {
          alignItems: { xs: 'stretch', sm: 'center' },
        },
      }}
    >
      {/* Header bar - matches ProductModal style */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          backgroundColor: '#1a1a2e',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
          }}
        >
          PR Contributor Discount
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: '#fff',
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.1)',
            },
          }}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Hero section */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            color: '#fff',
            py: { xs: 4, sm: 5 },
            px: 3,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: '3rem', sm: '4rem' },
              lineHeight: 1,
              mb: 2,
            }}
          >
            🎟️
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              mb: 1,
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
            }}
          >
            Open Source = Free Swag
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: { xs: '0.875rem', sm: '1rem' },
            }}
          >
            Get an exclusive discount code when your PR is merged
          </Typography>
        </Box>

        {/* Steps */}
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.secondary',
              mb: 2,
              fontSize: '0.75rem',
            }}
          >
            How it works
          </Typography>

          {[
            {
              step: '1',
              title: 'Open a Pull Request',
              description: 'Fix a bug, add a feature, improve docs — any contribution counts!',
            },
            {
              step: '2',
              title: 'Get it Merged',
              description: 'Work with maintainers to get your PR approved and merged.',
            },
            {
              step: '3',
              title: 'Claim Your Code',
              description: 'Join Discord and share your merged PR to receive your discount.',
            },
          ].map((item, index) => (
            <Box
              key={item.step}
              sx={{
                display: 'flex',
                gap: 2,
                mb: index < 2 ? 2.5 : 0,
                alignItems: 'flex-start',
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: '#1a1a2e',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  flexShrink: 0,
                }}
              >
                {item.step}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, mb: 0.25 }}
                >
                  {item.title}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}
                >
                  {item.description}
                </Typography>
              </Box>
            </Box>
          ))}

          {/* Code snippet decoration */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              backgroundColor: '#1a1a2e',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: { xs: '0.7rem', sm: '0.8rem' },
              color: 'rgba(255,255,255,0.8)',
              overflow: 'auto',
            }}
          >
            <Box component="span" sx={{ color: '#e94560' }}>if</Box>
            {' (pr.status === '}
            <Box component="span" sx={{ color: '#4ade80' }}>"merged"</Box>
            {') {\n  '}
            <Box component="span" sx={{ color: '#60a5fa' }}>getDiscountCode</Box>
            {'();\n}'}
          </Box>
        </Box>
      </Box>

      {/* Footer with CTAs */}
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          borderTop: '1px solid #eee',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
        }}
      >
        <Button
          variant="outlined"
          fullWidth
          size="large"
          onClick={handleGitHubClick}
          startIcon={<GitHubIcon />}
          sx={{
            py: { xs: 1.5, sm: 1.25 },
            minHeight: { xs: 48, sm: 44 },
            borderColor: '#1a1a2e',
            color: '#1a1a2e',
            borderRadius: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: { xs: '0.75rem', sm: '0.8125rem' },
            touchAction: 'manipulation',
            '&:hover': {
              borderColor: '#1a1a2e',
              backgroundColor: 'rgba(26,26,46,0.05)',
            },
          }}
        >
          View Repository
        </Button>
        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={handleDiscordClick}
          sx={{
            py: { xs: 1.5, sm: 1.25 },
            minHeight: { xs: 48, sm: 44 },
            backgroundColor: '#5865F2',
            borderRadius: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: { xs: '0.75rem', sm: '0.8125rem' },
            touchAction: 'manipulation',
            '&:hover': {
              backgroundColor: '#4752C4',
            },
          }}
        >
          Join Discord
        </Button>
      </Box>
    </Dialog>
  );
}
