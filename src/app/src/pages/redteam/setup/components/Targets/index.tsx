import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
import Prompts from '../Prompts';
import ProviderEditor from './ProviderEditor';
import TestTargetConfiguration from './TestTargetConfiguration';
import type { ProviderResponse, ProviderTestResponse } from '@promptfoo/types';

import type { ProviderOptions } from '../../types';

interface TargetsProps {
  onNext?: () => void;
  onBack?: () => void;
  setupModalOpen?: boolean;
}

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

export default function Targets({ onNext, onBack, setupModalOpen }: TargetsProps) {
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

  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_targets' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    setPromptRequired(requiresPrompt(selectedTarget));
    setTestingEnabled(selectedTarget.id === 'http');
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget(provider);
    recordEvent('feature_used', { feature: 'redteam_config_target_changed', target: provider.id });
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

  const isProviderValid = () => {
    return selectedTarget.label && !providerError;
  };

  return (
    <PageWrapper
      title="Target Configuration"
      description={
        <>
          <Typography variant="body1" sx={{ mb: 2 }}>
            A target is the specific LLM or endpoint you want to evaluate in your red teaming
            process. In Promptfoo targets are also known as providers. You can configure additional
            targets later.
          </Typography>
          <Typography variant="body1">
            For more information on available providers and how to configure them, please visit our{' '}
            <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
              provider documentation
            </Link>
            .
          </Typography>
        </>
      }
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!selectedTarget.label}
    >
      <Stack direction="column" spacing={3}>
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            Select Red Team Target
          </Typography>

          <LoadExampleButton />
        </Box>

        <ProviderEditor
          provider={selectedTarget}
          setProvider={handleProviderChange}
          extensions={config.extensions}
          onExtensionsChange={(extensions) => updateConfig('extensions', extensions)}
          onBack={onBack}
          onActionButtonClick={isProviderValid() ? onNext : undefined}
          opts={{
            disableTitle: true,
            actionButtonText: 'Next',
          }}
          setError={setProviderError}
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
