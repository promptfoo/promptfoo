import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import deepEqual from 'fast-deep-equal';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import A2AEndpointConfiguration from './A2AEndpointConfiguration';
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

const containsNunjucksTemplate = (value: string): boolean =>
  /{{[\s\S]*}}|{%[\s\S]*%}|{#[\s\S]*#}/.test(value);

const isRestoredTargetConfigDraft = (
  draft: string | null,
  config: ProviderOptions['config'],
): boolean => {
  if (draft === null) {
    return true;
  }
  try {
    return deepEqual(JSON.parse(draft), config);
  } catch {
    return false;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const getStructuredProvider = (provider: ProviderOptions): ProviderOptions =>
  isPlainObject(provider.config) ? provider : { ...provider, config: {} };

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
  const {
    targetConfigError,
    setTargetConfigError,
    targetConfigDraft,
    setTargetConfigDraft,
    clearTargetConfigValidation,
  } = useRedTeamTargetConfigValidation();
  const isRedTeam = mode === 'redteam';
  const structuredProvider = useMemo(() => getStructuredProvider(provider), [provider]);
  const preserveConfigErrorOnUnchangedConfig =
    isRedTeam &&
    Boolean(targetConfigError) &&
    isRestoredTargetConfigDraft(targetConfigDraft, provider.config);
  const [bodyError, setBodyError] = useState<string | React.ReactNode | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [rawConfigJson, setRawConfigJson] = useState<string>(() =>
    isRedTeam && targetConfigDraft !== null
      ? targetConfigDraft
      : JSON.stringify(provider.config, null, 2),
  );
  const [extensionErrors, setExtensionErrors] = useState(false);
  const [a2aAdvancedConfigError, setA2AAdvancedConfigError] = useState<string | null>(null);
  const [customConfigError, setCustomConfigError] = useState<string | null>(
    isRedTeam ? (targetConfigError ?? null) : null,
  );
  const previousProviderType = useRef(providerType);

  const handleCustomConfigErrorChange = (
    error: string | null,
    expectedTarget?: ProviderOptions,
  ) => {
    if (isRedTeam && !error && targetConfigError) {
      let cleared = false;
      try {
        cleared =
          clearTargetConfigValidation?.(JSON.stringify(expectedTarget ?? provider), false) ?? false;
      } catch {}
      if (!cleared) {
        const retainedError =
          useRedTeamTargetConfigValidation.getState().targetConfigError ??
          'Invalid JSON configuration';
        setCustomConfigError(retainedError);
        setError?.(retainedError);
        return;
      }
    }
    setCustomConfigError(error);
    setError?.(error);
    if (isRedTeam) {
      if (error) {
        setTargetConfigError?.(error);
      }
    }
  };

  const handleCustomRawConfigJsonChange = (value: string) => {
    setRawConfigJson(value);
    if (isRedTeam) {
      setTargetConfigDraft?.(value);
    }
  };

  useEffect(() => {
    if (previousProviderType.current !== providerType) {
      previousProviderType.current = providerType;
      setRawConfigJson(JSON.stringify(provider.config, null, 2));
      if (isRedTeam) {
        let cleared = false;
        try {
          cleared = clearTargetConfigValidation?.(JSON.stringify(provider)) ?? false;
        } catch {}
        if (!cleared) {
          const retainedError =
            useRedTeamTargetConfigValidation.getState().targetConfigError ??
            'Invalid JSON configuration';
          setCustomConfigError(retainedError);
          setError?.(retainedError);
          return;
        }
      }
      setCustomConfigError(null);
      setError?.(null);
      setBodyError(null);
    }
  }, [isRedTeam, provider, providerType, setError, clearTargetConfigValidation]);

  const validateUrl = useCallback((url: string, type: 'http' | 'websocket' = 'http'): boolean => {
    if (type === 'http' && containsNunjucksTemplate(url)) {
      return true;
    }
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

  const getA2AShorthandUrl = useCallback((id?: string): string | undefined => {
    if (!id?.startsWith('a2a:')) {
      return undefined;
    }
    const url = id.slice('a2a:'.length);
    return url.trim().length > 0 ? url : undefined;
  }, []);

  const updateCustomTarget = (field: string, value: unknown) => {
    // Shallow-clone the config along with the target so subsequent
    // assignments and `delete` don't mutate the original provider object
    // by reference (which is React state owned by our parent).
    const updatedTarget = {
      ...provider,
      config: { ...structuredProvider.config },
    } as ProviderOptions;

    if (field === 'id') {
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
      const bodyStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;
      if (!isRedTeam || bodyStr.includes('{{prompt}}') || hasInputs) {
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
      if (
        isRedTeam &&
        value &&
        typeof value === 'string' &&
        !value.includes('{{prompt}}') &&
        !hasInputs
      ) {
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
        updatedTarget.inputs = value as NonNullable<ProviderOptions['inputs']>;
        // Clear body error if inputs are provided ({{prompt}} not required with multi-input)
        if (Object.keys(value as NonNullable<ProviderOptions['inputs']>).length > 0) {
          setBodyError(null);
        }
      }
    } else {
      updatedTarget.config[field] = value;
    }

    setProvider(updatedTarget);
  };

  const updateWebSocketTarget = (field: string, value: unknown) => {
    const updatedTarget = {
      ...provider,
      config: { ...structuredProvider.config },
    } as ProviderOptions;
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
      field === 'transformResponse' ||
      field === 'protocols' ||
      field === 'messageTemplate' ||
      field === 'timeoutMs'
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
      if (structuredProvider.config.request === undefined) {
        // Structured mode: validate URL
        if (!structuredProvider.config.url || !validateUrl(structuredProvider.config.url)) {
          errors.push('Valid URL is required');
        }
      } else {
        // Raw mode: validate that request is not empty
        if (!structuredProvider.config.request || structuredProvider.config.request.trim() === '') {
          errors.push('HTTP request content is required');
        }
      }

      if (bodyError) {
        errors.push(bodyError);
      }
    } else if (providerType === 'websocket') {
      if (
        !structuredProvider.config.url ||
        !validateUrl(structuredProvider.config.url, 'websocket')
      ) {
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
        'bedrock',
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
      ['a2a', 'javascript', 'python', 'go', 'custom', 'mcp', 'exec', 'openinterpreter'].includes(
        providerType || '',
      )
    ) {
      // Custom providers validation
      if (!provider.id || provider.id.trim() === '') {
        errors.push('Provider ID is required');
      }
      if (
        providerType === 'openinterpreter' &&
        provider.id?.trim() &&
        provider.id !== 'openinterpreter' &&
        !provider.id.startsWith('openinterpreter:')
      ) {
        errors.push(
          'Open Interpreter Provider ID must be "openinterpreter" or start with "openinterpreter:"',
        );
      }
      if (providerType === 'a2a') {
        if (provider.id !== 'a2a' && !provider.id?.startsWith('a2a:')) {
          errors.push('A2A Provider ID must be "a2a" or start with "a2a:"');
        }
        const configuredUrl =
          typeof provider.config?.url === 'string' ? provider.config.url.trim() : '';
        const agentCardUrl =
          typeof provider.config?.agentCardUrl === 'string'
            ? provider.config.agentCardUrl.trim()
            : '';
        const shorthandUrl = getA2AShorthandUrl(provider.id) ?? '';

        const hasUrl =
          configuredUrl.length > 0 &&
          (validateUrl(configuredUrl) || containsNunjucksTemplate(configuredUrl));
        const hasShorthandUrl =
          shorthandUrl.length > 0 &&
          (validateUrl(shorthandUrl) || containsNunjucksTemplate(shorthandUrl));
        const hasAgentCardUrl =
          agentCardUrl.length > 0 &&
          (validateUrl(agentCardUrl) || containsNunjucksTemplate(agentCardUrl));

        if (configuredUrl.length > 0 && !hasUrl) {
          errors.push('A2A endpoint URL must be a valid HTTP(S) URL');
        }
        if (agentCardUrl.length > 0 && !hasAgentCardUrl) {
          errors.push('A2A Agent Card URL must be a valid HTTP(S) URL');
        }
        if (shorthandUrl.length > 0 && !hasShorthandUrl) {
          errors.push('A2A shorthand URL must be a valid HTTP(S) URL');
        }
        if (!hasUrl && !hasShorthandUrl && !hasAgentCardUrl) {
          errors.push('A valid A2A endpoint URL or Agent Card URL is required');
        }
        if (a2aAdvancedConfigError) {
          errors.push(a2aAdvancedConfigError);
        }
      }
    }

    if (customConfigError) {
      errors.push(customConfigError);
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
  }, [
    providerType,
    provider,
    structuredProvider,
    bodyError,
    extensionErrors,
    a2aAdvancedConfigError,
    customConfigError,
    setError,
    onValidate,
    validateUrl,
    getA2AShorthandUrl,
  ]);

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
      {(providerType === 'custom' || providerType === 'openinterpreter') && (
        <CustomTargetConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={handleCustomRawConfigJsonChange}
          bodyError={customConfigError ?? bodyError}
          providerType={providerType}
          onConfigErrorChange={handleCustomConfigErrorChange}
          preserveConfigErrorOnUnchangedConfig={preserveConfigErrorOnUnchangedConfig}
        />
      )}

      {providerType === 'http' && (
        <HttpEndpointConfiguration
          selectedTarget={structuredProvider}
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
          selectedTarget={structuredProvider}
          updateWebSocketTarget={updateWebSocketTarget}
          urlError={urlError}
        />
      )}

      {providerType === 'browser' && (
        <BrowserAutomationConfiguration
          selectedTarget={structuredProvider}
          updateCustomTarget={updateCustomTarget}
        />
      )}

      {providerType === 'a2a' && (
        <A2AEndpointConfiguration
          selectedTarget={structuredProvider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={setRawConfigJson}
          bodyError={bodyError}
          onAdvancedConfigErrorChange={setA2AAdvancedConfigError}
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
          selectedTarget={structuredProvider}
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
          setRawConfigJson={handleCustomRawConfigJsonChange}
          bodyError={customConfigError ?? bodyError}
          providerType={providerType}
          onConfigErrorChange={handleCustomConfigErrorChange}
          preserveConfigErrorOnUnchangedConfig={preserveConfigErrorOnUnchangedConfig}
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
          setRawConfigJson={handleCustomRawConfigJsonChange}
          bodyError={customConfigError ?? bodyError}
          providerType={providerType}
          onConfigErrorChange={handleCustomConfigErrorChange}
          preserveConfigErrorOnUnchangedConfig={preserveConfigErrorOnUnchangedConfig}
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
          setRawConfigJson={handleCustomRawConfigJsonChange}
          bodyError={customConfigError ?? bodyError}
          providerType={providerType}
          onConfigErrorChange={handleCustomConfigErrorChange}
          preserveConfigErrorOnUnchangedConfig={preserveConfigErrorOnUnchangedConfig}
        />
      )}

      {/* Agent frameworks */}
      {AGENT_FRAMEWORKS.includes(providerType || '') && (
        <AgentFrameworkConfiguration
          selectedTarget={structuredProvider}
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
          setRawConfigJson={handleCustomRawConfigJsonChange}
          bodyError={customConfigError ?? bodyError}
          providerType={providerType}
          onConfigErrorChange={handleCustomConfigErrorChange}
          preserveConfigErrorOnUnchangedConfig={preserveConfigErrorOnUnchangedConfig}
        />
      )}

      <div className="mt-6">
        <CommonConfigurationOptions
          selectedTarget={structuredProvider}
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
