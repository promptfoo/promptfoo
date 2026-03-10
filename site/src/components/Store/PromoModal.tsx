import React from 'react';

import CloseIcon from '@mui/icons-material/Close';
import GitHubIcon from '@mui/icons-material/GitHub';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import SvgIcon from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';

const DISCORD_URL = 'https://discord.gg/promptfoo';
const GITHUB_URL = 'https://github.com/promptfoo/promptfoo';

function DiscordIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </SvgIcon>
  );
}

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
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: '90vw' },
          maxWidth: { xs: '100vw', sm: '500px' },
          height: { xs: '100vh', sm: 'auto' },
          maxHeight: { xs: '100vh', sm: '90vh' },
          m: 0,
          borderRadius: { xs: 0, sm: '8px' },
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--ifm-font-color-base, #1c1e21)',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          backgroundColor: 'var(--ifm-color-primary-darker)',
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
          Contributor Discount
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: '#fff',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
          backgroundColor: 'var(--ifm-background-color, #ffffff)',
        }}
      >
        {/* Headline */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2.5, sm: 3 }, pb: { xs: 1.5, sm: 2 } }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              color: 'var(--ifm-heading-color)',
              mb: 0.5,
            }}
          >
            Merge a PR, get a discount code
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'var(--ifm-color-emphasis-600)',
              fontSize: { xs: '0.85rem', sm: '0.9rem' },
            }}
          >
            We give back to open source contributors with exclusive store discounts.
          </Typography>
        </Box>

        {/* Steps */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 } }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--ifm-color-emphasis-500)',
              mb: 2,
              fontSize: '0.7rem',
            }}
          >
            How it works
          </Typography>

          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {[
              {
                title: 'Fork & Fix',
                description: 'Bug fix, feature, docs — all contributions welcome.',
              },
              {
                title: 'Get Merged',
                description: 'Work with maintainers to land your PR.',
              },
              {
                title: 'Claim Perks',
                description: "Drop your merged PR link in Discord #general. We'll DM you a code.",
              },
            ].map((item, index) => (
              <Box
                component="li"
                key={item.title}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  mb: index < 2 ? 2 : 0,
                  alignItems: 'flex-start',
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: 'var(--ifm-color-primary-darker)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    flexShrink: 0,
                    mt: '2px',
                  }}
                >
                  {index + 1}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      lineHeight: 1.4,
                      mb: 0.25,
                      color: 'var(--ifm-heading-color)',
                    }}
                  >
                    {item.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'var(--ifm-color-emphasis-600)',
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Footer CTAs */}
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          borderTop: '1px solid var(--ifm-color-emphasis-300)',
          backgroundColor: 'var(--ifm-background-color, #ffffff)',
          display: 'flex',
          flexDirection: { xs: 'column-reverse', sm: 'row' },
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
            borderColor: 'var(--ifm-color-emphasis-400)',
            color: 'var(--ifm-font-color-base)',
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: { xs: '0.8rem', sm: '0.875rem' },
            touchAction: 'manipulation',
            '&:hover': {
              borderColor: 'var(--ifm-color-emphasis-600)',
              backgroundColor: 'var(--ifm-background-surface-color)',
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
          startIcon={<DiscordIcon />}
          sx={{
            py: { xs: 1.5, sm: 1.25 },
            minHeight: { xs: 48, sm: 44 },
            backgroundColor: 'var(--ifm-color-primary-darker)',
            color: '#fff',
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: { xs: '0.8rem', sm: '0.875rem' },
            touchAction: 'manipulation',
            '&:hover': {
              backgroundColor: 'var(--ifm-color-primary-darkest)',
            },
          }}
        >
          Join Discord
        </Button>
      </Box>
    </Dialog>
  );
}
