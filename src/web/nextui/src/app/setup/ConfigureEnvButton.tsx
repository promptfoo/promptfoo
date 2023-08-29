import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import SettingsIcon from '@mui/icons-material/Settings';

const ConfigureEnvButton: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <Button variant="outlined" startIcon={<SettingsIcon />} onClick={handleOpen}>
        API keys
      </Button>
      <Dialog open={dialogOpen} onClose={handleClose}>
        <DialogTitle>Configure APIs</DialogTitle>
        <DialogContent>
          <form noValidate autoComplete="off">
            <TextField
              label="OpenAI API key"
              fullWidth
              margin="normal"
            />
            <TextField
              label="Azure API key"
              fullWidth
              margin="normal"
            />
            <TextField
              label="Anthropic API key"
              fullWidth
              margin="normal"
            />
            <TextField
              label="Replicate API key"
              fullWidth
              margin="normal"
            />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ConfigureEnvButton;
