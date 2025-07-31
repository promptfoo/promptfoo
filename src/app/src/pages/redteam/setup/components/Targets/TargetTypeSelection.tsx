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
import { getProviderType } from './helpers';
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
  const [showTargetTypeSection, setShowTargetTypeSection] = useState(
    Boolean(config.target?.label && config.target?.id),
  );
  const [providerType, setProviderType] = useState<string | undefined>(
    getProviderType(config.target?.id),
  );

  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    setProviderType(getProviderType(selectedTarget.id));
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget(provider);
    setProviderType(getProviderType(provider.id));
    recordEvent('feature_used', {
      feature: 'redteam_config_target_type_changed',
      target: provider.id,
    });
  };

  const handleNext = () => {
    // If target type section is not shown yet, show it first
    if (hasTargetName && !showTargetTypeSection) {
      setShowTargetTypeSection(true);
      recordEvent('feature_used', {
        feature: 'redteam_config_target_type_section_revealed',
      });
      return;
    }

    // If target type section is shown and selection is valid, proceed to next step
    if (showTargetTypeSection && isValidSelection()) {
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

  // Check if user has entered a target name
  const hasTargetName = selectedTarget?.label?.trim() !== '';

  const getNextButtonText = () => {
    if (!hasTargetName || !showTargetTypeSection) {
      return 'Next: Select Target Type';
    }

    return 'Next: Configure Target';
  };

  const isNextButtonDisabled = () => {
    if (!hasTargetName) {
      return true;
    }
    if (hasTargetName && !showTargetTypeSection) {
      return false;
    }
    return !isValidSelection();
  };

  return (
    <Stack direction="column" spacing={3}>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Target Setup
      </Typography>
      <Typography variant="body1">
        Enter a name for your target. This will be used to identify the target in the UI and in the
        logs.
      </Typography>
      {/* Provider Name Field */}
      <TextField
        sx={{ mb: 2, width: '360px' }}
        value={selectedTarget?.label ?? ''}
        label="Target Name"
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

      {/* Only show target type selection after user clicks to reveal it */}
      {showTargetTypeSection && (
        <>
          <Box
            sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              Select Target Type
            </Typography>

            <LoadExampleButton />
          </Box>

          <Typography variant="body1">
            Choose the type of target you want to red team. This determines how promptfoo will
            connect to and test your system. For more information on available targets and how to
            configure them, please visit our{' '}
            <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
              documentation
            </Link>
            .
          </Typography>

          {/* Provider Type Selection */}
          <ProviderTypeSelector
            provider={selectedTarget}
            setProvider={handleProviderChange}
            providerType={providerType}
          />
        </>
      )}

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
          endIcon={hasTargetName && showTargetTypeSection ? <KeyboardArrowRightIcon /> : null}
          disabled={isNextButtonDisabled()}
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
            px: 4,
            py: 1,
          }}
        >
          {getNextButtonText()}
        </Button>
      </Box>
    </Stack>
  );
}
