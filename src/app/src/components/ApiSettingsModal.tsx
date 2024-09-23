import { useState, useEffect } from 'react';
import useApiConfig from '@app/stores/apiConfig';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';

export default function ApiSettingsModal<T extends { open: boolean; onClose: () => void }>({
  open,
  onClose,
}: T) {
  const { apiBaseUrl, setApiBaseUrl } = useApiConfig();
  const [tempApiBaseUrl, setTempApiBaseUrl] = useState(apiBaseUrl || '');

  useEffect(() => {
    setTempApiBaseUrl(apiBaseUrl || '');
  }, [apiBaseUrl]);

  const handleApiBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiBaseUrl(event.target.value);
  };

  const handleSave = () => {
    setApiBaseUrl(tempApiBaseUrl);
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
