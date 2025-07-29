import { useEffect, useRef, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import Prompts from '../Prompts';
import ProviderConfigEditor from './ProviderConfigEditor';
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
  const theme = useTheme();
  const { config, updateConfig } = useRedTeamConfig();
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
  const [testingEnabled, setTestingEnabled] = useState(selectedTarget.id === 'http');
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
    setTestingEnabled(selectedTarget.id === 'http');
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
    <Stack direction="column" spacing={3}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Configure Target: {selectedTarget.label || 'Unnamed Target'}
        </Typography>

        <LoadExampleButton />
      </Box>

      <Typography variant="body1">
        Configure the specific settings for your target. The fields below will change based on the
        target type you selected.
      </Typography>

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
        providerType={selectedTarget.id?.split(':')[0] || 'custom'}
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

      {/* Navigation Buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: validationErrors ? 'space-between' : 'flex-end',
          mt: 4,
          width: '100%',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            ...(validationErrors && {
              width: '100%',
              justifyContent: 'space-between',
            }),
          }}
        >
          <Button
            variant="outlined"
            startIcon={<KeyboardArrowLeftIcon />}
            onClick={onBack}
            sx={{ px: 4, py: 1 }}
          >
            Back
          </Button>

          <Button
            variant="contained"
            onClick={handleNext}
            endIcon={<KeyboardArrowRightIcon />}
            disabled={!isProviderValid()}
            sx={{
              backgroundColor: theme.palette.primary.main,
              '&:hover': { backgroundColor: theme.palette.primary.dark },
              '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
              px: 4,
              py: 1,
            }}
          >
            Next
          </Button>
        </Box>
      </Box>
    </Stack>
  );
}
