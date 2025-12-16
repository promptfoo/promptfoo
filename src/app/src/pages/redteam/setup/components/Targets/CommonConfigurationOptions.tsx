import React from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ExtensionEditor from './ExtensionEditor';
import type { ProviderOptions } from '@promptfoo/types';
import 'prismjs/themes/prism.css';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';

interface CommonConfigurationOptionsProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  onValidationChange?: (hasErrors: boolean) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
}

const CommonConfigurationOptions = ({
  selectedTarget,
  updateCustomTarget,
  onValidationChange,
  extensions = [],
  onExtensionsChange,
}: CommonConfigurationOptionsProps) => {
  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  return (
    <Box>
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
            <BaseNumberInput
              min={0}
              value={selectedTarget.delay ?? ''}
              onChange={(v) => updateCustomTarget('delay', v)}
              helperText="Delay in milliseconds (default: 0)"
            />
            <br />
          </Box>
        </AccordionDetails>
      </Accordion>

      <ExtensionEditor
        extensions={extensions}
        onExtensionsChange={handleExtensionsChange}
        onValidationChange={onValidationChange}
      />
    </Box>
  );
};

export default CommonConfigurationOptions;
