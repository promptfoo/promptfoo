import React, { useEffect, useState } from 'react';
import { useStore } from '@app/stores/evalConfig';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloudDoneIcon from '@mui/icons-material/CloudDone';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
};

export const AutoSaveIndicator: React.FC = () => {
  const { saveStatus, saveError, lastSavedAt, getSavedDataSize } = useStore();
  const [showSaved, setShowSaved] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (saveStatus === 'saved' && !isTyping) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus, isTyping]);

  // Detect when user is actively typing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const handleInput = () => {
      setIsTyping(true);
      setShowSaved(false);

      // Clear existing timer
      if (timer) {
        clearTimeout(timer);
      }

      // Set new timer
      timer = setTimeout(() => {
        setIsTyping(false);
        timer = null;
      }, 500);
    };

    window.addEventListener('input', handleInput);

    // Cleanup function
    return () => {
      window.removeEventListener('input', handleInput);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const dataSize = getSavedDataSize();
  const tooltipContent = lastSavedAt ? (
    <Box>
      <div>Last saved: {formatTimeAgo(lastSavedAt)}</div>
      <div>Size: {formatBytes(dataSize)}</div>
    </Box>
  ) : null;

  if (saveStatus === 'idle' && !lastSavedAt) {
    return null;
  }

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      {saveStatus === 'saving' && (
        <Chip
          size="small"
          icon={<CircularProgress size={16} thickness={4} />}
          label="Saving..."
          color="primary"
          variant="outlined"
        />
      )}

      {saveStatus === 'saved' && showSaved && (
        <Fade in={showSaved}>
          <Tooltip title={tooltipContent} arrow>
            <Chip
              size="small"
              icon={<CheckCircleIcon />}
              label="Saved"
              color="success"
              variant="outlined"
            />
          </Tooltip>
        </Fade>
      )}

      {saveStatus === 'saved' && !showSaved && lastSavedAt && (
        <Tooltip title={tooltipContent} arrow>
          <Chip
            size="small"
            icon={<CloudDoneIcon />}
            label={`Saved ${formatTimeAgo(lastSavedAt)}`}
            variant="outlined"
            sx={{ opacity: 0.7 }}
          />
        </Tooltip>
      )}

      {saveStatus === 'error' && (
        <Tooltip title={saveError || 'Failed to save'} arrow>
          <Chip
            size="small"
            icon={<ErrorIcon />}
            label="Save failed"
            color="error"
            variant="outlined"
          />
        </Tooltip>
      )}
    </Box>
  );
};
