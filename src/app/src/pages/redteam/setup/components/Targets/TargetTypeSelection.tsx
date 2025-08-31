import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
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
  const { config, updateConfig, providerType, setProviderType } = useRedTeamConfig();

  // Check if we have a complete saved configuration
  const hasCompleteSavedConfig = Boolean(config.target?.label?.trim() && config.target?.id);

  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(() => {
    // If we have a complete saved config, use it. Otherwise start fresh without a label
    if (hasCompleteSavedConfig) {
      return config.target!;
    }
    // Clear the label if we don't have a complete config to ensure consistent state
    return { ...(config.target || DEFAULT_HTTP_TARGET), label: '' };
  });

  // Only show target type section if we have a complete saved configuration
  const [showTargetTypeSection, setShowTargetTypeSection] = useState(hasCompleteSavedConfig);

  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
    // Initialize providerType if not already set
    if (!providerType && config.target?.id) {
      setProviderType(getProviderType(config.target.id));
    }
  }, []);

  const handleProviderChange = (provider: ProviderOptions, providerType: string) => {
    setSelectedTarget(provider);
    setProviderType(providerType);
    updateConfig('target', provider);
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
      // Track provider type selection when moving to next step
      recordEvent('feature_used', {
        feature: 'redteam_config_provider_selected',
        provider_type: providerType,
        provider_id: selectedTarget.id,
        provider_label: selectedTarget.label,
      });
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

  // Check if user has entered a target name - must have actual content
  const hasTargetName = Boolean(selectedTarget?.label?.trim());

  const getNextButtonText = () => {
    return 'Next: Configure Target';
  };

  const isNextButtonDisabled = () => {
    return !hasTargetName || !isValidSelection();
  };

  const shouldShowFooterButton = () => {
    return showTargetTypeSection;
  };

  const getNextButtonTooltip = () => {
    if (!showTargetTypeSection) {
      return 'Please select a target type first';
    }
    if (!hasTargetName) {
      return 'Please enter a target name';
    }
    if (!isValidSelection()) {
      if (!selectedTarget.id && !selectedTarget.label?.trim()) {
        return 'Please select a target provider';
      }
      if (selectedTarget.id === '' && !selectedTarget.label?.trim()) {
        return 'Please enter a label for your custom provider';
      }
      return 'Please complete the target selection';
    }
    return undefined;
  };

  return (
    <PageWrapper
      title="Target Setup"
      description={
        <Typography variant="body1">
          A target is the AI system you want to red team. It could be an API endpoint, a language
          model, a custom script, or any other{' '}
          <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
            supported provider
          </Link>
          . Choose a descriptive name to identify your target throughout the testing process.
        </Typography>
      }
      onNext={shouldShowFooterButton() ? handleNext : undefined}
      onBack={onBack}
      nextLabel={shouldShowFooterButton() ? getNextButtonText() : undefined}
      nextDisabled={shouldShowFooterButton() ? isNextButtonDisabled() : true}
      warningMessage={
        shouldShowFooterButton() && isNextButtonDisabled() ? getNextButtonTooltip() : undefined
      }
    >
      <Stack direction="column" spacing={4}>
        {/* Quick Start Section */}
        <Alert
          severity="info"
          sx={{
            alignItems: 'center',
            '& .MuiAlert-icon': {
              mt: 0.25,
            },
            '& .MuiAlert-message': {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: 2,
              flexWrap: 'wrap',
            },
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}
          >
            <Typography variant="body2" sx={{ flex: 1, minWidth: '300px' }}>
              <strong>New to promptfoo?</strong> Want to see it in action? Load an example
              configuration to get started immediately!
            </Typography>
            <LoadExampleButton />
          </Box>
        </Alert>

        {/* Provider Name Field */}
        <TextField
          sx={{ width: '360px' }}
          value={selectedTarget?.label ?? ''}
          label="Target Name"
          placeholder="e.g. 'customer-service-agent'"
          onChange={(e) => {
            const newTarget = { ...selectedTarget, label: e.target.value };
            setSelectedTarget(newTarget);
            updateConfig('target', newTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hasTargetName && !showTargetTypeSection) {
              setShowTargetTypeSection(true);
              recordEvent('feature_used', {
                feature: 'redteam_config_target_type_section_revealed',
              });
            }
          }}
          margin="normal"
          required
          autoFocus
          InputLabelProps={{
            shrink: true,
          }}
        />

        {/* Inline Next Button for first step */}
        {hasTargetName && !showTargetTypeSection && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 2 }}>
            <Button
              variant="contained"
              onClick={() => {
                setShowTargetTypeSection(true);
                recordEvent('feature_used', {
                  feature: 'redteam_config_target_type_section_revealed',
                });
              }}
              sx={{ minWidth: '200px' }}
            >
              Next: Select Target Type
            </Button>
          </Box>
        )}

        {/* Only show target type selection after user clicks to reveal it */}
        {showTargetTypeSection && (
          <Box sx={{ mt: 4 }} gap={4}>
            <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2, mt: 4 }}>
              Select Target Type
            </Typography>
            <Box sx={{ my: 2 }}>
              <Typography variant="body1">
                Select the type that best matches your target. Don't see what you need? Try 'Custom
                Target' to access{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/"
                  target="_blank"
                  rel="noopener"
                >
                  more providers
                </Link>
                . You can also create your own using{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/python/"
                  target="_blank"
                  rel="noopener"
                >
                  Python
                </Link>
                ,{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/custom-api/"
                  target="_blank"
                  rel="noopener"
                >
                  JavaScript
                </Link>
                , or{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/custom-script/"
                  target="_blank"
                  rel="noopener"
                >
                  shell scripts
                </Link>
                .
              </Typography>
            </Box>
            {/* Provider Type Selection */}
            <ProviderTypeSelector
              provider={selectedTarget}
              setProvider={handleProviderChange}
              providerType={providerType}
            />
          </Box>
        )}
      </Stack>
    </PageWrapper>
  );
}
