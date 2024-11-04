import React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';

interface AddLocalProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (provider: ProviderOptions) => void;
}

const AddLocalProviderDialog: React.FC<AddLocalProviderDialogProps> = ({
  open,
  onClose,
  onAdd,
}) => {
  const [path, setPath] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = () => {
    if (!path) {
      setError('Path is required');
      return;
    }

    if (!path.endsWith('.py') && !path.endsWith('.js')) {
      setError('Only .py and .js files are supported');
      return;
    }

    const provider: ProviderOptions = {
      id: `file://${path}`,
      config: {},
      label: path.split('/').pop() || path,
    };

    onAdd(provider);
    onClose();
    setPath('');
    setError('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>Add Local Provider</DialogTitle>
      <DialogContent sx={{ pb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter the absolute path to your local provider implementation (.py or .js file). This file
          will be referenced in your promptfoo configuration.
        </Typography>
        <TextField
          fullWidth
          placeholder="/absolute/path/to/your/provider.py"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setError('');
          }}
          error={!!error}
          helperText={error || 'Example: /home/user/projects/my-provider.py'}
          size="medium"
          sx={{
            '& .MuiOutlinedInput-root': {
              height: '56px',
            },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="text" sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" sx={{ px: 3 }}>
          Add Provider
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddLocalProviderDialog;
