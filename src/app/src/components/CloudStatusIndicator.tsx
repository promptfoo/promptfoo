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

      <Dialog 
        open={showDialog} 
        onClose={handleCloseDialog} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Box sx={{ 
              p: 1, 
              borderRadius: 2, 
              backgroundColor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CloudQueueIcon sx={{ color: 'white', fontSize: '2rem' }} />
            </Box>
            <Box>
              <Typography variant="h5" component="h2" fontWeight="bold">
                Connect to {isEnterprise ? 'Promptfoo Enterprise' : 'Promptfoo Cloud'}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Unlock powerful {isEnterprise ? 'enterprise' : 'team'} collaboration features
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ 
                  p: 1.5, 
                  borderRadius: 2, 
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 48,
                  minHeight: 48
                }}>
                  <ShareIcon sx={{ color: 'primary.main', fontSize: '1.5rem' }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight="semibold" gutterBottom>
                    Share Results
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Share evaluation results and collaborate with your {isEnterprise ? 'organization' : 'team'}
                  </Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ 
                  p: 1.5, 
                  borderRadius: 2, 
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 48,
                  minHeight: 48
                }}>
                  <GroupWorkIcon sx={{ color: 'success.main', fontSize: '1.5rem' }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight="semibold" gutterBottom>
                    Red Team Testing
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Collaborative red team testing with {isEnterprise ? 'enterprise' : 'team'} configurations
                  </Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ 
                  p: 1.5, 
                  borderRadius: 2, 
                  backgroundColor: 'rgba(156, 39, 176, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 48,
                  minHeight: 48
                }}>
                  <DashboardIcon sx={{ color: 'secondary.main', fontSize: '1.5rem' }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight="semibold" gutterBottom>
                    Centralized Dashboard
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Access powerful reporting and analytics from a unified dashboard
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          <Alert 
            severity="info" 
            sx={{ 
              mb: 2,
              borderRadius: 2,
              '& .MuiAlert-message': {
                width: '100%'
              }
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight="semibold">
                Ready to get started?
              </Typography>
              <Typography variant="body2">
                Run <code style={{ 
                  backgroundColor: 'rgba(0,0,0,0.1)', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontFamily: 'monospace'
                }}>promptfoo auth login</code> or visit{' '}
                <Link
                  href="https://www.promptfoo.app/welcome"
                  target="_blank"
                  rel="noopener"
                  onClick={handlePromptfooAppClick}
                  sx={{ 
                    fontWeight: 'semibold',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline'
                    }
                  }}
                >
                  promptfoo.app
                </Link>{' '}
                to connect your account
              </Typography>
            </Box>
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Unable to connect to cloud service. Please check your connection and try again.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1 }}>
          <Button 
            onClick={handleCloseDialog}
            variant="outlined"
            size="large"
            sx={{ 
              minWidth: 120,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 'semibold'
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
