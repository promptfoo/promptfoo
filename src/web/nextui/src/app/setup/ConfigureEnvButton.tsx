import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import SettingsIcon from '@mui/icons-material/Settings';

import { useStore } from '@/state/evalConfig';

const ConfigureEnvButton: React.FC = () => {
  const { env: defaultEnv, setEnv: saveEnv } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [env, setEnv] = useState(defaultEnv);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleSave = () => {
    saveEnv(env);
    handleClose();
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
              value={env.OPENAI_API_KEY}
              onChange={(e) => setEnv({ ...env, OPENAI_API_KEY: e.target.value })}
            />
            <TextField
              label="Azure API key"
              fullWidth
              margin="normal"
              value={env.AZURE_OPENAI_API_KEY}
              onChange={(e) => setEnv({ ...env, AZURE_OPENAI_API_KEY: e.target.value })}
            />
            <TextField
              label="Anthropic API key"
              fullWidth
              margin="normal"
              value={env.ANTHROPIC_API_KEY}
              onChange={(e) => setEnv({ ...env, ANTHROPIC_API_KEY: e.target.value })}
            />
            <TextField
              label="Replicate API key"
              fullWidth
              margin="normal"
              value={env.REPLICATE_API_KEY}
              onChange={(e) => setEnv({ ...env, REPLICATE_API_KEY: e.target.value })}
            />
          </form>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ConfigureEnvButton;
