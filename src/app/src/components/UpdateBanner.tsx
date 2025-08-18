import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Snackbar from '@mui/material/Snackbar';
import CloseIcon from '@mui/icons-material/Close';
import UpdateIcon from '@mui/icons-material/Update';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { styled } from '@mui/material/styles';
import { useVersionCheck } from '@app/hooks/useVersionCheck';

const StyledAlert = styled(Alert)(({ theme }) => ({
  borderRadius: 0,
  padding: theme.spacing(0.75, 2),
  alignItems: 'center',
  '& .MuiAlert-message': {
    width: '100%',
    padding: theme.spacing(0.5, 0),
  },
  '& .MuiAlert-icon': {
    fontSize: '1.25rem',
    padding: '4px 0',
  },
}));

const UpdateContent = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  gap: '1rem',
});

const UpdateInfo = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
});

const UpdateActions = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
});

export default function UpdateBanner() {
  const { versionInfo, loading, error, dismissed, dismiss } = useVersionCheck();
  const [copySnackbarOpen, setCopySnackbarOpen] = useState(false);

  const handleCopyCommand = async () => {
    const command = versionInfo?.updateCommands?.primary;

    if (command) {
      try {
        await navigator.clipboard.writeText(command);
        setCopySnackbarOpen(true);
      } catch (error) {
        // Fallback for browsers that don't support clipboard API or when it fails
        console.error('Failed to copy to clipboard:', error);
        // Create a temporary textarea element as fallback
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          setCopySnackbarOpen(true);
        } catch (fallbackError) {
          console.error('Fallback copy also failed:', fallbackError);
          // Show the command in an alert as last resort
          alert(`Failed to copy. Command: ${command}`);
        } finally {
          document.body.removeChild(textarea);
        }
      }
    }
  };

  const handleCloseCopySnackbar = () => {
    setCopySnackbarOpen(false);
  };

  // Don't show banner if loading, error, no update available, or dismissed
  if (loading || error || !versionInfo?.updateAvailable || dismissed) {
    return null;
  }

  return (
    <>
      <StyledAlert
        severity="info"
        icon={<UpdateIcon />}
        action={
          <IconButton
            aria-label="dismiss"
            color="inherit"
            size="small"
            onClick={dismiss}
            title="Don't remind me for this version"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <UpdateContent>
          <UpdateInfo>
            <Typography variant="body2" component="span" fontWeight={500}>
              Update available: v{versionInfo.latestVersion}
            </Typography>
            <Typography variant="body2" component="span" color="text.secondary">
              (current: v{versionInfo.currentVersion})
            </Typography>
          </UpdateInfo>
          <UpdateActions>
            <Button
              size="small"
              variant="text"
              endIcon={<OpenInNewIcon sx={{ fontSize: '0.875rem' }} />}
              href="https://github.com/promptfoo/promptfoo/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textTransform: 'none' }}
            >
              Release Notes
            </Button>
            {versionInfo?.updateCommands?.primary && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyIcon sx={{ fontSize: '0.875rem' }} />}
                onClick={handleCopyCommand}
                sx={{ textTransform: 'none' }}
                title={versionInfo.updateCommands.primary}
              >
                {versionInfo.commandType === 'docker'
                  ? 'Copy Docker Command'
                  : versionInfo.commandType === 'npx'
                    ? 'Copy npx Command'
                    : 'Copy Update Command'}
              </Button>
            )}
          </UpdateActions>
        </UpdateContent>
      </StyledAlert>
      <Snackbar
        open={copySnackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseCopySnackbar}
        message={`Update command copied to clipboard`}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
