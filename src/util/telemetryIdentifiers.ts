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

// Known provider families; suffixes can contain private model or deployment names.
const MODEL_PROVIDER_PREFIXES = new Set([
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

const BARE_PROVIDERS = new Set(['browser-provider', 'echo', 'mcp']);

// Emit only a fixed vocabulary. A recognized vendor does not make its model ID public.
export function sanitizeTelemetryProviderIdentifier(identifier: string): string {
  const prefix = identifier.split(':', 1)[0].toLowerCase();
  return MODEL_PROVIDER_PREFIXES.has(prefix) ||
    REDACTED_TELEMETRY_IDENTIFIER_PREFIXES.has(prefix) ||
    BARE_PROVIDERS.has(prefix)
    ? prefix
    : 'custom';
}

export function isCustomTelemetryProviderIdentifier(identifier: string): boolean {
  const category = sanitizeTelemetryProviderIdentifier(identifier);
  return category === 'custom' || REDACTED_TELEMETRY_IDENTIFIER_PREFIXES.has(category);
}
