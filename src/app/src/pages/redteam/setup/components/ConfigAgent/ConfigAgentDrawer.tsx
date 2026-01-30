import React, { useCallback, useEffect, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  keyframes,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { type DiscoveredConfig, useConfigAgent } from '../../hooks/useConfigAgent';
import ConfigAgentChat from './ConfigAgentChat';

interface ConfigAgentDrawerProps {
  open: boolean;
  onClose: () => void;
  initialUrl?: string;
  onConfigDiscovered?: (config: DiscoveredConfig) => void;
}

const DRAWER_WIDTH = 480;

// Animation keyframes
const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const pulseGlow = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
  }
`;

// Phase configuration
const PHASES = [
  { key: 'initializing', label: 'Init' },
  { key: 'probing', label: 'Probe' },
  { key: 'analyzing', label: 'Analyze' },
  { key: 'confirming', label: 'Verify' },
  { key: 'complete', label: 'Done' },
] as const;

/**
 * Drawer containing the configuration agent chat interface
 * Design: Technical assistant with phase progress tracking
 */
export default function ConfigAgentDrawer({
  open,
  onClose,
  initialUrl = '',
  onConfigDiscovered,
}: ConfigAgentDrawerProps) {
  const theme = useTheme();
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [started, setStarted] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const {
    messages,
    session,
    isLoading,
    error,
    isComplete,
    finalConfig,
    startSession,
    sendMessage,
    selectOption,
    submitApiKey,
    cancelSession,
    reset,
  } = useConfigAgent();

  // Update URL input when initialUrl changes
  useEffect(() => {
    if (initialUrl) {
      setUrlInput(initialUrl);
    }
  }, [initialUrl]);

  // Notify parent when config is discovered
  useEffect(() => {
    if (isComplete && finalConfig && onConfigDiscovered) {
      onConfigDiscovered(finalConfig);
    }
  }, [isComplete, finalConfig, onConfigDiscovered]);

  const handleStart = useCallback(async () => {
    if (!urlInput.trim()) {
      return;
    }
    setStarted(true);
    await startSession(urlInput.trim());
  }, [urlInput, startSession]);

  const handleClose = useCallback(() => {
    cancelSession();
    reset();
    setStarted(false);
    onClose();
  }, [cancelSession, reset, onClose]);

  const handleStartOver = useCallback(() => {
    cancelSession();
    reset();
    setStarted(false);
  }, [cancelSession, reset]);

  const handleApplyConfig = useCallback(() => {
    if (finalConfig && onConfigDiscovered) {
      onConfigDiscovered(finalConfig);
      handleClose();
    }
  }, [finalConfig, onConfigDiscovered, handleClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleStart();
      }
    },
    [handleStart],
  );

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(urlInput);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }, [urlInput]);

  // Get current phase index for progress indicator
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === session?.phase) || 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          maxWidth: '100vw',
          backgroundColor: theme.palette.background.default,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background:
            theme.palette.mode === 'dark'
              ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 100%)`
              : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
        }}
      >
        {/* Top Row: Title & Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            pb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
              }}
            >
              <RocketLaunchIcon sx={{ fontSize: 20, color: '#fff' }} />
            </Box>
            <Box>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                Config Assistant
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.7rem',
                }}
              >
                Auto-discover API configuration
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {started && (
              <Tooltip title="Start over">
                <IconButton
                  onClick={handleStartOver}
                  size="small"
                  sx={{
                    color: theme.palette.text.secondary,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.action.hover, 0.8),
                    },
                  }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Close">
              <IconButton
                onClick={handleClose}
                size="small"
                sx={{
                  color: theme.palette.text.secondary,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.action.hover, 0.8),
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* URL Display (when started) */}
        {started && urlInput && (
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: '8px',
                backgroundColor: alpha(theme.palette.background.paper, 0.6),
                border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  flex: 1,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.7rem',
                  color: theme.palette.text.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {urlInput}
              </Typography>
              <Tooltip title={urlCopied ? 'Copied!' : 'Copy URL'}>
                <IconButton
                  size="small"
                  onClick={handleCopyUrl}
                  sx={{ p: 0.25, color: theme.palette.text.secondary }}
                >
                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* Phase Progress Indicator (when started) */}
        {started && session && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {PHASES.map((phase, index) => {
                const isActive = index === currentPhaseIndex;
                const isPast = index < currentPhaseIndex;
                const isError = session.phase === 'error' && index === currentPhaseIndex;

                return (
                  <React.Fragment key={phase.key}>
                    <Box
                      sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      {/* Dot */}
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          transition: 'all 0.3s ease',
                          ...(isPast && {
                            backgroundColor: theme.palette.success.main,
                          }),
                          ...(isActive && {
                            backgroundColor: isError
                              ? theme.palette.error.main
                              : theme.palette.primary.main,
                            animation: isError ? undefined : `${pulseGlow} 2s infinite`,
                          }),
                          ...(!isPast &&
                            !isActive && {
                              backgroundColor: alpha(theme.palette.text.disabled, 0.3),
                            }),
                        }}
                      />
                      {/* Label */}
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6rem',
                          fontWeight: isActive ? 600 : 400,
                          color: isActive
                            ? isError
                              ? theme.palette.error.main
                              : theme.palette.primary.main
                            : isPast
                              ? theme.palette.success.main
                              : theme.palette.text.disabled,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {phase.label}
                      </Typography>
                    </Box>
                    {/* Connector line */}
                    {index < PHASES.length - 1 && (
                      <Box
                        sx={{
                          width: 16,
                          height: 2,
                          borderRadius: 1,
                          backgroundColor: isPast
                            ? theme.palette.success.main
                            : alpha(theme.palette.text.disabled, 0.2),
                          transition: 'background-color 0.3s ease',
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {started ? (
          // Chat interface
          <>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <ConfigAgentChat
                messages={messages}
                isLoading={isLoading}
                onSendMessage={sendMessage}
                onSelectOption={selectOption}
                onSubmitApiKey={submitApiKey}
              />
            </Box>

            {/* Apply button when complete */}
            {isComplete && finalConfig && (
              <Box
                sx={{
                  p: 2,
                  borderTop: `1px solid ${theme.palette.divider}`,
                  backgroundColor: alpha(theme.palette.success.main, 0.04),
                }}
              >
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleApplyConfig}
                  sx={{
                    py: 1.25,
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
                    boxShadow: `0 4px 12px ${alpha(theme.palette.success.main, 0.3)}`,
                    '&:hover': {
                      boxShadow: `0 6px 16px ${alpha(theme.palette.success.main, 0.4)}`,
                    },
                  }}
                >
                  ✓ Apply Configuration
                </Button>
              </Box>
            )}
          </>
        ) : (
          // URL input screen
          <Box
            sx={{
              p: 3,
              animation: `${slideIn} 0.3s ease-out`,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                mb: 3,
                lineHeight: 1.6,
              }}
            >
              Enter your API endpoint URL and I'll automatically detect the format, authentication
              method, and response structure.
            </Typography>

            <TextField
              fullWidth
              label="Endpoint URL"
              placeholder="https://api.example.com/v1/chat/completions"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              error={!!error}
              disabled={isLoading}
              autoComplete="off"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.85rem',
                },
                '& .MuiInputLabel-root': {
                  fontWeight: 500,
                },
              }}
              helperText="Supports OpenAI, Anthropic, Azure, and custom REST APIs"
            />

            <Button
              variant="contained"
              fullWidth
              onClick={handleStart}
              disabled={!urlInput.trim() || isLoading}
              sx={{
                py: 1.25,
                borderRadius: '12px',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.3)}`,
                '&:hover': {
                  boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
                '&.Mui-disabled': {
                  background: alpha(theme.palette.action.disabled, 0.12),
                },
              }}
              startIcon={
                isLoading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <RocketLaunchIcon sx={{ fontSize: 18 }} />
                )
              }
            >
              {isLoading ? 'Starting Discovery...' : 'Start Auto-Discovery'}
            </Button>

            {error && (
              <Alert
                severity="error"
                sx={{
                  mt: 2,
                  borderRadius: '12px',
                  '& .MuiAlert-message': {
                    fontSize: '0.85rem',
                  },
                }}
              >
                {error}
              </Alert>
            )}

            {/* Feature highlights */}
            <Box sx={{ mt: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: theme.palette.text.secondary,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1.5,
                }}
              >
                What I'll detect
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[
                  'Request format & headers',
                  'Authentication method',
                  'Response extraction path',
                  'Available models',
                ].map((feature) => (
                  <Box
                    key={feature}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        backgroundColor: theme.palette.primary.main,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: '0.75rem',
                      }}
                    >
                      {feature}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
