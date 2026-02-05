import { useCallback, useEffect, useState } from 'react';

import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import AgentFrameworkConfiguration from './AgentFrameworkConfiguration';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import { AGENT_FRAMEWORKS } from './consts';
import FoundationModelConfiguration from './FoundationModelConfiguration';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';

import type { ProviderOptions } from '../../types';

interface ProviderConfigEditorProps {
  provider: ProviderOptions;
  setProvider: (provider: ProviderOptions) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
  setError?: (error: string | null) => void;
  validateAll?: boolean;
  onValidate?: (isValid: boolean) => void;
  onValidationRequest?: (validator: () => boolean) => void;
  providerType?: string;
  onTargetTested?: (success: boolean) => void;
  onSessionTested?: (success: boolean) => void;
}

function ProviderConfigEditor({
  provider,
  setProvider,
  extensions,
  onExtensionsChange,
  setError,
  validateAll = false,
  onValidate,
  onValidationRequest,
  providerType,
  onTargetTested,
  onSessionTested,
}: ProviderConfigEditorProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const [bodyError, setBodyError] = useState<string | React.ReactNode | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [rawConfigJson, setRawConfigJson] = useState<string>(
    JSON.stringify(provider.config, null, 2),
  );
  const [extensionErrors, setExtensionErrors] = useState(false);

  const validateUrl = useCallback((url: string, type: 'http' | 'websocket' = 'http'): boolean => {
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
  }, []);

  const updateCustomTarget = (field: string, value: unknown) => {
    const updatedTarget = { ...provider } as ProviderOptions;

    if (field === 'id') {
      updatedTarget.id = value as string;
    } else if (field === 'url') {
      updatedTarget.config.url = value as string;
      if (validateUrl(value as string)) {
        setUrlError(null);
      } else {
        setUrlError('Invalid URL format');
      }
    } else if (field === 'method') {
      updatedTarget.config.method = value as string;
    } else if (field === 'body') {
      updatedTarget.config.body =
        typeof value === 'string' || (typeof value === 'object' && value !== null)
          ? value
          : String(value);
      const bodyStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;
      if (bodyStr.includes('{{prompt}}') || hasInputs) {
        setBodyError(null);
      } else if (!updatedTarget.config.request) {
        setBodyError(
          <>
            Request body must contain <code>{'{{prompt}}'}</code> - this is where promptfoo will
            inject the attack payload. Replace the user input value with <code>{'{{prompt}}'}</code>
            . Promptfoo uses Nunjucks templating to replace <code>{'{{prompt}}'}</code> with the
            actual test content.{' '}
            <a
              href="https://www.promptfoo.dev/docs/configuration/guide/#using-nunjucks-templates"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </>,
        );
      }
    } else if (field === 'request') {
      updatedTarget.config.request = value as string;
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;
      if (value && typeof value === 'string' && !value.includes('{{prompt}}') && !hasInputs) {
        setBodyError('Raw request must contain {{prompt}} template variable');
      } else {
        setBodyError(null);
      }
    } else if (field === 'transformResponse') {
      updatedTarget.config.transformResponse = value as string;
    } else if (field === 'label') {
      updatedTarget.label = value as string;
    } else if (field === 'delay') {
      updatedTarget.delay = value as number;
    } else if (field === 'config') {
      updatedTarget.config = value as typeof updatedTarget.config;
    } else if (field === 'inputs') {
      // Handle top-level inputs field for multi-variable input configuration
      if (value === undefined) {
        delete updatedTarget.inputs;
      } else {
        updatedTarget.inputs = value as Record<string, string>;
        // Clear body error if inputs are provided ({{prompt}} not required with multi-input)
        if (Object.keys(value as Record<string, string>).length > 0) {
          setBodyError(null);
        }
      }
    } else {
      updatedTarget.config[field] = value;
    }

    setProvider(updatedTarget);
  };

  const updateWebSocketTarget = (field: string, value: unknown) => {
    const updatedTarget = { ...provider } as ProviderOptions;
    if (field === 'url') {
      updatedTarget.config.url = value as string;
      if (validateUrl(value as string, 'websocket')) {
        setUrlError(null);
      } else {
        setUrlError('Please enter a valid WebSocket URL (ws:// or wss://)');
      }
    } else if (
      field in updatedTarget.config ||
      field === 'streamResponse' ||
      field === 'transformResponse'
    ) {
      (updatedTarget.config as Record<string, unknown>)[field] = value;
    } else if (field === 'label') {
      updatedTarget.label = value as string;
    }
    setProvider(updatedTarget);
  };

  const validate = useCallback((): boolean => {
    const errors: (string | React.ReactNode)[] = [];

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
    } else if (AGENT_FRAMEWORKS.includes(providerType || '')) {
      // Agent frameworks validation
      if (!provider.id || provider.id.trim() === '') {
        errors.push('Python file path is required');
      } else if (!provider.id.startsWith('file://')) {
        errors.push('Provider ID must start with file:// for Python agent files');
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
      const stringErrors = errors.filter((e): e is string => typeof e === 'string');
      setError(hasErrors ? stringErrors.join(', ') || 'Validation failed' : null);
    }
    if (onValidate) {
      onValidate(!hasErrors);
    }
    return !hasErrors;
  }, [providerType, provider, bodyError, extensionErrors, setError, onValidate, validateUrl]);

  useEffect(() => {
    if (validateAll) {
      validate();
    }
  }, [validateAll, validate]);

  // Expose the validate function to parent via callback
  useEffect(() => {
    if (onValidationRequest) {
      onValidationRequest(validate);
    }
  }, [onValidationRequest, validate]);

  return (
    <div>
      {providerType === 'custom' && (
        <CustomTargetConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={setRawConfigJson}
          bodyError={bodyError}
          providerType={providerType}
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
          onTargetTested={onTargetTested}
          onSessionTested={onSessionTested}
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
          providerType={providerType}
        />
      )}

      {/* Specialized providers - use custom config for now */}
      {['github', 'xai', 'ai21', 'aimlapi', 'hyperbolic', 'fal', 'voyage'].includes(
        providerType || '',
      ) && (
        <CustomTargetConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={setRawConfigJson}
          bodyError={bodyError}
          providerType={providerType}
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
          providerType={providerType}
        />
      )}

      {/* Agent frameworks */}
      {AGENT_FRAMEWORKS.includes(providerType || '') && (
        <AgentFrameworkConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          agentType={providerType || ''}
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
          providerType={providerType}
        />
      )}

      <div className="mt-6">
        <CommonConfigurationOptions
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          extensions={extensions}
          onExtensionsChange={onExtensionsChange}
          onValidationChange={(hasErrors) => setExtensionErrors(hasErrors)}
          testGenerationInstructions={config.testGenerationInstructions ?? ''}
          onTestGenerationInstructionsChange={(instructions) =>
            updateConfig('testGenerationInstructions', instructions)
          }
          onPromptsChange={(prompts) => updateConfig('prompts', prompts)}
        />
      </div>
    </div>
  );
}

export default ProviderConfigEditor;
