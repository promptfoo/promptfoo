import React from 'react';
import {
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
        <TextField
          label="Temperature"
          value={localConfig.temperature}
          onChange={(e) =>
            setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })
          }
        />
        <TextField
          label="Max Tokens"
          value={localConfig.max_tokens}
          onChange={(e) =>
            setLocalConfig({ ...localConfig, max_tokens: parseInt(e.target.value, 10) })
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
