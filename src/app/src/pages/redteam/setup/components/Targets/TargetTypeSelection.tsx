import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';

interface TargetTypeSelectionProps {
  onNext: () => void;
  onBack?: () => void;
  setupModalOpen: boolean;
}

export default function TargetTypeSelection({
  onNext,
  onBack,
  setupModalOpen,
}: TargetTypeSelectionProps) {
  const theme = useTheme();
  const { config, updateConfig } = useRedTeamConfig();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );

  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget(provider);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_type_changed',
      target: provider.id,
    });
  };

  const handleNext = () => {
    if (isValidSelection()) {
      onNext();
    }
  };

  const isValidSelection = () => {
    // For custom providers, we allow empty id since it will be configured in the next step
    if (selectedTarget.id === '' && selectedTarget.label?.trim()) {
      return true; // Custom provider with a label is valid
    }
    return selectedTarget.id && selectedTarget.id.trim() !== '';
  };

  return (
    <Stack direction="column" spacing={3}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Select Target Type
        </Typography>

        <LoadExampleButton />
      </Box>

      <Typography variant="body1">
        Choose the type of target you want to red team. This determines how promptfoo will connect
        to and test your system. For more information on available targets and how to configure
        them, please visit our{' '}
        <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
          documentation
        </Link>
        .
      </Typography>

      {/* Provider Name Field */}
      <TextField
        fullWidth
        sx={{ mb: 2 }}
        label="Target Name"
        value={selectedTarget?.label ?? ''}
        placeholder="e.g. 'customer-service-agent'"
        onChange={(e) => {
          if (selectedTarget) {
            setSelectedTarget({ ...selectedTarget, label: e.target.value });
          }
        }}
        margin="normal"
        required
        autoFocus
        InputLabelProps={{
          shrink: true,
        }}
      />

      {/* Provider Type Selection */}
      <ProviderTypeSelector provider={selectedTarget} setProvider={handleProviderChange} />

      {/* Navigation Buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mt: 4,
          width: '100%',
        }}
      >
        <Box sx={{ display: 'flex', gap: 2 }}>
          {onBack && (
            <Button
              variant="outlined"
              startIcon={<KeyboardArrowLeftIcon />}
              onClick={onBack}
              sx={{ px: 4, py: 1 }}
            >
              Back
            </Button>
          )}
        </Box>

        <Button
          variant="contained"
          onClick={handleNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={!isValidSelection()}
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
            px: 4,
            py: 1,
          }}
        >
          Next: Configure Target
        </Button>
      </Box>
    </Stack>
  );
}
