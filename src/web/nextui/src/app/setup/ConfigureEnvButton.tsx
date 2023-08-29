import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import SettingsIcon from '@mui/icons-material/Settings';

import {useStore} from '@/state/evalConfig';
import type {EnvOverrides} from '@/../../../types';

const ConfigureEnvButton: React.FC = () => {
  const {setEnv} = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openAIKey, setOpenAIKey] = useState("");
  const [azureKey, setAzureKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [replicateKey, setReplicateKey] = useState("");

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleSave = () => {
    const newEnv:EnvOverrides = {};
    if (openAIKey) newEnv.OPENAI_API_KEY = openAIKey;
    if (azureKey) newEnv.AZURE_OPENAI_API_KEY = azureKey;
    if (anthropicKey) newEnv.ANTHROPIC_API_KEY = anthropicKey;
    if (replicateKey) newEnv.REPLICATE_API_KEY = replicateKey;
    setEnv(newEnv);
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
              value={openAIKey}
              onChange={(e) => setOpenAIKey(e.target.value)}
            />
            <TextField
              label="Azure API key"
              fullWidth
              margin="normal"
              value={azureKey}
              onChange={(e) => setAzureKey(e.target.value)}
            />
            <TextField
              label="Anthropic API key"
              fullWidth
              margin="normal"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
            <TextField
              label="Replicate API key"
              fullWidth
              margin="normal"
              value={replicateKey}
              onChange={(e) => setReplicateKey(e.target.value)}
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
