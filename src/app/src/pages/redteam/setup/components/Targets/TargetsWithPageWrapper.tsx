import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { customTargetOption, predefinedTargets } from '../constants';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
import Prompts from '../Prompts';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import TestTargetConfiguration from './TestTargetConfiguration';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { ProviderResponse, ProviderTestResponse } from '@promptfoo/types';

import type { ProviderOptions } from '../../types';

interface TargetsProps {
  onNext: () => void;
  onBack: () => void;
  setupModalOpen: boolean;
}

const selectOptions = [...predefinedTargets, customTargetOption];

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

export default function TargetsWithPageWrapper({ onNext, onBack, setupModalOpen }: TargetsProps) {
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

  const [bodyError, setBodyError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [promptRequired, setPromptRequired] = useState(requiresPrompt(selectedTarget));
  const [testingEnabled, setTestingEnabled] = useState(selectedTarget.id === 'http');

  const { recordEvent } = useTelemetry();
  const [rawConfigJson, setRawConfigJson] = useState<string>(
    JSON.stringify(selectedTarget.config, null, 2),
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_targets' });
  }, []);

  // Similar logic as original component...
  // (Abbreviated for brevity - would include all the other hooks and functions)

  const handleTargetChange = (event: SelectChangeEvent) => {
    const targetId = event.target.value;
    const targetOption = selectOptions.find((option) => option.value === targetId);
    const newTarget = {
      id: targetId,
      label: targetOption?.label || targetId,
      config: {},
    };
    setSelectedTarget(newTarget);
    setPromptRequired(requiresPrompt(newTarget));
    setTestingEnabled(newTarget.id === 'http');
  };

  const updateCustomTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;

      if (field === 'label') {
        updatedTarget.label = value;
      } else if (field === 'delay') {
        updatedTarget.delay = value;
      } else if (field === 'config') {
        updatedTarget.config = value;
      } else {
        updatedTarget.config[field] = value;
      }

      setSelectedTarget(updatedTarget);
      updateConfig('target', updatedTarget);
    }
  };

  const handleTestTarget = async () => {
    setTestingTarget(true);
    setTestResult(null);
    recordEvent('feature_used', { feature: 'redteam_config_target_test' });

    try {
      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: selectedTarget,
          prompt: 'Hello, world!',
        }),
      });

      const result: ProviderTestResponse = await response.json();

      setTestResult({
        success: (result as any).success,
        message: (result as any).message,
        suggestions: (result as any).suggestions,
        providerResponse: (result as any).providerResponse,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setTestingTarget(false);
    }
  };

  return (
    <PageWrapper
      title="Select Red Team Target"
      description="A target is the specific LLM or endpoint you want to evaluate in your red teaming process. In Promptfoo targets are also known as providers. You can configure additional targets later."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={missingFields.length > 0}
    >
      <Stack direction="column" spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <LoadExampleButton />
        </Box>

        <Typography variant="body1">
          For more information on available providers and how to configure them, please visit our{' '}
          <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
            provider documentation
          </Link>
          .
        </Typography>

        <Box mb={4}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium', mb: 3 }}>
            Select a Target
          </Typography>
          <Box sx={{ mt: 2, mb: 2 }}>
            <FormControl fullWidth>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1 }}>
                  <InputLabel id="predefined-target-label">Target Type</InputLabel>
                  <Select
                    labelId="predefined-target-label"
                    value={selectedTarget.id}
                    onChange={handleTargetChange}
                    label="Target Type"
                    fullWidth
                  >
                    {selectOptions.map((target) => (
                      <MenuItem key={target.value} value={target.value}>
                        {target.label}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              </Box>
            </FormControl>
          </Box>

          <TextField
            fullWidth
            sx={{ mb: 2 }}
            label="Target Name"
            value={selectedTarget.label}
            placeholder="e.g. 'customer-service-agent'"
            onChange={(e) => updateCustomTarget('label', e.target.value)}
            margin="normal"
            helperText="A descriptive name for your target"
          />
        </Box>

        {/* Configuration components based on target type */}
        {selectedTarget.id === 'custom' && (
          <CustomTargetConfiguration
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {selectedTarget.id.startsWith('http') && (
          <HttpEndpointConfiguration
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
            bodyError={bodyError}
            setBodyError={setBodyError}
            urlError={urlError}
            setUrlError={setUrlError}
            updateFullTarget={setSelectedTarget}
          />
        )}

        {selectedTarget.id.startsWith('websocket') && (
          <WebSocketEndpointConfiguration
            selectedTarget={selectedTarget}
            updateWebSocketTarget={(field, value) => updateCustomTarget(field, value)}
            urlError={urlError}
          />
        )}

        {selectedTarget.id.startsWith('browser') && (
          <BrowserAutomationConfiguration
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        )}

        <Typography variant="h6" gutterBottom>
          Additional Configuration
        </Typography>
        <CommonConfigurationOptions
          selectedTarget={selectedTarget}
          updateCustomTarget={updateCustomTarget}
          extensions={config.extensions}
          onExtensionsChange={(extensions) => updateConfig('extensions', extensions)}
          onValidationChange={(hasErrors) => {
            setMissingFields((prev) =>
              hasErrors
                ? [...prev.filter((f) => f !== 'Extensions'), 'Extensions']
                : prev.filter((f) => f !== 'Extensions'),
            );
          }}
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

        {/* Show validation errors if any */}
        {missingFields.length > 0 && (
          <Alert severity="error">
            <Typography variant="body2">
              Missing required fields: {missingFields.join(', ')}
            </Typography>
          </Alert>
        )}
      </Stack>
    </PageWrapper>
  );
}
