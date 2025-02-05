import React, { useEffect, useState } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ProviderResponse, ProviderTestResponse } from '@promptfoo/types';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import type { ProviderOptions } from '../../types';
import Prompts from '../Prompts';
import { predefinedTargets, customTargetOption } from '../constants';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import TestTargetConfiguration from './TestTargetConfiguration';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';

interface TargetsProps {
  onNext: () => void;
  onBack: () => void;
  setupModalOpen: boolean;
}

const selectOptions = [...predefinedTargets, customTargetOption];

const knownTargetIds = predefinedTargets
  .map((target) => target.value)
  .filter((value) => value !== '');

const validateUrl = (url: string, type: 'http' | 'websocket' = 'http'): boolean => {
  try {
    const parsedUrl = new URL(url);
    if (type === 'http') {
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } else if (type === 'websocket') {
      return ['ws:', 'wss:'].includes(parsedUrl.protocol);
    }
    return false;
  } catch {
    return false;
  }
};

const requiresTransformResponse = (target: ProviderOptions) => {
  return target.id === 'http' || target.id === 'websocket';
};

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

export default function Targets({ onNext, onBack, setupModalOpen }: TargetsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );
  const [useGuardrail, setUseGuardrail] = useState(
    config.defaultTest?.assert?.some((a) => a.type === 'guardrails') ?? false,
  );
  const [testingTarget, setTestingTarget] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    suggestions?: string[];
    providerResponse?: ProviderResponse;
  } | null>(null);
  const [hasTestedTarget, setHasTestedTarget] = useState(false);
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

  useEffect(() => {
    const updatedTarget = { ...selectedTarget };

    if (useGuardrail) {
      const defaultTestConfig = {
        assert: [
          {
            type: 'guardrails',
            config: {
              purpose: 'redteam',
            },
          },
        ],
      };
      updateConfig('defaultTest', defaultTestConfig);
    } else {
      updateConfig('defaultTest', undefined);
    }

    updateConfig('target', updatedTarget);
    const missingFields: string[] = [];

    if (selectedTarget.label) {
      // Label is valid
    } else {
      missingFields.push('Target Name');
    }

    if (selectedTarget.id.startsWith('http')) {
      if (selectedTarget.config.request) {
        // Skip URL validation for raw request mode
      } else if (!selectedTarget.config.url || !validateUrl(selectedTarget.config.url)) {
        missingFields.push('URL');
      }
    }

    setMissingFields(missingFields);
    setPromptRequired(requiresPrompt(selectedTarget));
  }, [selectedTarget, useGuardrail, updateConfig]);

  const handleTargetChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value as string;
    const currentLabel = selectedTarget.label;
    recordEvent('feature_used', { feature: 'redteam_config_target_changed', target: value });

    if (value === 'custom') {
      setSelectedTarget({
        id: '',
        label: currentLabel,
        config: { temperature: 0.5 },
      });
      setRawConfigJson(JSON.stringify({ temperature: 0.5 }, null, 2));
    } else if (value === 'javascript' || value === 'python') {
      const filePath =
        value === 'javascript'
          ? 'file://path/to/custom_provider.js'
          : 'file://path/to/custom_provider.py';
      setSelectedTarget({
        id: filePath,
        config: {},
        label: currentLabel,
      });
    } else if (value === 'http') {
      setSelectedTarget({
        ...DEFAULT_HTTP_TARGET,
        label: currentLabel,
      });
      updateConfig('purpose', '');
    } else if (value === 'websocket') {
      setSelectedTarget({
        id: 'websocket',
        label: currentLabel,
        config: {
          type: 'websocket',
          url: 'wss://example.com/ws',
          messageTemplate: '{"message": "{{prompt}}"}',
          transformResponse: 'response.message',
          timeoutMs: 30000,
        },
      });
      updateConfig('purpose', '');
    } else if (value === 'browser') {
      setSelectedTarget({
        id: 'browser',
        label: currentLabel,
        config: {
          steps: [
            {
              action: 'navigate',
              args: { url: 'https://example.com' },
            },
          ],
        },
      });
    } else {
      setSelectedTarget({
        id: value,
        config: {},
        label: currentLabel,
      });
    }
  };

  useEffect(() => {
    setTestingEnabled(selectedTarget.id === 'http');
  }, [selectedTarget]);

  const updateCustomTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;

      if (field === 'url') {
        updatedTarget.config.url = value;
        if (validateUrl(value)) {
          setUrlError(null);
        } else {
          setUrlError('Invalid URL format');
        }
      } else if (field === 'method') {
        updatedTarget.config.method = value;
      } else if (field === 'body') {
        updatedTarget.config.body = value;
        const bodyStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (bodyStr.includes('{{prompt}}')) {
          setBodyError(null);
        } else if (!updatedTarget.config.request) {
          setBodyError('Request body must contain {{prompt}}');
        }
      } else if (field === 'request') {
        updatedTarget.config.request = value;
        if (value && !value.includes('{{prompt}}')) {
          setBodyError('Raw request must contain {{prompt}} template variable');
        } else {
          setBodyError(null);
        }
      } else if (field === 'transformResponse') {
        updatedTarget.config.transformResponse = value;
        // Check if the transform response includes guardrails
        const hasGuardrails =
          value.includes('guardrails:') ||
          value.includes('"guardrails"') ||
          value.includes("'guardrails'");
        setUseGuardrail(hasGuardrails);
        if (hasGuardrails) {
          const defaultTestConfig = {
            assert: [
              {
                type: 'guardrails',
                config: {
                  purpose: 'redteam',
                },
              },
            ],
          };
          updateConfig('defaultTest', defaultTestConfig);
        } else {
          updateConfig('defaultTest', undefined);
        }
      } else if (field === 'label') {
        updatedTarget.label = value;
      } else if (field === 'delay') {
        updatedTarget.delay = value;
      } else {
        updatedTarget.config[field] = value;
      }

      setSelectedTarget(updatedTarget);
      updateConfig('target', updatedTarget);
    }
  };

  const updateWebSocketTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;
      if (field === 'id') {
        updatedTarget.id = value;
        if (validateUrl(value, 'websocket')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid WebSocket URL (ws:// or wss://)');
        }
      } else if (field in updatedTarget.config) {
        (updatedTarget.config as any)[field] = value;
      }
      setSelectedTarget(updatedTarget);
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
        body: JSON.stringify(selectedTarget),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
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
        setHasTestedTarget(true);
      }
    } catch (error) {
      console.error('Error testing target:', error);
      setTestResult({
        success: false,
        message: 'An error occurred while testing the target.',
      });
    } finally {
      setTestingTarget(false);
    }
  };

  return (
    <Stack direction="column" spacing={3}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Select Red Team Target
      </Typography>

      <Typography variant="body1">
        A target is the specific LLM or endpoint you want to evaluate in your red teaming process.
        In Promptfoo targets are also known as providers. You can configure additional targets
        later.
      </Typography>

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
          required
          autoFocus
          InputLabelProps={{
            shrink: true,
          }}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mb: 5 }}>
          The target name will be used to report vulnerabilities. Make sure it's meaningful and
          re-use it when generating new redteam configs for the same target. Eg:
          'customer-service-agent', 'compliance-bot'
        </Typography>

        {(selectedTarget.id.startsWith('javascript') || selectedTarget.id.startsWith('python')) && (
          <TextField
            fullWidth
            label="Custom Target"
            value={selectedTarget.id}
            onChange={(e) => updateCustomTarget('id', e.target.value)}
            margin="normal"
          />
        )}
        {selectedTarget.id.startsWith('file://') && (
          <>
            {selectedTarget.id.endsWith('.js') && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                Learn how to set up a custom JavaScript provider{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/custom-api/"
                  target="_blank"
                  rel="noopener"
                >
                  here
                </Link>
                .
              </Typography>
            )}
            {selectedTarget.id.endsWith('.py') && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                Learn how to set up a custom Python provider{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/python/"
                  target="_blank"
                  rel="noopener"
                >
                  here
                </Link>
                .
              </Typography>
            )}
          </>
        )}
        {(selectedTarget.id === 'custom' || !knownTargetIds.includes(selectedTarget.id)) && (
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
            updateWebSocketTarget={updateWebSocketTarget}
            urlError={urlError}
          />
        )}

        {selectedTarget.id.startsWith('browser') && (
          <BrowserAutomationConfiguration
            selectedTarget={selectedTarget}
            updateCustomTarget={updateCustomTarget}
          />
        )}
      </Box>

      {testingEnabled && (
        <TestTargetConfiguration
          testingTarget={testingTarget}
          handleTestTarget={handleTestTarget}
          selectedTarget={selectedTarget}
          testResult={testResult}
          requiresTransformResponse={requiresTransformResponse}
          updateCustomTarget={updateCustomTarget}
          hasTestedTarget={hasTestedTarget}
        />
      )}

      {promptRequired && <Prompts />}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          mt: 4,
          width: '100%',
          position: 'relative',
        }}
      >
        {missingFields.length > 0 && (
          <Alert
            severity="error"
            sx={{
              flexGrow: 1,
              mr: 2,
              '& .MuiAlert-message': {
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography variant="body2">
              Missing required fields: {missingFields.join(', ')}
            </Typography>
          </Alert>
        )}
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
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={missingFields.length > 0}
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
    </Stack>
  );
}
