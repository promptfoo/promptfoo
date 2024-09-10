import { useState, useEffect } from 'react';
import useApiConfig from '@app/state/apiConfig';
import useShareConfig from '@app/state/shareConfig';
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
  const { apiShareBaseUrl, setApiShareBaseUrl, appShareBaseUrl, setAppShareBaseUrl } =
    useShareConfig();
  const [tempApiBaseUrl, setTempApiBaseUrl] = useState(apiBaseUrl || '');
  const [tempApiShareBaseUrl, setTempApiShareBaseUrl] = useState(apiShareBaseUrl || '');
  const [tempAppShareBaseUrl, setTempAppShareBaseUrl] = useState(appShareBaseUrl || '');

  useEffect(() => {
    setTempApiBaseUrl(apiBaseUrl || '');
    setTempApiShareBaseUrl(apiShareBaseUrl || '');
    setTempAppShareBaseUrl(appShareBaseUrl || '');
  }, [apiBaseUrl, apiShareBaseUrl, appShareBaseUrl]);

  const handleApiBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiBaseUrl(event.target.value);
  };

  const handleApiShareBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiShareBaseUrl(event.target.value);
  };

  const handleAppShareBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempAppShareBaseUrl(event.target.value);
  };

  const handleSave = () => {
    setApiBaseUrl(tempApiBaseUrl);
    setApiShareBaseUrl(tempApiShareBaseUrl);
    setAppShareBaseUrl(tempAppShareBaseUrl);
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

        <Typography variant="h6">Sharing</Typography>
        <TextField
          label="API Share Base URL"
          helperText='Where to send the eval when you click "Share"'
          value={tempApiShareBaseUrl}
          onChange={handleApiShareBaseUrlChange}
          fullWidth
          margin="normal"
        />
        <TextField
          label="App Share Base URL"
          helperText="Set this to the App URL for the promptfoo instance you send shared evals to"
          value={tempAppShareBaseUrl}
          onChange={handleAppShareBaseUrlChange}
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
