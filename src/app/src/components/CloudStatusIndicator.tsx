import { useState } from 'react';

import { useCloudAuth } from '@app/hooks/useCloudAuth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import ShareIcon from '@mui/icons-material/Share';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import DashboardIcon from '@mui/icons-material/Dashboard';
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
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export default function CloudStatusIndicator() {
  const { isAuthenticated, appUrl, isLoading, error, isEnterprise } = useCloudAuth();
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
      return 'Unable to check cloud status';
    }
    if (isAuthenticated) {
      const serviceName = isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud';
      return `Connected to ${serviceName} (click to open dashboard)`;
    }
    const serviceName = isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud';
    return `Not connected to ${serviceName} (click to learn more)`;
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
            Connect to {isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom sx={{ mb: 2 }}>
            Connect to unlock powerful {isEnterprise ? 'enterprise' : 'team'} features:
          </Typography>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShareIcon fontSize="small" color="primary" />
              <Typography variant="body2">
                Share evaluation results with your {isEnterprise ? 'organization' : 'team'}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <GroupWorkIcon fontSize="small" color="primary" />
              <Typography variant="body2">
                Collaborative red team testing and {isEnterprise ? 'enterprise' : 'team'} configurations
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <DashboardIcon fontSize="small" color="primary" />
              <Typography variant="body2">
                Centralized dashboard and reporting
              </Typography>
            </Stack>
          </Stack>

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
              Unable to connect to cloud service. Please check your connection and try again.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
