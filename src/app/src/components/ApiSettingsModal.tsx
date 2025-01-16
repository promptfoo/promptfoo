import { useState, useEffect } from 'react';
import { useApiHealth, type ApiHealthStatus } from '@app/hooks/useApiHealth';
import useApiConfig from '@app/stores/apiConfig';
import CircleIcon from '@mui/icons-material/Circle';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

const StatusIndicator = ({ status }: { status: ApiHealthStatus }) => {
  const statusConfig: Record<ApiHealthStatus, { color: string; text: string }> = {
    connected: { color: 'success.main', text: 'Connected to promptfoo API' },
    blocked: { color: 'error.main', text: 'Cannot connect to promptfoo API' },
    loading: { color: 'info.main', text: 'Checking connection...' },
    unknown: { color: 'grey.500', text: 'Checking connection status...' },
    disabled: { color: 'grey.400', text: 'Remote generation is disabled' },
  };

  const config = statusConfig[status];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <CircleIcon sx={{ color: config.color, fontSize: '12px' }} />
      <Typography variant="body2">{config.text}</Typography>
    </Box>
  );
};

export default function ApiSettingsModal<T extends { open: boolean; onClose: () => void }>({
  open,
  onClose,
}: T) {
  const { apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl } = useApiConfig();
  const [tempApiBaseUrl, setTempApiBaseUrl] = useState(apiBaseUrl || '');
  const { status, message, checkHealth, isChecking } = useApiHealth();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      checkHealth();
    }
  }, [open, checkHealth]);

  useEffect(() => {
    setTempApiBaseUrl(apiBaseUrl || '');
  }, [apiBaseUrl]);

  const handleApiBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiBaseUrl(event.target.value);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setApiBaseUrl(tempApiBaseUrl);
      enablePersistApiBaseUrl();
      await checkHealth();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isFormDisabled = status === 'loading' || isChecking || isSaving;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="api-settings-dialog-title"
    >
      <DialogTitle id="api-settings-dialog-title">API and Sharing Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <StatusIndicator status={status} />
            <Tooltip title="Check connection">
              <span>
                <IconButton onClick={checkHealth} size="small" disabled={isChecking}>
                  {isChecking ? <CircularProgress size={20} /> : <RefreshIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {message && status !== 'unknown' && status !== 'loading' && (
            <Alert severity={status === 'connected' ? 'success' : 'error'} sx={{ mt: 1 }}>
              {message}
            </Alert>
          )}
        </Box>

        <Typography variant="h6">API</Typography>
        <TextField
          label="API Base URL"
          helperText="The promptfoo API the webview will connect to"
          value={tempApiBaseUrl}
          onChange={handleApiBaseUrlChange}
          fullWidth
          margin="normal"
          disabled={isFormDisabled}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleSave}
          disabled={isFormDisabled}
          startIcon={isSaving && <CircularProgress size={20} />}
        >
          Save
        </Button>
        <Button onClick={onClose} disabled={isFormDisabled}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
