import React, { useCallback, useEffect, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
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

const DRAWER_WIDTH = 450;

/**
 * Drawer containing the configuration agent chat interface
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

  const {
    messages,
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

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleStart();
      }
    },
    [handleStart],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          maxWidth: '100vw',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <SmartToyIcon color="primary" sx={{ flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              Config Assistant
            </Typography>
            {started && urlInput && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: 'block', maxWidth: 280 }}
              >
                {urlInput}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {started && (
            <Tooltip title="Start over">
              <IconButton onClick={handleStartOver} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
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
                  backgroundColor: theme.palette.background.default,
                }}
              >
                <Button variant="contained" fullWidth onClick={handleApplyConfig}>
                  Apply Configuration
                </Button>
              </Box>
            )}
          </>
        ) : (
          // URL input screen
          <Box sx={{ p: 3 }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              I'll help you configure your API endpoint. Just give me the URL and I'll figure out
              how to call it.
            </Typography>

            <TextField
              fullWidth
              label="Endpoint URL"
              placeholder="https://api.example.com/v1/chat"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={handleKeyPress}
              sx={{ mb: 2 }}
              helperText="Enter the URL of your API endpoint"
              error={!!error}
              disabled={isLoading}
            />

            <Button
              variant="contained"
              fullWidth
              onClick={handleStart}
              disabled={!urlInput.trim() || isLoading}
              startIcon={
                isLoading ? <CircularProgress size={20} color="inherit" /> : <SmartToyIcon />
              }
            >
              {isLoading ? 'Starting...' : 'Auto-Configure'}
            </Button>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
