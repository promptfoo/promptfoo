import { useCallback, useEffect, useRef, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import PageWrapper from '../PageWrapper';
import Prompts from '../Prompts';
import ProviderConfigEditor from './ProviderConfigEditor';
import { getProviderDocumentationUrl, hasSpecificDocumentation } from './providerDocumentationMap';

import type { ProviderOptions } from '../../types';

interface TargetConfigurationProps {
  onNext: () => void;
  onBack: () => void;
}

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

export default function TargetConfiguration({ onNext, onBack }: TargetConfigurationProps) {
  const { config, updateConfig, providerType } = useRedTeamConfig();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );
  const [providerError, setProviderError] = useState<string | null>(null);
  const [promptRequired, setPromptRequired] = useState(requiresPrompt(selectedTarget));
  const [validationErrors, setValidationErrors] = useState<string | null>(null);
  const [shouldValidate, setShouldValidate] = useState<boolean>(false);

  const validateRef = useRef<(() => boolean) | null>(null);
  const { recordEvent } = useTelemetry();

  const handleValidationRequest = useCallback((validator: () => boolean) => {
    validateRef.current = validator;
  }, []);

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_configuration' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    setPromptRequired(requiresPrompt(selectedTarget));
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget(provider);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_configured',
      target: provider.id,
    });
  };

  // Handle errors from child components
  const handleError = (error: string | null) => {
    setValidationErrors(error);
    setProviderError(error);
  };

  const isProviderValid = () => {
    return selectedTarget.label && !providerError;
  };

  const getNextButtonTooltip = () => {
    if (!selectedTarget.label) {
      return 'Please enter a target label';
    }
    if (providerError) {
      return providerError;
    }
    if (validationErrors) {
      return validationErrors;
    }
    return undefined;
  };

  const handleNext = () => {
    // Enable validation when button is clicked
    setShouldValidate(true);

    // Call the validation function
    const isValid = validateRef.current?.() ?? false;

    // Only proceed if there are no errors
    if (isValid && !validationErrors) {
      onNext();
    }
  };

  return (
    <PageWrapper
      title={`Configure Target: ${selectedTarget.label || 'Unnamed Target'}`}
      description="Configure the specific settings for your target. The fields below will change based on the target type you selected."
      onNext={handleNext}
      onBack={onBack}
      nextDisabled={!isProviderValid()}
      warningMessage={isProviderValid() ? undefined : getNextButtonTooltip()}
    >
      <Stack direction="column" spacing={3}>
        {/* Validation Error Display */}
        {validationErrors && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Please fix the following issues before continuing:
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>
              {validationErrors}
            </Typography>
          </Alert>
        )}

        {/* Documentation Alert for specific providers */}
        {hasSpecificDocumentation(providerType) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="body2">
                Need help configuring {selectedTarget.label || selectedTarget.id}?{' '}
                <Link
                  href={getProviderDocumentationUrl(providerType)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View the documentation
                </Link>{' '}
                for detailed setup instructions and examples.
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Provider Configuration Section */}
        <ProviderConfigEditor
          provider={selectedTarget}
          setProvider={handleProviderChange}
          extensions={config.extensions}
          onExtensionsChange={(extensions) => updateConfig('extensions', extensions)}
          setError={handleError}
          validateAll={shouldValidate}
          onValidate={() => {
            // Validation errors will be displayed through the handleError function
          }}
          onValidationRequest={handleValidationRequest}
          providerType={providerType}
        />

        {promptRequired && <Prompts />}
      </Stack>
    </PageWrapper>
  );
}
