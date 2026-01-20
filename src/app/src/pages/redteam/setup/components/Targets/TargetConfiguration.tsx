import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { AlertTriangle, Info } from 'lucide-react';
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
      <div className="flex flex-col gap-6">
        {/* Validation Error Display */}
        {validationErrors && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertContent>
              <AlertDescription>
                <p className="text-sm">Please fix the following issues before continuing:</p>
                <p className="mt-2 text-sm font-medium">{validationErrors}</p>
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {/* Documentation Alert for specific providers */}
        {hasSpecificDocumentation(providerType) && (
          <Alert variant="info">
            <Info className="size-4" />
            <AlertContent>
              <AlertDescription>
                Need help configuring {selectedTarget.label || selectedTarget.id}?{' '}
                <a
                  href={getProviderDocumentationUrl(providerType)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View the documentation
                </a>{' '}
                for detailed setup instructions and examples.
              </AlertDescription>
            </AlertContent>
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
      </div>
    </PageWrapper>
  );
}
