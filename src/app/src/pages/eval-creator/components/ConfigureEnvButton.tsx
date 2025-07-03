import React, { useState } from 'react';
import { useStore } from '@app/stores/evalConfig';
import SettingsIcon from '@mui/icons-material/Settings';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

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
      <Dialog open={dialogOpen} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>Provider settings</DialogTitle>
        <DialogContent>
          <Accordion defaultExpanded>
            <AccordionSummary>OpenAI</AccordionSummary>
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
            <AccordionSummary>Azure</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Azure API key"
                fullWidth
                margin="normal"
                value={env.AZURE_API_KEY || env.AZURE_OPENAI_API_KEY}
                onChange={(e) => setEnv({ ...env, AZURE_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Amazon Bedrock</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Bedrock Region"
                fullWidth
                margin="normal"
                value={env.AWS_BEDROCK_REGION}
                onChange={(e) => setEnv({ ...env, AWS_BEDROCK_REGION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Anthropic</AccordionSummary>
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
            <AccordionSummary>Google Vertex AI</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Vertex API Key"
                fullWidth
                margin="normal"
                value={env.VERTEX_API_KEY}
                onChange={(e) => setEnv({ ...env, VERTEX_API_KEY: e.target.value })}
              />
            </AccordionDetails>
            <AccordionDetails>
              <TextField
                label="Vertex Project ID"
                fullWidth
                margin="normal"
                value={env.VERTEX_PROJECT_ID}
                onChange={(e) => setEnv({ ...env, VERTEX_PROJECT_ID: e.target.value })}
              />
            </AccordionDetails>
            <AccordionDetails>
              <TextField
                label="Vertex Region"
                fullWidth
                margin="normal"
                value={env.VERTEX_REGION}
                onChange={(e) => setEnv({ ...env, VERTEX_REGION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Replicate</AccordionSummary>
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
