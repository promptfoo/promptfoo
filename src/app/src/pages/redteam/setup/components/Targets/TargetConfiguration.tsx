import { useEffect, useRef, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
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
import TestTargetConfiguration from './TestTargetConfiguration';
import type { ProviderResponse, ProviderTestResponse } from '@promptfoo/types';

import type { ProviderOptions } from '../../types';
import type { ProviderConfigEditorRef } from './ProviderConfigEditor';

interface TargetConfigurationProps {
  onNext: () => void;
  onBack: () => void;
  setupModalOpen: boolean;
}

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

export default function TargetConfiguration({
  onNext,
  onBack,
  setupModalOpen,
}: TargetConfigurationProps) {
  const { config, updateConfig, providerType } = useRedTeamConfig();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );
  const [testingTarget, setTestingTarget] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    suggestions?: string[];
    providerResponse?: ProviderResponse;
  } | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [promptRequired, setPromptRequired] = useState(requiresPrompt(selectedTarget));
  const [testingEnabled, setTestingEnabled] = useState(providerType === 'http');
  const [validationErrors, setValidationErrors] = useState<string | null>(null);
  const [shouldValidate, setShouldValidate] = useState<boolean>(false);

  const configEditorRef = useRef<ProviderConfigEditorRef>(null);
  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_configuration' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    setPromptRequired(requiresPrompt(selectedTarget));
    setTestingEnabled(providerType === 'http');
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget(provider);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_configured',
      target: provider.id,
    });
  };

  const handleTestTarget = async () => {
    setTestingTarget(true);
    setTestResult(null);
    recordEvent('feature_used', { feature: 'redteam_config_target_test' });
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 30000);

      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(selectedTarget),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Handle PF Server Errors:
      if (!response.ok) {
        let errorMessage = 'Network response was not ok';
        try {
          const errorData = (await response.json()) as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // ignore json parsing errors
        }
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as ProviderTestResponse;

      const result = data.testResult;

      if (result.error) {
        setTestResult({
          providerResponse: data.providerResponse,
        });
      } else if (result.changes_needed) {
        setTestResult({
          success: false,
          message: result.changes_needed_reason,
          suggestions: result.changes_needed_suggestions,
          providerResponse: data.providerResponse,
        });
      } else {
        setTestResult({
          success: true,
          message: 'Target configuration is valid!',
          providerResponse: data.providerResponse,
        });
      }
    } catch (error) {
      console.error('Error testing target:', error);
      let message: string;

      if (error instanceof Error && error.name === 'AbortError') {
        message = 'Request timed out after 30 seconds';
      } else {
        message = error instanceof Error ? error.message : String(error);
      }

      setTestResult({
        success: false,
        message,
      });
    } finally {
      setTestingTarget(false);
    }
  };

  // Handle errors from child components
  const handleError = (error: string | null) => {
    setValidationErrors(error);
    setProviderError(error);
  };

  const isProviderValid = () => {
    return selectedTarget.label && !providerError;
  };

  const handleNext = () => {
    // Enable validation when button is clicked
    setShouldValidate(true);

    // Use the ref to validate
    const isValid = configEditorRef.current?.validate() ?? false;

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
          ref={configEditorRef}
          provider={selectedTarget}
          setProvider={handleProviderChange}
          extensions={config.extensions}
          onExtensionsChange={(extensions) => updateConfig('extensions', extensions)}
          opts={{
            hideErrors: false,
            disableModelSelection: false,
          }}
          setError={handleError}
          validateAll={shouldValidate}
          onValidate={(isValid) => {
            // Validation errors will be displayed through the handleError function
          }}
          providerType={providerType}
        />

        {testingEnabled && (
          <TestTargetConfiguration
            testingTarget={testingTarget}
            handleTestTarget={handleTestTarget}
            selectedTarget={selectedTarget}
            testResult={testResult}
          />
        )}

        {promptRequired && <Prompts />}
      </Stack>
    </PageWrapper>
  );
}
