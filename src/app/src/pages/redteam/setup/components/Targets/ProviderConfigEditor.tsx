import { useCallback, useEffect, useRef, useState } from 'react';

import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
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
import type { BrowserAutomationFieldErrors } from './BrowserAutomationConfiguration';
import type { FoundationModelFieldErrors } from './FoundationModelConfiguration';
import type { AuthorizationFieldErrors } from './tabs/AuthorizationTab';

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

const EXAMPLE_PROVIDER_IDS = [
  'file:///path/to/custom_provider.js',
  'file:///path/to/custom_provider.py',
  'file:///path/to/your/script.go',
  'file:///path/to/langchain_agent.py',
  'file:///path/to/autogen_agent.py',
  'file:///path/to/crewai_agent.py',
  'file:///path/to/llamaindex_agent.py',
  'file:///path/to/langgraph_agent.py',
  'file:///path/to/openai_agents.py',
  'file:///path/to/pydantic_ai_agent.py',
  'file:///path/to/google_adk_agent.py',
  'file:///path/to/claude_agent.py',
  'file:///path/to/custom_agent.py',
  'exec:/path/to/script.sh',
] as const;

const usesExamplePath = (providerId: string | undefined): boolean =>
  Boolean(
    providerId &&
      EXAMPLE_PROVIDER_IDS.some(
        (exampleId) => providerId === exampleId || providerId.startsWith(`${exampleId}:`),
      ),
  );

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

const CUSTOM_CONFIGURATION_PROVIDER_TYPES = [
  'custom',
  'sagemaker',
  'databricks',
  'cloudflare-ai',
  'fireworks',
  'together',
  'replicate',
  'huggingface',
  'github',
  'xai',
  'ai21',
  'aimlapi',
  'hyperbolic',
  'fal',
  'voyage',
  'ollama',
  'vllm',
  'localai',
  'llamafile',
  'llama.cpp',
  'text-generation-webui',
  'javascript',
  'python',
  'go',
  'mcp',
  'exec',
];

const usesCustomTargetConfiguration = (providerType: string | undefined): boolean =>
  CUSTOM_CONFIGURATION_PROVIDER_TYPES.includes(providerType || '');

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
  customIdError: string | null;
  urlError: string | null;
  requestError: string | null;
  authorizationFieldErrors: AuthorizationFieldErrors;
  browserFieldErrors: BrowserAutomationFieldErrors;
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

  return {
    errors,
    foundationFieldErrors,
    agentIdError: null,
    customIdError: null,
    urlError: null,
    requestError: null,
    authorizationFieldErrors: {},
    browserFieldErrors: {},
  };
}

function validateHttpProvider(
  provider: ProviderOptions,
  bodyError: React.ReactNode | null,
  validateUrl: (url: string) => boolean,
): Pick<
  ProviderValidationResult,
  'errors' | 'urlError' | 'requestError' | 'authorizationFieldErrors'
> {
  const errors: ValidationError[] = [];
  let urlError: string | null = null;
  let requestError: string | null = null;
  if (provider.config.request === undefined) {
    if (!provider.config.url || !validateUrl(provider.config.url)) {
      urlError = 'Valid URL is required';
      errors.push(urlError);
    }
  } else if (!provider.config.request || provider.config.request.trim() === '') {
    requestError = 'HTTP request content is required';
    errors.push(requestError);
  }
  if (bodyError && bodyError !== requestError) {
    errors.push(bodyError);
  }
  const authorizationValidation = validateHttpAuthorization(provider);
  errors.push(...authorizationValidation.errors);
  errors.push(...validateTlsConfig(provider));
  return {
    errors,
    urlError,
    requestError,
    authorizationFieldErrors: authorizationValidation.fieldErrors,
  };
}

function validateTlsConfig(provider: ProviderOptions): string[] {
  const tls = provider.config.tls as
    | {
        enabled?: boolean;
        certificateType?: 'none' | 'pem' | 'jks' | 'pfx';
        certInputType?: 'upload' | 'path';
        keyInputType?: 'upload' | 'path';
        jksInputType?: 'upload' | 'path';
        pfxInputType?: 'upload' | 'path';
        cert?: string;
        certPath?: string;
        key?: string;
        keyPath?: string;
        pfx?: string;
        pfxPath?: string;
        jksContent?: string;
        jksPath?: string;
        keyAlias?: string;
      }
    | undefined;
  if (!tls?.enabled) {
    return [];
  }

  const errors: string[] = [];
  const requireValue = (value: unknown, message: string) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(message);
    }
  };

  switch (tls.certificateType ?? 'none') {
    case 'pem':
      if ((tls.certInputType ?? 'upload') === 'path') {
        requireValue(tls.certPath, 'TLS certificate file path is required');
      } else {
        requireValue(tls.cert, 'TLS certificate content is required');
      }
      if ((tls.keyInputType ?? 'upload') === 'path') {
        requireValue(tls.keyPath, 'TLS private-key file path is required');
      } else {
        requireValue(tls.key, 'TLS private-key content is required');
      }
      break;
    case 'jks':
      if ((tls.jksInputType ?? 'upload') === 'path') {
        requireValue(tls.jksPath, 'JKS keystore path is required');
      } else {
        requireValue(tls.jksContent, 'JKS keystore content is required');
      }
      break;
    case 'pfx':
      if ((tls.pfxInputType ?? 'upload') === 'path') {
        requireValue(tls.pfxPath, 'PFX file path is required');
      } else {
        requireValue(tls.pfx, 'PFX file content is required');
      }
      break;
    // 'none' (the default when TLS is enabled but no cert type chosen) requires no material;
    // the toggle alone is meaningful when used with rejectUnauthorized: false against a CA.
  }

  return errors;
}

interface HttpAuthorizationValidationResult {
  errors: string[];
  fieldErrors: AuthorizationFieldErrors;
}

function validateHttpSignatureAuthorization(
  provider: ProviderOptions,
): HttpAuthorizationValidationResult {
  const signatureAuth = provider.config.signatureAuth;
  if (!signatureAuth?.enabled) {
    return { errors: [], fieldErrors: {} };
  }

  const errors: string[] = [];
  const fieldErrors: AuthorizationFieldErrors = {};
  const requireValue = (field: keyof AuthorizationFieldErrors, value: unknown, message: string) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(message);
      fieldErrors[field] = message;
    }
  };

  switch (signatureAuth.certificateType ?? 'pem') {
    case 'pem':
      if (signatureAuth.keyInputType === 'path') {
        requireValue(
          'privateKeyPath',
          signatureAuth.privateKeyPath,
          'Private Key File Path is required for digital signature authentication',
        );
      } else {
        requireValue(
          'privateKey',
          signatureAuth.privateKey,
          'A PEM private key is required for digital signature authentication',
        );
      }
      break;
    case 'jks':
      requireValue(
        'keystorePath',
        signatureAuth.keystorePath,
        'Keystore Path is required for digital signature authentication',
      );
      break;
    case 'pfx':
      if (signatureAuth.pfxMode === 'separate') {
        requireValue(
          'certPath',
          signatureAuth.certPath,
          'Certificate File Path is required for digital signature authentication',
        );
        requireValue(
          'keyPath',
          signatureAuth.keyPath,
          'Private Key File Path is required for digital signature authentication',
        );
      } else {
        requireValue(
          'pfxPath',
          signatureAuth.pfxPath,
          'PFX File Path is required for digital signature authentication',
        );
      }
      break;
  }

  return { errors, fieldErrors };
}

function validateHttpAuthorization(provider: ProviderOptions): HttpAuthorizationValidationResult {
  if (provider.config.signatureAuth?.enabled) {
    return validateHttpSignatureAuthorization(provider);
  }

  const auth = provider.config.auth;
  if (!auth) {
    return { errors: [], fieldErrors: {} };
  }

  const errors: string[] = [];
  const fieldErrors: AuthorizationFieldErrors = {};
  const requireValue = (field: keyof AuthorizationFieldErrors, value: unknown, message: string) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(message);
      fieldErrors[field] = message;
    }
  };

  switch (auth.type) {
    case 'oauth':
      requireValue('tokenUrl', auth.tokenUrl, 'Token URL is required for OAuth authentication');
      if (auth.grantType === 'password') {
        requireValue('username', auth.username, 'Username is required for OAuth password grant');
        requireValue('password', auth.password, 'Password is required for OAuth password grant');
      } else {
        requireValue(
          'clientId',
          auth.clientId,
          'Client ID is required for OAuth client credentials',
        );
        requireValue(
          'clientSecret',
          auth.clientSecret,
          'Client Secret is required for OAuth client credentials',
        );
      }
      break;
    case 'basic':
      requireValue('username', auth.username, 'Username is required for Basic authentication');
      requireValue('password', auth.password, 'Password is required for Basic authentication');
      break;
    case 'bearer':
      requireValue('token', auth.token, 'Token is required for Bearer authentication');
      break;
    case 'api_key':
      requireValue('keyName', auth.keyName, 'Key Name is required for API key authentication');
      requireValue('value', auth.value, 'API Key Value is required for API key authentication');
      break;
    case 'file':
      requireValue('path', auth.path, 'Auth File Path is required for file authentication');
      break;
  }

  return { errors, fieldErrors };
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

const BROWSER_STARTER_URL = 'https://example.com';

type BrowserStep = NonNullable<ProviderOptions['config']['steps']>[number];
type AddBrowserStepError = (
  index: number,
  field: keyof NonNullable<BrowserAutomationFieldErrors['stepErrors']>[number],
  message: string,
) => void;

function validateBrowserStep(step: BrowserStep, index: number, addStepError: AddBrowserStepError) {
  const prefix = `Step ${index + 1}:`;
  if (!step.action) {
    addStepError(index, 'action', `${prefix} choose an action type.`);
    return;
  }

  if (step.action === 'navigate') {
    if (!step.args?.url?.trim()) {
      addStepError(index, 'url', `${prefix} enter a URL to navigate to.`);
    } else if (step.args.url.trim() === BROWSER_STARTER_URL) {
      addStepError(index, 'url', `${prefix} replace example.com with your application URL.`);
    }
  }
  if (['click', 'type'].includes(step.action) && !step.args?.selector?.trim()) {
    addStepError(index, 'selector', `${prefix} enter a CSS selector.`);
  }
  if (step.action === 'type' && !step.args?.text?.trim()) {
    addStepError(index, 'text', `${prefix} enter text to type.`);
  }
  if (step.action === 'extract') {
    if (!step.args?.selector?.trim() && !step.args?.script?.trim()) {
      addStepError(index, 'selector', `${prefix} enter a CSS selector to extract.`);
    }
    if (!step.name?.trim()) {
      addStepError(index, 'name', `${prefix} name the extracted value.`);
    }
  }
  if (step.action === 'screenshot' && !step.args?.path?.trim()) {
    addStepError(index, 'path', `${prefix} enter a screenshot file path.`);
  }
  if (
    step.action === 'wait' &&
    (step.args?.ms === undefined || !Number.isFinite(step.args.ms) || step.args.ms < 0)
  ) {
    addStepError(index, 'ms', `${prefix} enter a wait duration of 0 milliseconds or greater.`);
  }
  if (step.action === 'waitForNewChildren' && !step.args?.parentSelector?.trim()) {
    addStepError(index, 'parentSelector', `${prefix} enter a parent selector.`);
  }
}

function validateBrowserProvider(provider: ProviderOptions): {
  errors: string[];
  fieldErrors: BrowserAutomationFieldErrors;
} {
  const errors: string[] = [];
  const fieldErrors: BrowserAutomationFieldErrors = { stepErrors: {} };
  const steps = provider.config.steps;

  if (!Array.isArray(steps) || steps.length === 0) {
    fieldErrors.steps = 'Add at least one browser step before saving this provider.';
    return { errors: [fieldErrors.steps], fieldErrors };
  }

  const addStepError = (
    index: number,
    field: keyof NonNullable<BrowserAutomationFieldErrors['stepErrors']>[number],
    message: string,
  ) => {
    fieldErrors.stepErrors![index] = {
      ...fieldErrors.stepErrors![index],
      [field]: message,
    };
    errors.push(message);
  };

  steps.forEach((step, index) => validateBrowserStep(step, index, addStepError));

  return { errors, fieldErrors };
}

function getCustomProviderIdError(provider: ProviderOptions): string | null {
  if (!provider.id || provider.id.trim() === '') {
    return 'Provider ID is required';
  }
  if (usesExamplePath(provider.id)) {
    return 'Replace the example path with your provider file path';
  }

  return null;
}

function validateCustomProvider(
  provider: ProviderOptions,
  bodyError: React.ReactNode | null,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const idError = getCustomProviderIdError(provider);
  if (idError) {
    errors.push(idError);
  }
  if (bodyError) {
    errors.push(bodyError);
  }
  return errors;
}

function validateA2AProvider(
  provider: ProviderOptions,
  advancedConfigError: string | null,
  validateUrl: (url: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!provider.id || provider.id.trim() === '') {
    errors.push('Provider ID is required');
  } else if (provider.id !== 'a2a' && !provider.id.startsWith('a2a:')) {
    errors.push('A2A Provider ID must be "a2a" or start with "a2a:"');
  }

  const configuredUrl = typeof provider.config?.url === 'string' ? provider.config.url.trim() : '';
  const agentCardUrl =
    typeof provider.config?.agentCardUrl === 'string' ? provider.config.agentCardUrl.trim() : '';
  const shorthandUrl = provider.id?.startsWith('a2a:')
    ? provider.id.slice('a2a:'.length).trim()
    : '';

  const isValidA2AUrl = (url: string): boolean =>
    url.length > 0 && (validateUrl(url) || containsNunjucksTemplate(url));
  const hasUrl = isValidA2AUrl(configuredUrl);
  const hasShorthandUrl = isValidA2AUrl(shorthandUrl);
  const hasAgentCardUrl = isValidA2AUrl(agentCardUrl);

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
  if (advancedConfigError) {
    errors.push(advancedConfigError);
  }

  return errors;
}

function getProviderValidationResult(
  provider: ProviderOptions,
  providerType: string | undefined,
  bodyError: React.ReactNode | null,
  extensionErrors: boolean,
  a2aAdvancedConfigError: string | null,
  validateUrl: (url: string, type?: 'http' | 'websocket') => boolean,
): ProviderValidationResult {
  let result: ProviderValidationResult = {
    errors: [],
    foundationFieldErrors: {},
    agentIdError: null,
    customIdError: null,
    urlError: null,
    requestError: null,
    authorizationFieldErrors: {},
    browserFieldErrors: {},
  };
  if (providerType === 'http') {
    result = { ...result, ...validateHttpProvider(provider, bodyError, validateUrl) };
  } else if (providerType === 'websocket') {
    if (!provider.config.url || !validateUrl(provider.config.url, 'websocket')) {
      result.urlError = 'Valid WebSocket URL is required';
      result.errors.push(result.urlError);
    }
  } else if (providerType === 'browser') {
    const browserValidation = validateBrowserProvider(provider);
    result.errors = browserValidation.errors;
    result.browserFieldErrors = browserValidation.fieldErrors;
  } else if (FOUNDATION_MODEL_TYPES.includes(providerType || '')) {
    result = validateFoundationModelProvider(provider, providerType);
  } else if (AGENT_FRAMEWORKS.includes(providerType || '')) {
    result.errors = validateAgentProvider(provider);
    result.agentIdError = typeof result.errors[0] === 'string' ? result.errors[0] : null;
  } else if (providerType === 'a2a') {
    result.errors = validateA2AProvider(provider, a2aAdvancedConfigError, validateUrl);
  } else if (usesCustomTargetConfiguration(providerType)) {
    result.customIdError = getCustomProviderIdError(provider);
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
  const [a2aAdvancedConfigError, setA2AAdvancedConfigError] = useState<string | null>(null);
  const [foundationFieldErrors, setFoundationFieldErrors] = useState<FoundationModelFieldErrors>(
    {},
  );
  const [agentIdError, setAgentIdError] = useState<string | null>(null);
  const [customIdError, setCustomIdError] = useState<string | null>(null);
  const [authorizationFieldErrors, setAuthorizationFieldErrors] =
    useState<AuthorizationFieldErrors>({});
  const [browserFieldErrors, setBrowserFieldErrors] = useState<BrowserAutomationFieldErrors>({});
  const previousProviderTypeRef = useRef(providerType);
  const latestProviderRef = useRef(provider);

  useEffect(() => {
    if (previousProviderTypeRef.current === providerType) {
      return;
    }
    previousProviderTypeRef.current = providerType;
    setRawConfigJson(JSON.stringify(provider.config, null, 2));
    setBodyError(null);
    setUrlError(null);
    setFoundationFieldErrors({});
    setAgentIdError(null);
    setCustomIdError(null);
    setAuthorizationFieldErrors({});
    setBrowserFieldErrors({});
    setA2AAdvancedConfigError(null);
  }, [provider.config, providerType]);

  useEffect(() => {
    latestProviderRef.current = provider;
  }, [provider]);

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
    setAuthorizationFieldErrors((errors) =>
      field === 'auth' || field === 'signatureAuth' ? {} : errors,
    );

    const foundationErrorField = FOUNDATION_ERROR_FIELD_BY_CONFIG_FIELD[field];
    if (foundationErrorField) {
      setFoundationFieldErrors((errors) => ({ ...errors, [foundationErrorField]: undefined }));
    }

    // Shallow-clone the config along with the target so subsequent
    // assignments and `delete` don't mutate the original provider object
    // by reference (which is React state owned by our parent).
    const previousTarget = latestProviderRef.current;
    const updatedTarget = cloneProvider(previousTarget);

    if (field === 'id') {
      setAgentIdError(null);
      setCustomIdError(null);
      updatedTarget.id = value as string;
      if (shouldRemoveMcpConfig(previousTarget.id, updatedTarget.id, providerType)) {
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
    } else if (field === 'steps') {
      setBrowserFieldErrors({});
      updatedTarget.config.steps = value as typeof updatedTarget.config.steps;
    } else {
      updateGenericProviderField(updatedTarget, field, value);
    }

    latestProviderRef.current = updatedTarget;
    setProvider(updatedTarget);
  };

  const updateWebSocketTarget = (field: string, value: unknown) => {
    const updatedTarget = cloneProvider(latestProviderRef.current);
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
    latestProviderRef.current = updatedTarget;
    setProvider(updatedTarget);
  };

  const validate = useCallback((): boolean => {
    const {
      errors,
      foundationFieldErrors: nextFoundationFieldErrors,
      agentIdError: nextAgentIdError,
      customIdError: nextCustomIdError,
      urlError: nextUrlError,
      requestError: nextRequestError,
      authorizationFieldErrors: nextAuthorizationFieldErrors,
      browserFieldErrors: nextBrowserFieldErrors,
    } = getProviderValidationResult(
      provider,
      providerType,
      bodyError,
      extensionErrors,
      a2aAdvancedConfigError,
      validateUrl,
    );
    setFoundationFieldErrors(nextFoundationFieldErrors);
    setAgentIdError(nextAgentIdError);
    setCustomIdError(nextCustomIdError);
    setUrlError(nextUrlError);
    if (nextRequestError) {
      setBodyError(nextRequestError);
    }
    setAuthorizationFieldErrors(nextAuthorizationFieldErrors);
    setBrowserFieldErrors(nextBrowserFieldErrors);
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
    bodyError,
    extensionErrors,
    a2aAdvancedConfigError,
    setError,
    onValidate,
    validateUrl,
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
      {usesCustomTargetConfiguration(providerType) && (
        <CustomTargetConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={setRawConfigJson}
          bodyError={bodyError}
          setBodyError={setBodyError}
          providerType={providerType}
          mode={mode}
          idError={customIdError}
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
          authorizationFieldErrors={authorizationFieldErrors}
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
          fieldErrors={browserFieldErrors}
        />
      )}

      {providerType === 'a2a' && (
        <A2AEndpointConfiguration
          selectedTarget={provider}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={rawConfigJson}
          setRawConfigJson={setRawConfigJson}
          bodyError={bodyError}
          onAdvancedConfigErrorChange={setA2AAdvancedConfigError}
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
