import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import Link from '@mui/material/Link';
import SettingsIcon from '@mui/icons-material/Settings';
import type { ProviderOptions } from '../../types';
import ProviderConfigDialog from '@app/pages/eval-creator/components/ProviderConfigDialog';

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
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  useEffect(() => {
    setTargetId(selectedTarget.id || '');
  }, [selectedTarget.id]);

  const handleTargetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setTargetId(newId);
    updateCustomTarget('id', newId);
  };

  const handleConfigSave = (providerId: string, config: Record<string, any>) => {
    updateCustomTarget('config', config);
    setRawConfigJson(JSON.stringify(config, null, 2));
    setConfigDialogOpen(false);
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

        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Provider Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure authentication, API endpoints, and other provider-specific settings.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setConfigDialogOpen(true)}
            fullWidth
          >
            Configure Provider Settings
          </Button>
        </Box>

        {selectedTarget.config && Object.keys(selectedTarget.config).length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Current Configuration:
            </Typography>
            <Box
              sx={{
                mt: 1,
                p: 1,
                bgcolor: 'grey.100',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(selectedTarget.config, null, 2)}
            </Box>
          </Box>
        )}
      </Box>

      <ProviderConfigDialog
        open={configDialogOpen}
        providerId={targetId || 'custom'}
        config={selectedTarget.config || {}}
        onClose={() => setConfigDialogOpen(false)}
        onSave={handleConfigSave}
      />
    </Box>
  );
};

export default CustomTargetConfiguration;
