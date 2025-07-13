import React, { useState } from 'react';
import { useCloudAuth } from '@app/hooks/useCloudAuth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export default function CloudStatusIndicator() {
  const { isAuthenticated, appUrl, isLoading, error } = useCloudAuth();
  const [showDialog, setShowDialog] = useState(false);
  const { recordEvent } = useTelemetry();

  const handleIconClick = () => {
    if (!isAuthenticated) {
      // Track unauthenticated click
      recordEvent('feature_used', {
        feature: 'cloud_status_icon_click',
        authenticated: false,
      });
      setShowDialog(true);
    } else if (appUrl) {
      // Track authenticated click
      recordEvent('feature_used', {
        feature: 'cloud_status_icon_click',
        authenticated: true,
      });
      window.open(appUrl, '_blank');
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
  };

  const handleLearnMoreClick = () => {
    recordEvent('webui_action', {
      action: 'cloud_cta_learn_more_click',
      source: 'cloud_status_dialog',
    });
  };

  const handlePromptfooAppClick = () => {
    recordEvent('webui_action', {
      action: 'cloud_cta_signup_click',
      source: 'cloud_status_dialog',
    });
  };

  const getTooltipTitle = () => {
    if (isLoading) {
      return 'Checking cloud status...';
    }
    if (error) {
      return 'Error checking cloud status';
    }
    if (isAuthenticated) {
      return 'Connected to Promptfoo Cloud (click to open dashboard)';
    }
    return 'Not connected to Promptfoo Cloud (click to learn more)';
  };

  const getIcon = () => {
    if (isLoading) {
      return <CircularProgress size={20} color="inherit" />;
    }
    if (error || !isAuthenticated) {
      return <CloudOffIcon />;
    }
    return <CloudIcon />;
  };

  const getIconColor = () => {
    if (isLoading) {
      return 'default';
    }
    if (error) {
      return 'error';
    }
    if (isAuthenticated) {
      return 'success';
    }
    return 'inherit';
  };

  return (
    <>
      <Tooltip title={getTooltipTitle()}>
        <IconButton
          onClick={handleIconClick}
          color={getIconColor()}
          size="small"
          sx={{
            '& .MuiSvgIcon-root': {
              fontSize: '1.5rem',
            },
          }}
        >
          {getIcon()}
        </IconButton>
      </Tooltip>

      <Dialog open={showDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudQueueIcon color="primary" />
            Connect to Promptfoo Cloud
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              Connect to unlock powerful team features:
            </Typography>
            <Box component="ul" sx={{ mt: 2, pl: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                🔗 Share evaluation results with your team
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                🎯 Advanced red teaming with team-wide configurations
              </Typography>
              <Typography component="li" variant="body2">
                ✨ New features and updates as they're released
              </Typography>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Run <code>promptfoo auth login</code> or visit{' '}
            <Link
              href="https://www.promptfoo.app/welcome"
              target="_blank"
              rel="noopener"
              onClick={handlePromptfooAppClick}
            >
              promptfoo.app
            </Link>{' '}
            to get started
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Error checking cloud status: {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
          <Button
            variant="contained"
            color="primary"
            href="https://www.promptfoo.dev/docs/usage/sharing/"
            target="_blank"
            rel="noopener"
            onClick={handleLearnMoreClick}
          >
            Learn More
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
