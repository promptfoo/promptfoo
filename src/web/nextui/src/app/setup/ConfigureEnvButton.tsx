import React, { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
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
          <Accordion defaultExpanded>
            <AccordionSummary>
              OpenAI
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="OpenAI API key"
                fullWidth
                margin="normal"
                value={env.OPENAI_API_KEY}
                onChange={(e) => setEnv({ ...env, OPENAI_API_KEY: e.target.value })}
              />
              <TextField
                label="OpenAI API host"
                fullWidth
                margin="normal"
                value={env.OPENAI_API_HOST}
                onChange={(e) => setEnv({ ...env, OPENAI_API_HOST: e.target.value })}
              />
              <TextField
                label="OpenAI organization"
                fullWidth
                margin="normal"
                value={env.OPENAI_ORGANIZATION}
                onChange={(e) => setEnv({ ...env, OPENAI_ORGANIZATION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>
              Azure
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Azure API key"
                fullWidth
                margin="normal"
                value={env.AZURE_OPENAI_API_KEY}
                onChange={(e) => setEnv({ ...env, AZURE_OPENAI_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>
              Anthropic
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Anthropic API key"
                fullWidth
                margin="normal"
                value={env.ANTHROPIC_API_KEY}
                onChange={(e) => setEnv({ ...env, ANTHROPIC_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>
              Replicate
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Replicate API key"
                fullWidth
                margin="normal"
                value={env.REPLICATE_API_KEY}
                onChange={(e) => setEnv({ ...env, REPLICATE_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
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
