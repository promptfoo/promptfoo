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
  const [selectedCommand, setSelectedCommand] = useState<'primary' | 'alternative'>('primary');

  const handleCopyCommand = (commandType: 'primary' | 'alternative' = 'primary') => {
    const command =
      commandType === 'primary'
        ? versionInfo?.updateCommands?.primary
        : versionInfo?.updateCommands?.alternative;

    if (command) {
      navigator.clipboard.writeText(command);
      setSelectedCommand(commandType);
      setCopySnackbarOpen(true);
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
                onClick={() => handleCopyCommand('primary')}
                sx={{ textTransform: 'none' }}
                title={versionInfo.updateCommands.primary}
              >
                Copy Command
              </Button>
            )}
            {versionInfo?.updateCommands?.alternative && (
              <Button
                size="small"
                variant="text"
                onClick={() => handleCopyCommand('alternative')}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                title={versionInfo.updateCommands.alternative}
              >
                or {versionInfo.isNpx ? 'global install' : 'npx'}
              </Button>
            )}
          </UpdateActions>
        </UpdateContent>
      </StyledAlert>
      <Snackbar
        open={copySnackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseCopySnackbar}
        message={`Command copied to clipboard: ${
          selectedCommand === 'primary'
            ? versionInfo?.updateCommands?.primary
            : versionInfo?.updateCommands?.alternative
        }`}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
