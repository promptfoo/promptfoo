import React, { useState, useEffect } from 'react';
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
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import type { ProviderOptions } from '../../types';
import Prompts from '../Prompts';
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

const predefinedTargets = [
  { value: '', label: 'Select a target' },
  { value: 'http', label: 'HTTP/HTTPS Endpoint' },
  { value: 'websocket', label: 'WebSocket Endpoint' },
  { value: 'browser', label: 'Web Browser Automation' },
  { value: 'openai:gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai:gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'claude-3-5-sonnet-latest', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'vertex:gemini-pro', label: 'Google Vertex AI Gemini Pro' },
];

const customTargetOption = { value: 'custom', label: 'Custom Target' };

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

const EXAMPLE_TARGET: ProviderOptions = {
  id: 'http',
  label: 'Acme Chatbot',
  config: {
    url: 'https://acme-cx-chatbot.promptfoo.dev/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      messages: [
        {
          role: 'user',
          content: '{{prompt}}',
        },
      ],
    },
    transformResponse: 'json.response',
  },
};

export default function Targets({ onNext, onBack, setupModalOpen }: TargetsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const selectedTarget = config.target || DEFAULT_HTTP_TARGET;
  const setSelectedTarget = (value: ProviderOptions) => {
    updateConfig('target', value);
  };
  const [promptRequired, setPromptRequired] = useState(requiresPrompt(selectedTarget));
  const [urlError, setUrlError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [testingTarget, setTestingTarget] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    suggestions?: string[];
    providerResponse?: {
      raw: string;
      output: string;
      sessionId?: string;
      metadata?: {
        headers?: Record<string, string>;
      };
    };
  } | null>(null);
  const [testingEnabled, setTestingEnabled] = useState(selectedTarget.id === 'http');
  const [isJsonContentType, setIsJsonContentType] = useState(
    selectedTarget.config.headers &&
      selectedTarget.config.headers['Content-Type'] === 'application/json',
  );
  const [requestBody, setRequestBody] = useState(selectedTarget.config.body);

  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hasTestedTarget, setHasTestedTarget] = useState(false);

  const { recordEvent } = useTelemetry();

  const [rawConfigJson, setRawConfigJson] = useState<string>(
    JSON.stringify(selectedTarget.config, null, 2),
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_targets' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    const missingFields: string[] = [];

    if (!selectedTarget.label) {
      missingFields.push('Target Name');
    }

    // Make sure we have a url target is a valid HTTP or WebSocket endpoint
    if (
      (selectedTarget.id.startsWith('http') || selectedTarget.id.startsWith('websocket')) &&
      (!selectedTarget.config.url || !validateUrl(selectedTarget.config.url))
    ) {
      missingFields.push('URL');
    }

    setMissingFields(missingFields);
    setPromptRequired(requiresPrompt(selectedTarget));
  }, [selectedTarget, updateConfig]);

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

    const hasJsonContentType = Object.keys(selectedTarget.config.headers || {}).some(
      (header) =>
        header.toLowerCase() === 'content-type' &&
        selectedTarget.config.headers?.[header].toLowerCase().includes('application/json'),
    );

    setIsJsonContentType(hasJsonContentType);
  }, [selectedTarget]);

  const updateCustomTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;
      if (field === 'id') {
        updatedTarget.id = value;
        if (validateUrl(value, 'http')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid HTTP URL (http:// or https://)');
        }
      } else if (field === 'body') {
        updatedTarget.config.body = value;
        setBodyError(null);
        if (isJsonContentType) {
          try {
            const parsedBody = JSON.parse(value.trim());
            updatedTarget.config.body = parsedBody;
            setBodyError(null);
          } catch {
            setBodyError('Invalid JSON');
          }
        }
        if (!value.includes('{{prompt}}')) {
          setBodyError('Request body must contain {{prompt}}');
        }
      } else if (field === 'label') {
        updatedTarget.label = value;
      } else {
        (updatedTarget.config as any)[field] = value;
      }

      setSelectedTarget(updatedTarget);
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

  const updateHeaderKey = (index: number, newKey: string) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const oldKey = Object.keys(updatedHeaders)[index];
      const value = updatedHeaders[oldKey];
      delete updatedHeaders[oldKey];
      updatedHeaders[newKey] = value;
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const updateHeaderValue = (index: number, newValue: string) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const key = Object.keys(updatedHeaders)[index];
      updatedHeaders[key] = newValue;
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const addHeader = () => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers, '': '' };
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const removeHeader = (index: number) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const key = Object.keys(updatedHeaders)[index];
      delete updatedHeaders[key];
      updateCustomTarget('headers', updatedHeaders);
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

      const data = await response.json();
      const result = data.test_result;

      if (result.error) {
        setTestResult({
          success: false,
          message: result.error,
          providerResponse: data.provider_response,
        });
      } else if (result.changes_needed) {
        setTestResult({
          success: false,
          message: result.changes_needed_reason,
          suggestions: result.changes_needed_suggestions,
          providerResponse: data.provider_response,
        });
      } else {
        setTestResult({
          success: true,
          message: 'Target configuration is valid!',
          providerResponse: data.provider_response,
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

  const handleTryExample = () => {
    setSelectedTarget(EXAMPLE_TARGET);
    setRequestBody(EXAMPLE_TARGET.config.body);
    setIsJsonContentType(true);
    recordEvent('feature_used', { feature: 'redteam_config_try_example' });
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
            <Button
              variant="outlined"
              onClick={handleTryExample}
              sx={{
                height: '56px',
                mt: 0,
              }}
            >
              Try Example
            </Button>
          </Box>
        </FormControl>
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
            updateHeaderKey={updateHeaderKey}
            updateHeaderValue={updateHeaderValue}
            addHeader={addHeader}
            removeHeader={removeHeader}
            requestBody={requestBody || ''}
            setRequestBody={setRequestBody}
            bodyError={bodyError}
            urlError={urlError}
            isJsonContentType={isJsonContentType || false}
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
          alignItems: 'center',
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
          sx={{
            px: 4,
            py: 1,
          }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={missingFields.length > 0 /*|| (testingEnabled && !hasTestedTarget)*/}
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
            px: 4,
            py: 1,
            minWidth: '150px',
            ml: 2,
          }}
        >
          Next
        </Button>
      </Box>
    </Stack>
  );
}
