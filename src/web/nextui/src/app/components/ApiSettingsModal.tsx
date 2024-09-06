import { useState, useEffect } from 'react';
import useApiConfig from '@/state/apiConfig';
import useShareConfig from '@/state/shareConfig';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
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
      <DialogTitle id="api-settings-dialog-title">API Settings</DialogTitle>
      <DialogContent>
        <TextField
          label="API Base URL"
          value={tempApiBaseUrl}
          onChange={handleApiBaseUrlChange}
          fullWidth
          margin="normal"
        />
        <TextField
          label="API Share Base URL"
          value={tempApiShareBaseUrl}
          onChange={handleApiShareBaseUrlChange}
          fullWidth
          margin="normal"
        />
        <TextField
          label="App Share Base URL"
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
