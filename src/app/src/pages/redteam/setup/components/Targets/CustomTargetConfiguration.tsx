import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField } from '@mui/material';
import Link from '@mui/material/Link';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import type { ProviderOptions } from '../../types';

interface CustomTargetConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  rawConfigJson: string;
  setRawConfigJson: (value: string) => void;
  bodyError: string | null;
}

const CustomTargetConfiguration: React.FC<CustomTargetConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  rawConfigJson,
  setRawConfigJson,
  bodyError,
}) => {
  const [targetId, setTargetId] = useState(selectedTarget.id || '');

  useEffect(() => {
    setTargetId(selectedTarget.id || '');
  }, [selectedTarget.id]);

  const handleTargetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setTargetId(newId);
    updateCustomTarget('id', newId);
  };

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        Custom Target Configuration
      </Typography>
      <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
        <TextField
          fullWidth
          label="Target ID"
          value={targetId}
          onChange={handleTargetIdChange}
          margin="normal"
          required
          placeholder="e.g., openai:chat:gpt-4o"
          helperText={
            <>
              The configuration string for your custom target. See{' '}
              <Link href="https://www.promptfoo.dev/docs/red-team/configuration/#custom-providerstargets">
                Custom Targets documentation
              </Link>{' '}
              for more information.
            </>
          }
        />

        <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
          Custom Configuration
        </Typography>
        <TextField
          fullWidth
          label="Configuration (JSON)"
          value={rawConfigJson}
          onChange={(e) => {
            setRawConfigJson(e.target.value);
            try {
              const config = JSON.parse(e.target.value);
              updateCustomTarget('config', config);
            } catch (error) {
              console.error('Invalid JSON configuration:', error);
            }
          }}
          margin="normal"
          multiline
          minRows={4}
          maxRows={10}
          error={!!bodyError}
          helperText={bodyError || 'Enter your custom configuration as JSON'}
          InputProps={{
            inputComponent: TextareaAutosize,
          }}
        />
      </Box>
    </Box>
  );
};

export default CustomTargetConfiguration;
