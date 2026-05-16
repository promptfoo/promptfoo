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

export interface ProviderConfigEditorProps {
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
  /** Set to 'eval' to hide red-team-specific options like Test Generation */
  mode?: 'eval' | 'redteam';
}

const shouldRemoveMcpConfig = (
  previousTargetId: string,
  nextTargetId: string,
  currentProviderType?: string,
): boolean =>
  currentProviderType === 'bedrock' &&
  previousTargetId.startsWith('bedrock:converse:') &&
  !nextTargetId.startsWith('bedrock:converse:');

const FOUNDATION_PROVIDER_TYPES = new Set([
  'openai',
  'anthropic',
  'google',
  'vertex',
  'mistral',
  'cohere',
  'groq',
  'deepseek',
  'azure',
  'bedrock',
  'openrouter',
  'perplexity',
  'cerebras',
]);

const CUSTOM_PROVIDER_TYPES = new Set(['javascript', 'python', 'go', 'custom', 'mcp', 'exec']);

function cloneProvider(provider: ProviderOptions): ProviderOptions {
  return {
    ...provider,
    config: { ...(provider.config ?? {}) },
  } as ProviderOptions;
}

function getPromptTemplateError(): React.ReactNode {
  return (
    <>
      Request body must contain <code>{'{{prompt}}'}</code> - this is where promptfoo will inject
      the attack payload. Replace the user input value with <code>{'{{prompt}}'}</code>. Promptfoo
      uses Nunjucks templating to replace <code>{'{{prompt}}'}</code> with the actual test content.{' '}
      <a
        href="https://www.promptfoo.dev/docs/configuration/guide/#using-nunjucks-templates"
        target="_blank"
        rel="noopener noreferrer"
      >
        Learn more
      </a>
    </>
  );
}

function providerHasInputs(provider: ProviderOptions): boolean {
  return Boolean(provider.inputs && Object.keys(provider.inputs).length > 0);
}

function applyProviderIdUpdate(
  updatedTarget: ProviderOptions,
  provider: ProviderOptions,
  providerType: string | undefined,
  value: unknown,
): void {
  updatedTarget.id = value as string;
  if (shouldRemoveMcpConfig(provider.id, updatedTarget.id, providerType)) {
    delete updatedTarget.config.mcp;
  }
}

function applyProviderUrlUpdate(
  updatedTarget: ProviderOptions,
  value: unknown,
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean,
  setUrlError: (error: string | null) => void,
): void {
  const url = value as string;
  updatedTarget.config.url = url;
  setUrlError(validateUrl(url) ? null : 'Invalid URL format');
}

function applyProviderBodyUpdate(
  updatedTarget: ProviderOptions,
  value: unknown,
  setBodyError: (error: string | React.ReactNode | null) => void,
): void {
  updatedTarget.config.body =
    typeof value === 'string' || (typeof value === 'object' && value !== null)
      ? value
      : String(value);

  const bodyStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (bodyStr.includes('{{prompt}}') || providerHasInputs(updatedTarget)) {
    setBodyError(null);
    return;
  }
  if (!updatedTarget.config.request) {
    setBodyError(getPromptTemplateError());
  }
}

function applyProviderRequestUpdate(
  updatedTarget: ProviderOptions,
  value: unknown,
  setBodyError: (error: string | React.ReactNode | null) => void,
): void {
  updatedTarget.config.request = value as string;
  if (
    value &&
    typeof value === 'string' &&
    !value.includes('{{prompt}}') &&
    !providerHasInputs(updatedTarget)
  ) {
    setBodyError('Raw request must contain {{prompt}} template variable');
    return;
  }
  setBodyError(null);
}

function applyProviderInputsUpdate(
  updatedTarget: ProviderOptions,
  value: unknown,
  setBodyError: (error: string | React.ReactNode | null) => void,
): void {
  if (value === undefined) {
    delete updatedTarget.inputs;
    return;
  }

  updatedTarget.inputs = value as NonNullable<ProviderOptions['inputs']>;
  if (Object.keys(updatedTarget.inputs).length > 0) {
    setBodyError(null);
  }
}

function updateProviderField({
  provider,
  providerType,
  field,
  value,
  validateUrl,
  setBodyError,
  setUrlError,
}: {
  provider: ProviderOptions;
  providerType?: string;
  field: string;
  value: unknown;
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean;
  setBodyError: (error: string | React.ReactNode | null) => void;
  setUrlError: (error: string | null) => void;
}): ProviderOptions {
  const updatedTarget = cloneProvider(provider);

  switch (field) {
    case 'id':
      applyProviderIdUpdate(updatedTarget, provider, providerType, value);
      break;
    case 'url':
      applyProviderUrlUpdate(updatedTarget, value, validateUrl, setUrlError);
      break;
    case 'method':
      updatedTarget.config.method = value as string;
      break;
    case 'body':
      applyProviderBodyUpdate(updatedTarget, value, setBodyError);
      break;
    case 'request':
      applyProviderRequestUpdate(updatedTarget, value, setBodyError);
      break;
    case 'transformResponse':
      updatedTarget.config.transformResponse = value as string;
      break;
    case 'label':
      updatedTarget.label = value as string;
      break;
    case 'delay':
      updatedTarget.delay = value as number;
      break;
    case 'config':
      updatedTarget.config = value as typeof updatedTarget.config;
      break;
    case 'inputs':
      applyProviderInputsUpdate(updatedTarget, value, setBodyError);
      break;
    default:
      updatedTarget.config[field] = value;
      break;
  }

  return updatedTarget;
}

function validateHttpProvider(
  provider: ProviderOptions,
  bodyError: string | React.ReactNode | null,
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean,
): Array<string | React.ReactNode> {
  const errors: Array<string | React.ReactNode> = [];
  if (provider.config.request === undefined) {
    if (!provider.config.url || !validateUrl(provider.config.url)) {
      errors.push('Valid URL is required');
    }
  } else if (!provider.config.request || provider.config.request.trim() === '') {
    errors.push('HTTP request content is required');
  }
  if (bodyError) {
    errors.push(bodyError);
  }
  return errors;
}

function validateFoundationProvider(provider: ProviderOptions): string[] {
  const errors: string[] = [];
  if (!provider.id || provider.id.trim() === '') {
    errors.push('Model ID is required');
  }
  if (
    provider.config?.temperature !== undefined &&
    (provider.config.temperature < 0 || provider.config.temperature > 2)
  ) {
    errors.push('Temperature must be between 0 and 2');
  }
  if (provider.config?.max_tokens !== undefined && provider.config.max_tokens <= 0) {
    errors.push('Max tokens must be greater than 0');
  }
  if (
    provider.config?.top_p !== undefined &&
    (provider.config.top_p < 0 || provider.config.top_p > 1)
  ) {
    errors.push('Top P must be between 0 and 1');
  }
  return errors;
}

function validateAgentFrameworkProvider(provider: ProviderOptions): string[] {
  if (!provider.id || provider.id.trim() === '') {
    return ['Python file path is required'];
  }
  if (!provider.id.startsWith('file://')) {
    return ['Provider ID must start with file:// for Python agent files'];
  }
  return [];
}

function validateCustomProvider(provider: ProviderOptions): string[] {
  return !provider.id || provider.id.trim() === '' ? ['Provider ID is required'] : [];
}

function collectValidationErrors({
  provider,
  providerType,
  bodyError,
  extensionErrors,
  validateUrl,
}: {
  provider: ProviderOptions;
  providerType?: string;
  bodyError: string | React.ReactNode | null;
  extensionErrors: boolean;
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean;
}): Array<string | React.ReactNode> {
  let errors: Array<string | React.ReactNode> = [];

  if (providerType === 'http') {
    errors = validateHttpProvider(provider, bodyError, validateUrl);
  } else if (providerType === 'websocket') {
    errors =
      !provider.config.url || !validateUrl(provider.config.url, 'websocket')
        ? ['Valid WebSocket URL is required']
        : [];
  } else if (FOUNDATION_PROVIDER_TYPES.has(providerType || '')) {
    errors = validateFoundationProvider(provider);
  } else if (AGENT_FRAMEWORKS.includes(providerType || '')) {
    errors = validateAgentFrameworkProvider(provider);
  } else if (CUSTOM_PROVIDER_TYPES.has(providerType || '')) {
    errors = validateCustomProvider(provider);
  }

  if (extensionErrors) {
    errors.push('Extension configuration has errors');
  }
  return errors;
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
  mode = 'redteam',
}: ProviderConfigEditorProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const isRedTeam = mode === 'redteam';
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
    setProvider(
      updateProviderField({
        provider,
        providerType,
        field,
        value,
        validateUrl,
        setBodyError,
        setUrlError,
      }),
    );
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
    const errors = collectValidationErrors({
      provider,
      providerType,
      bodyError,
      extensionErrors,
      validateUrl,
    });

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
        'bedrock',
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
          {...(isRedTeam && {
            testGenerationInstructions: config.testGenerationInstructions ?? '',
            onTestGenerationInstructionsChange: (instructions: string) =>
              updateConfig('testGenerationInstructions', instructions),
            onPromptsChange: (prompts: string[]) => updateConfig('prompts', prompts),
          })}
        />
      </div>
    </div>
  );
}

export default ProviderConfigEditor;
