import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import CloseIcon from '@mui/icons-material/Close';
import UpdateIcon from '@mui/icons-material/Update';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { styled } from '@mui/material/styles';
import { useVersionCheck } from '@app/hooks/useVersionCheck';

const StyledAlert = styled(Alert)(({ theme }) => ({
  borderRadius: 0,
  alignItems: 'center',
  '& .MuiAlert-message': {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  '& .MuiAlert-icon': {
    fontSize: '1.5rem',
  },
}));

const UpdateActions = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
});

export default function UpdateBanner() {
  const { versionInfo, loading, error, dismissed, dismiss } = useVersionCheck();
  const [copySnackbarOpen, setCopySnackbarOpen] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('npm install -g promptfoo@latest');
    setCopySnackbarOpen(true);
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
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      }
    >
      <Box>
        <AlertTitle sx={{ margin: 0, fontSize: '1rem' }}>
          New version available!
        </AlertTitle>
        <Box sx={{ mt: 0.5 }}>
          A new version of promptfoo ({versionInfo.latestVersion}) is available. 
          You are currently using version {versionInfo.currentVersion}.
        </Box>
        <UpdateActions sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            href="https://github.com/promptfoo/promptfoo/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Release Notes
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyCommand}
          >
            Copy Update Command
          </Button>
        </UpdateActions>
      </Box>
    </StyledAlert>
    <Snackbar
      open={copySnackbarOpen}
      autoHideDuration={3000}
      onClose={handleCloseCopySnackbar}
      message="Update command copied to clipboard!"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
    </>
  );
}