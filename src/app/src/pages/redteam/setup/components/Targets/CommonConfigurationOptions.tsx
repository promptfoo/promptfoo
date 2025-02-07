import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';
import 'prismjs/themes/prism.css';

interface CommonConfigurationOptionsProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const CommonConfigurationOptions: React.FC<CommonConfigurationOptionsProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <Box mt={4}>
      <Accordion defaultExpanded={!!selectedTarget.delay}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography variant="h6">Delay</Typography>
            <Typography variant="body2" color="text.secondary">
              Configure the delay between requests
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Add a delay (ms) between requests to simulate a real user. See{' '}
            <a href="https://www.promptfoo.dev/docs/providers/http/#delay" target="_blank">
              docs
            </a>{' '}
            for more details.
          </Typography>
          <Box>
            <TextField
              value={selectedTarget.delay ?? ''}
              onChange={(e) => updateCustomTarget('delay', Number(e.target.value))}
            />
            <br />
            <Typography variant="caption">Delay in milliseconds (default: 0)</Typography>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default CommonConfigurationOptions;
