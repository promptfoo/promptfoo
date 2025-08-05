import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import Box from '@mui/material/Box';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import FoundationModelConfiguration from './FoundationModelConfiguration';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';

import type { ProviderOptions } from '../../types';

export interface ProviderConfigEditorRef {
  validate: () => boolean;
}

interface ProviderConfigEditorProps {
  provider: ProviderOptions;
  setProvider: (provider: ProviderOptions) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
  opts?: {
    defaultRequestTransform?: string;
    hideErrors?: boolean;
    disableModelSelection?: boolean;
  };
  setError?: (error: string | null) => void;
  validateAll?: boolean;
  onValidate?: (isValid: boolean) => void;
  providerType?: string;
}

const ProviderConfigEditor = forwardRef<ProviderConfigEditorRef, ProviderConfigEditorProps>(
  (
    {
      provider,
      setProvider,
      extensions,
      onExtensionsChange,
      opts = {},
      setError,
      validateAll = false,
      onValidate,
      providerType,
    },
    ref,
  ) => {
    const [bodyError, setBodyError] = useState<string | null>(null);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [rawConfigJson, setRawConfigJson] = useState<string>(
      JSON.stringify(provider.config, null, 2),
    );
    const [extensionErrors, setExtensionErrors] = useState(false);

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

    const updateCustomTarget = (field: string, value: any) => {
      const updatedTarget = { ...provider } as ProviderOptions;

      if (field === 'id') {
        updatedTarget.id = value;
      } else if (field === 'url') {
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
      } else if (field === 'label') {
        updatedTarget.label = value;
      } else if (field === 'delay') {
        updatedTarget.delay = value;
      } else if (field === 'config') {
        updatedTarget.config = value;
      } else {
        updatedTarget.config[field] = value;
      }

      setProvider(updatedTarget);
    };

    const updateWebSocketTarget = (field: string, value: any) => {
      const updatedTarget = { ...provider } as ProviderOptions;
      if (field === 'url') {
        updatedTarget.config.url = value;
        if (validateUrl(value, 'websocket')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid WebSocket URL (ws:// or wss://)');
        }
      } else if (field in updatedTarget.config) {
        (updatedTarget.config as any)[field] = value;
      }
      setProvider(updatedTarget);
    };

    const validate = (): boolean => {
      const errors: string[] = [];

      if (providerType === 'http') {
        // Check if we're in raw mode (using request field) or structured mode (using url field)
        if (provider.config.request !== undefined) {
          // Raw mode: validate that request is not empty
          if (!provider.config.request || provider.config.request.trim() === '') {
            errors.push('HTTP request content is required');
          }
        } else {
          // Structured mode: validate URL
          if (!provider.config.url || !validateUrl(provider.config.url)) {
            errors.push('Valid URL is required');
          }
        }

        if (bodyError) {
          errors.push(bodyError);
        }
      } else if (providerType === 'websocket') {
        if (!provider.config.url || !validateUrl(provider.config.url, 'websocket')) {
          errors.push('Valid WebSocket URL is required');
        }
      } else if (
        [
          'openai',
          'anthropic',
          'google',
          'vertex',
          'mistral',
          'cohere',
          'groq',
          'deepseek',
          'azure',
          'openrouter',
          'perplexity',
          'cerebras',
        ].includes(providerType || '')
      ) {
        // Foundation model providers validation
        if (!provider.id || provider.id.trim() === '') {
          errors.push('Model ID is required');
        }
        // Validate that temperature is within reasonable bounds if provided
        if (
          provider.config?.temperature !== undefined &&
          (provider.config.temperature < 0 || provider.config.temperature > 2)
        ) {
          errors.push('Temperature must be between 0 and 2');
        }
        // Validate that max_tokens is positive if provided
        if (provider.config?.max_tokens !== undefined && provider.config.max_tokens <= 0) {
          errors.push('Max tokens must be greater than 0');
        }
        // Validate that top_p is between 0 and 1 if provided
        if (
          provider.config?.top_p !== undefined &&
          (provider.config.top_p < 0 || provider.config.top_p > 1)
        ) {
          errors.push('Top P must be between 0 and 1');
        }
      } else if (
        ['javascript', 'python', 'go', 'custom', 'mcp', 'exec'].includes(providerType || '')
      ) {
        // Custom providers validation
        if (!provider.id || provider.id.trim() === '') {
          errors.push('Provider ID is required');
        }
      }

      if (extensionErrors) {
        errors.push('Extension configuration has errors');
      }

      const hasErrors = errors.length > 0;
      if (setError) {
        setError(hasErrors ? errors.join(', ') : null);
      }
      if (onValidate) {
        onValidate(!hasErrors);
      }
      return !hasErrors;
    };

    useImperativeHandle(ref, () => ({
      validate,
    }));

    useEffect(() => {
      if (validateAll) {
        validate();
      }
    }, [validateAll, provider, bodyError, urlError, extensionErrors]);

    return (
      <Box>
        {providerType === 'custom' && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {providerType === 'http' && (
          <HttpEndpointConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            bodyError={bodyError}
            setBodyError={setBodyError}
            urlError={urlError}
            setUrlError={setUrlError}
            updateFullTarget={setProvider}
          />
        )}

        {providerType === 'websocket' && (
          <WebSocketEndpointConfiguration
            selectedTarget={provider}
            updateWebSocketTarget={updateWebSocketTarget}
            urlError={urlError}
          />
        )}

        {providerType === 'browser' && (
          <BrowserAutomationConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
          />
        )}

        {/* Foundation model providers */}
        {[
          'openai',
          'anthropic',
          'google',
          'vertex',
          'mistral',
          'cohere',
          'groq',
          'deepseek',
          'azure',
          'openrouter',
          'perplexity',
          'cerebras',
        ].includes(providerType || '') && (
          <FoundationModelConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            providerType={providerType || ''}
          />
        )}

        {/* Cloud and enterprise providers - use custom config for now */}
        {[
          'bedrock',
          'sagemaker',
          'databricks',
          'cloudflare-ai',
          'fireworks',
          'together',
          'replicate',
          'huggingface',
        ].includes(providerType || '') && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {/* Specialized providers - use custom config for now */}
        {['github', 'xai', 'ai21', 'aimlapi', 'hyperbolic', 'lambdalabs', 'fal', 'voyage'].includes(
          providerType || '',
        ) && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {/* Local model providers - use custom config for now */}
        {['ollama', 'vllm', 'localai', 'llamafile', 'llama.cpp', 'text-generation-webui'].includes(
          providerType || '',
        ) && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        {/* Custom providers */}
        {['javascript', 'python', 'go', 'mcp', 'exec'].includes(providerType || '') && (
          <CustomTargetConfiguration
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            rawConfigJson={rawConfigJson}
            setRawConfigJson={setRawConfigJson}
            bodyError={bodyError}
          />
        )}

        <Box sx={{ mt: 3 }}>
          <CommonConfigurationOptions
            selectedTarget={provider}
            updateCustomTarget={updateCustomTarget}
            extensions={extensions}
            onExtensionsChange={onExtensionsChange}
            onValidationChange={(hasErrors) => setExtensionErrors(hasErrors)}
          />
        </Box>
      </Box>
    );
  },
);

ProviderConfigEditor.displayName = 'ProviderConfigEditor';

export default ProviderConfigEditor;
