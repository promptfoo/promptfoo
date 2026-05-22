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
import type { FoundationModelFieldErrors } from './FoundationModelConfiguration';

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

const usesExamplePath = (providerId: string | undefined): boolean =>
  Boolean(providerId?.includes('/path/to/'));

const FOUNDATION_MODEL_TYPES = [
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
];

const FOUNDATION_ERROR_FIELD_BY_CONFIG_FIELD: Partial<
  Record<string, keyof FoundationModelFieldErrors>
> = {
  id: 'modelId',
  max_tokens: 'maxTokens',
  temperature: 'temperature',
  top_p: 'topP',
};

type ValidationError = string | React.ReactNode;

interface ProviderValidationResult {
  errors: ValidationError[];
  foundationFieldErrors: FoundationModelFieldErrors;
  agentIdError: string | null;
}

const hasConfiguredInputs = (provider: ProviderOptions): boolean =>
  Boolean(provider.inputs && Object.keys(provider.inputs).length > 0);

const cloneProvider = (provider: ProviderOptions): ProviderOptions =>
  ({
    ...provider,
    config: { ...(provider.config ?? {}) },
  }) as ProviderOptions;

function getBodyPromptError(value: unknown, provider: ProviderOptions): React.ReactNode | null {
  const bodyString = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (bodyString.includes('{{prompt}}') || hasConfiguredInputs(provider)) {
    return null;
  }
  if (provider.config.request) {
    return null;
  }

  return (
    <>
      Request body must contain <code>{'{{prompt}}'}</code>, which Promptfoo replaces with each test
      input at run time. Replace the value that should receive the prompt with{' '}
      <code>{'{{prompt}}'}</code>. Promptfoo uses Nunjucks templating for this replacement.{' '}
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

function getRawRequestPromptError(value: unknown, provider: ProviderOptions): string | null {
  if (
    typeof value === 'string' &&
    value &&
    !value.includes('{{prompt}}') &&
    !hasConfiguredInputs(provider)
  ) {
    return 'Raw request must contain {{prompt}} template variable';
  }

  return null;
}

function updateGenericProviderField(
  provider: ProviderOptions,
  field: string,
  value: unknown,
): void {
  if (field === 'label') {
    provider.label = value as string;
    return;
  }
  if (field === 'delay') {
    provider.delay = value as number;
    return;
  }
  if (field === 'config') {
    provider.config = value as typeof provider.config;
    return;
  }

  provider.config[field] = value;
}

function validateFoundationModelProvider(
  provider: ProviderOptions,
  providerType: string | undefined,
): ProviderValidationResult {
  const errors: string[] = [];
  const foundationFieldErrors: FoundationModelFieldErrors = {};

  if (!provider.id || provider.id.trim() === '') {
    foundationFieldErrors.modelId = 'Model ID is required';
    errors.push(foundationFieldErrors.modelId);
  } else if (providerType === 'azure' && provider.id.includes('your-deployment-name')) {
    foundationFieldErrors.modelId = 'Replace the example value with your Azure deployment name';
    errors.push(foundationFieldErrors.modelId);
  }
  if (
    provider.config?.temperature !== undefined &&
    (provider.config.temperature < 0 || provider.config.temperature > 2)
  ) {
    foundationFieldErrors.temperature = 'Temperature must be between 0 and 2';
    errors.push(foundationFieldErrors.temperature);
  }
  if (provider.config?.max_tokens !== undefined && provider.config.max_tokens <= 0) {
    foundationFieldErrors.maxTokens = 'Max tokens must be greater than 0';
    errors.push(foundationFieldErrors.maxTokens);
  }
  if (
    provider.config?.top_p !== undefined &&
    (provider.config.top_p < 0 || provider.config.top_p > 1)
  ) {
    foundationFieldErrors.topP = 'Top P must be between 0 and 1';
    errors.push(foundationFieldErrors.topP);
  }

  return { errors, foundationFieldErrors, agentIdError: null };
}

function validateHttpProvider(
  provider: ProviderOptions,
  bodyError: React.ReactNode | null,
  validateUrl: (url: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
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

function validateAgentProvider(provider: ProviderOptions): string[] {
  if (!provider.id || provider.id.trim() === '') {
    return ['Python agent file path is required'];
  }
  if (!provider.id.startsWith('file://')) {
    return ['Enter a Python agent path beginning with file://'];
  }
  return usesExamplePath(provider.id) ? ['Replace the example path with your agent file path'] : [];
}

function validateCustomProvider(
  provider: ProviderOptions,
  bodyError: React.ReactNode | null,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!provider.id || provider.id.trim() === '') {
    errors.push('Provider ID is required');
  }
  if (usesExamplePath(provider.id)) {
    errors.push('Replace the example path with your provider file path');
  }
  if (bodyError) {
    errors.push(bodyError);
  }
  return errors;
}

function getProviderValidationResult(
  provider: ProviderOptions,
  providerType: string | undefined,
  bodyError: React.ReactNode | null,
  extensionErrors: boolean,
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean,
): ProviderValidationResult {
  let result: ProviderValidationResult = {
    errors: [],
    foundationFieldErrors: {},
    agentIdError: null,
  };
  if (providerType === 'http') {
    result.errors = validateHttpProvider(provider, bodyError, validateUrl);
  } else if (providerType === 'websocket') {
    if (!provider.config.url || !validateUrl(provider.config.url, 'websocket')) {
      result.errors.push('Valid WebSocket URL is required');
    }
  } else if (FOUNDATION_MODEL_TYPES.includes(providerType || '')) {
    result = validateFoundationModelProvider(provider, providerType);
  } else if (AGENT_FRAMEWORKS.includes(providerType || '')) {
    result.errors = validateAgentProvider(provider);
    result.agentIdError = typeof result.errors[0] === 'string' ? result.errors[0] : null;
  } else if (['javascript', 'python', 'go', 'custom', 'mcp', 'exec'].includes(providerType || '')) {
    result.errors = validateCustomProvider(provider, bodyError);
  }
  if (extensionErrors) {
    result.errors.push('Extension configuration has errors');
  }
  return result;
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
  const [foundationFieldErrors, setFoundationFieldErrors] = useState<FoundationModelFieldErrors>(
    {},
  );
  const [agentIdError, setAgentIdError] = useState<string | null>(null);

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
    const foundationErrorField = FOUNDATION_ERROR_FIELD_BY_CONFIG_FIELD[field];
    if (foundationErrorField) {
      setFoundationFieldErrors((errors) => ({ ...errors, [foundationErrorField]: undefined }));
    }

    // Shallow-clone the config along with the target so subsequent
    // assignments and `delete` don't mutate the original provider object
    // by reference (which is React state owned by our parent).
    const updatedTarget = cloneProvider(provider);

    if (field === 'id') {
      setAgentIdError(null);
      updatedTarget.id = value as string;
      if (shouldRemoveMcpConfig(provider.id, updatedTarget.id, providerType)) {
        delete updatedTarget.config.mcp;
      }
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
      setBodyError(getBodyPromptError(value, updatedTarget));
    } else if (field === 'request') {
      updatedTarget.config.request = value as string;
      setBodyError(getRawRequestPromptError(value, updatedTarget));
    } else if (field === 'inputs') {
      if (value === undefined) {
        delete updatedTarget.inputs;
      } else {
        updatedTarget.inputs = value as NonNullable<ProviderOptions['inputs']>;
        if (hasConfiguredInputs(updatedTarget)) {
          setBodyError(null);
        }
      }
    } else {
      updateGenericProviderField(updatedTarget, field, value);
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
    const {
      errors,
      foundationFieldErrors: nextFoundationFieldErrors,
      agentIdError: nextAgentIdError,
    } = getProviderValidationResult(
      provider,
      providerType,
      bodyError,
      extensionErrors,
      validateUrl,
    );
    setFoundationFieldErrors(nextFoundationFieldErrors);
    setAgentIdError(nextAgentIdError);
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
          setBodyError={setBodyError}
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
      {FOUNDATION_MODEL_TYPES.includes(providerType || '') && (
        <FoundationModelConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          providerType={providerType || ''}
          fieldErrors={foundationFieldErrors}
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
          setBodyError={setBodyError}
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
          setBodyError={setBodyError}
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
          setBodyError={setBodyError}
          providerType={providerType}
        />
      )}

      {/* Agent frameworks */}
      {AGENT_FRAMEWORKS.includes(providerType || '') && (
        <AgentFrameworkConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          agentType={providerType || ''}
          mode={mode}
          providerIdError={agentIdError}
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
          setBodyError={setBodyError}
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
          hideExtensions={!isRedTeam}
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
