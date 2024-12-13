import { useState, useEffect } from 'react';
import { useApiHealth, type ApiHealthStatus } from '@app/hooks/useApiHealth';
import useApiConfig from '@app/stores/apiConfig';
import CircleIcon from '@mui/icons-material/Circle';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

const StatusIndicator = ({ status }: { status: ApiHealthStatus }) => {
  const statusConfig = {
    connected: { color: 'success.main', text: 'Connected to promptfoo API' },
    blocked: { color: 'error.main', text: 'Cannot connect to promptfoo API' },
    loading: { color: 'info.main', text: 'Checking connection...' },
    unknown: { color: 'grey.500', text: 'Checking connection status...' },
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
  const { status, message, checkHealth } = useApiHealth();

  useEffect(() => {
    if (open) {
      checkHealth();
    }
  }, [open]);

  useEffect(() => {
    setTempApiBaseUrl(apiBaseUrl || '');
  }, [apiBaseUrl]);

  const handleApiBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiBaseUrl(event.target.value);
  };

  const handleSave = () => {
    setApiBaseUrl(tempApiBaseUrl);
    enablePersistApiBaseUrl();
    onClose();
  };

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
              <IconButton onClick={checkHealth} size="small">
                <RefreshIcon />
              </IconButton>
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
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSave}>Save</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
