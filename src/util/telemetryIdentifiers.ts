const REDACTED_TELEMETRY_IDENTIFIER_PREFIXES = new Set([
  'azure',
  'bedrock-agent',
  'databricks',
  'exec',
  'file',
  'golang',
  'helicone-gateway',
  'http',
  'https',
  'mlflow-gateway',
  'openclaw',
  'python',
  'ruby',
  'sagemaker',
  'truefoundry',
  'webhook',
  'ws',
  'wss',
]);

// These providers identify public/catalog model names rather than user-owned endpoints or resources.
const PUBLIC_MODEL_IDENTIFIER_PREFIXES = new Set([
  'abliteration',
  'ai21',
  'aimlapi',
  'alibaba',
  'alicloud',
  'aliyun',
  'anthropic',
  'atlascloud',
  'bam',
  'bedrock',
  'cerebras',
  'cloudflare-ai',
  'cloudflare-gateway',
  'cohere',
  'deepseek',
  'docker',
  'fal',
  'fireworks',
  'github',
  'google',
  'groq',
  'hf',
  'huggingface',
  'hyperbolic',
  'litellm',
  'llama',
  'llamaapi',
  'localai',
  'mistral',
  'modelslab',
  'nscale',
  'ollama',
  'openai',
  'openrouter',
  'perplexity',
  'portkey',
  'promptfoo',
  'quiverai',
  'replicate',
  'snowflake',
  'togetherai',
  'transformers',
  'transformers.js',
  'vercel',
  'vertex',
  'voyage',
  'watsonx',
  'xai',
]);

const PUBLIC_SLASH_MODEL_IDENTIFIER_PREFIXES = new Set([
  'cloudflare-ai',
  'huggingface',
  'hyperbolic',
  'openrouter',
  'replicate',
]);
const PUBLIC_BARE_PROVIDER_IDENTIFIERS = new Set(['browser-provider', 'echo', 'mcp']);
const REDACTED_OPENAI_IDENTIFIER_TYPES = new Set([
  'agents',
  'assistant',
  'chatkit',
  'codex',
  'codex-app-server',
  'codex-desktop',
  'codex-sdk',
  'moderation',
]);

function containsPrivateIdentifierData(
  prefix: string,
  suffix: string,
  allowCatalogSlash: boolean,
): boolean {
  if (REDACTED_TELEMETRY_IDENTIFIER_PREFIXES.has(prefix)) {
    return true;
  }

  if (prefix === 'bedrock' && (suffix.startsWith('arn:') || suffix.startsWith('kb:'))) {
    return true;
  }

  if (prefix === 'openai') {
    const [identifierType] = suffix.toLowerCase().split(':');
    if (
      REDACTED_OPENAI_IDENTIFIER_TYPES.has(identifierType) ||
      /(?:^|:)ft:/i.test(suffix) ||
      /^asst_/i.test(suffix)
    ) {
      return true;
    }
  }

  return (
    suffix.includes('://') ||
    /[\\?#]/.test(suffix) ||
    (!allowCatalogSlash && suffix.includes('/')) ||
    /^(?:\/|\.{1,2}\/|[A-Za-z]:[\\/])/.test(suffix)
  );
}

function sanitizeNamespacedTelemetryIdentifier(identifier: string, allowCatalogSlash: boolean) {
  const separatorIndex = identifier.indexOf(':');
  if (separatorIndex === -1) {
    return /[\\/?#]/.test(identifier) ? 'custom' : identifier;
  }

  const prefix = identifier.slice(0, separatorIndex).toLowerCase();
  const suffix = identifier.slice(separatorIndex + 1);
  return containsPrivateIdentifierData(prefix, suffix, allowCatalogSlash)
    ? `${prefix}:custom`
    : identifier;
}

/**
 * Redact configurable identifiers such as redteam plugins and strategies.
 */
export function sanitizeTelemetryIdentifier(identifier: string): string {
  if (identifier.toLowerCase().startsWith('custom:')) {
    return 'custom:custom';
  }
  return sanitizeNamespacedTelemetryIdentifier(identifier, false);
}

/**
 * Keep public model IDs useful while hiding provider endpoints and resource names.
 */
export function sanitizeTelemetryProviderIdentifier(identifier: string): string {
  if (!identifier.includes(':')) {
    return PUBLIC_BARE_PROVIDER_IDENTIFIERS.has(identifier.toLowerCase()) ? identifier : 'custom';
  }
  if (identifier.toLowerCase().startsWith('unknown:')) {
    return 'custom';
  }
  const prefix = identifier.slice(0, identifier.indexOf(':')).toLowerCase();
  if (
    !PUBLIC_MODEL_IDENTIFIER_PREFIXES.has(prefix) &&
    !REDACTED_TELEMETRY_IDENTIFIER_PREFIXES.has(prefix)
  ) {
    return 'custom';
  }
  const sanitized = sanitizeNamespacedTelemetryIdentifier(
    identifier,
    PUBLIC_SLASH_MODEL_IDENTIFIER_PREFIXES.has(prefix),
  );
  if (sanitized !== identifier) {
    return sanitized;
  }
  return identifier;
}

export function isCustomTelemetryProviderIdentifier(identifier: string): boolean {
  const sanitized = sanitizeTelemetryProviderIdentifier(identifier);
  const separatorIndex = sanitized.indexOf(':');
  const prefix = separatorIndex === -1 ? '' : sanitized.slice(0, separatorIndex).toLowerCase();
  return (
    sanitized !== identifier ||
    (REDACTED_TELEMETRY_IDENTIFIER_PREFIXES.has(prefix) && sanitized === `${prefix}:custom`)
  );
}
