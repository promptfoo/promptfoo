import React from 'react';
import JsonTextField from '@app/components/JsonTextField';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import type { ProviderOptions } from '@promptfoo/types';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config: ProviderOptions['config'];
  onClose: () => void;
  onSave: (providerId: string, config: ProviderOptions['config']) => void;
}

const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  providerId,
  config,
  onClose,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = React.useState(config);

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = () => {
    onSave(providerId, localConfig);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Edit {providerId.length > 50 ? providerId.slice(0, 50) + '...' : providerId}
      </DialogTitle>
      <DialogContent>
        {Object.keys(localConfig).map((key) => {
          const value = localConfig[key];
          let handleChange;

          if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'string'
          ) {
            if (typeof value === 'number') {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
                setLocalConfig({ ...localConfig, [key]: Number.parseFloat(e.target.value) });
            } else if (typeof value === 'boolean') {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
                setLocalConfig({ ...localConfig, [key]: e.target.value === 'true' });
            } else {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                const trimmed = e.target.value.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try {
                    setLocalConfig({ ...localConfig, [key]: JSON.parse(trimmed) });
                  } catch {
                    setLocalConfig({ ...localConfig, [key]: trimmed });
                  }
                } else if (trimmed === 'null') {
                  setLocalConfig({ ...localConfig, [key]: null });
                } else if (trimmed === 'undefined') {
                  setLocalConfig({ ...localConfig, [key]: undefined });
                } else {
                  setLocalConfig({ ...localConfig, [key]: trimmed });
                }
              };
            }

            return (
              <Box key={key} my={2}>
                <TextField
                  label={key}
                  value={value}
                  onChange={handleChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  type={typeof value === 'number' ? 'number' : 'text'}
                />
              </Box>
            );
          } else {
            return (
              <Box key={key} my={2}>
                <JsonTextField
                  label={key}
                  defaultValue={JSON.stringify(value)}
                  onChange={(parsed) => {
                    setLocalConfig({ ...localConfig, [key]: parsed });
                  }}
                  fullWidth
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            );
          }
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
