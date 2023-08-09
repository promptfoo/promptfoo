import React from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
} from '@mui/material';
import { ProviderConfig } from '../../../../types';

interface ProviderConfigDialogProps {
  open: boolean;
  config: ProviderConfig['config'];
  onClose: () => void;
  onSave: (config: ProviderConfig['config']) => void;
}

const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  config,
  onClose,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = React.useState(config);

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = () => {
    onSave(localConfig);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Edit Provider Config</DialogTitle>
      <DialogContent>
        {Object.keys(localConfig).map((key) => {
          const value = localConfig[key];
          let handleChange;

          if (typeof value === 'number') {
            handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
              setLocalConfig({ ...localConfig, [key]: parseFloat(e.target.value) });
          } else if (typeof value === 'boolean') {
            handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
              setLocalConfig({ ...localConfig, [key]: e.target.value === 'true' });
          } else {
            handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
              setLocalConfig({ ...localConfig, [key]: e.target.value });
          }

          return (
            <Box key={key} my={2}>
            <TextField
              label={key}
              value={value}
              onChange={handleChange}
              fullWidth
              type={typeof value === 'number' ? 'number' : 'text'}
            />
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
