/**
 * Maps provider types to their specific documentation URLs
 */

const BASE_DOCS_URL = 'https://www.promptfoo.dev/docs/providers';

/**
 * Provider type to documentation URL mapping
 * Falls back to the general providers documentation if no specific docs exist
 */
export const PROVIDER_DOCUMENTATION_MAP: Record<string, string> = {
  // API Endpoints
  http: `${BASE_DOCS_URL}/http`,
  websocket: `${BASE_DOCS_URL}/websocket`,

  // Code-based Providers
  javascript: `${BASE_DOCS_URL}/custom-api`,
  python: `${BASE_DOCS_URL}/python`,
  go: `${BASE_DOCS_URL}/go`,
  mcp: `${BASE_DOCS_URL}/mcp`,
  browser: `${BASE_DOCS_URL}/browser`,
  exec: `${BASE_DOCS_URL}/custom-script`,
  custom: `${BASE_DOCS_URL}`, // General providers page

  // Foundation Models
  openai: `${BASE_DOCS_URL}/openai`,
  anthropic: `${BASE_DOCS_URL}/anthropic`,
  google: `${BASE_DOCS_URL}/google`,
  vertex: `${BASE_DOCS_URL}/vertex`,
  azure: `${BASE_DOCS_URL}/azure`,
  mistral: `${BASE_DOCS_URL}/mistral`,
  groq: `${BASE_DOCS_URL}/groq`,
  perplexity: `${BASE_DOCS_URL}/perplexity`,
  deepseek: `${BASE_DOCS_URL}/deepseek`,
  xai: `${BASE_DOCS_URL}/xai`,

  // Cloud & Enterprise
  bedrock: `${BASE_DOCS_URL}/aws-bedrock`,
  'aws-bedrock': `${BASE_DOCS_URL}/aws-bedrock`,
  sagemaker: `${BASE_DOCS_URL}/sagemaker`,
  databricks: `${BASE_DOCS_URL}/databricks`,
  'cloudflare-ai': `${BASE_DOCS_URL}/cloudflare-ai`,
  huggingface: `${BASE_DOCS_URL}/huggingface`,
  helicone: `${BASE_DOCS_URL}/helicone`,
  jfrog: `${BASE_DOCS_URL}/jfrog`,

  // Third-Party Providers
  openrouter: `${BASE_DOCS_URL}/openrouter`,
  github: `${BASE_DOCS_URL}/github`,
  ai21: `${BASE_DOCS_URL}/ai21`,
  aimlapi: `${BASE_DOCS_URL}/aimlapi`,
  hyperbolic: `${BASE_DOCS_URL}/hyperbolic`,
  lambdalabs: `${BASE_DOCS_URL}/lambdalabs`,
  fal: `${BASE_DOCS_URL}/fal`,
  voyage: `${BASE_DOCS_URL}/voyage`,

  // Local Models
  ollama: `${BASE_DOCS_URL}/ollama`,
  vllm: `${BASE_DOCS_URL}/vllm`,
  localai: `${BASE_DOCS_URL}/localai`,
  llamafile: `${BASE_DOCS_URL}/llamafile`,
  'llama.cpp': `${BASE_DOCS_URL}/llama.cpp`,
  'text-generation-webui': `${BASE_DOCS_URL}/text-generation-webui`,

  // Additional providers found in docs
  adaline: `${BASE_DOCS_URL}/adaline`,
  alibaba: `${BASE_DOCS_URL}/alibaba`,
  cerebras: `${BASE_DOCS_URL}/cerebras`,
  cloudera: `${BASE_DOCS_URL}/cloudera`,
  cohere: `${BASE_DOCS_URL}/cohere`,
  docker: `${BASE_DOCS_URL}/docker`,
  echo: `${BASE_DOCS_URL}/echo`,
  f5: `${BASE_DOCS_URL}/f5`,
  fireworks: `${BASE_DOCS_URL}/fireworks`,
  'ibm-bam': `${BASE_DOCS_URL}/ibm-bam`,
  litellm: `${BASE_DOCS_URL}/litellm`,
  openllm: `${BASE_DOCS_URL}/openllm`,
  replicate: `${BASE_DOCS_URL}/replicate`,
  sequence: `${BASE_DOCS_URL}/sequence`,
  'simulated-user': `${BASE_DOCS_URL}/simulated-user`,
  togetherai: `${BASE_DOCS_URL}/togetherai`,
  watsonx: `${BASE_DOCS_URL}/watsonx`,
  webhook: `${BASE_DOCS_URL}/webhook`,
  'manual-input': `${BASE_DOCS_URL}/manual-input`,
};

/**
 * Gets the documentation URL for a given provider type
 * @param providerType The provider type (e.g., 'openai', 'http', 'python')
 * @returns The documentation URL for the provider, or general providers docs if not found
 */
export function getProviderDocumentationUrl(providerType?: string): string {
  if (!providerType) {
    return BASE_DOCS_URL;
  }

  // Handle provider formats like 'openrouter:openai/gpt-4o' or 'azure:chat:'
  const normalizedType = providerType.includes(':') ? providerType.split(':')[0] : providerType;

  return PROVIDER_DOCUMENTATION_MAP[normalizedType] || BASE_DOCS_URL;
}

/**
 * Checks if a provider has specific documentation
 * @param providerType The provider type to check
 * @returns true if specific documentation exists, false otherwise
 */
export function hasSpecificDocumentation(providerType?: string): boolean {
  if (!providerType) {
    return false;
  }

  return providerType in PROVIDER_DOCUMENTATION_MAP;
}

/**
 * Gets a help text for a provider with documentation link
 * @param providerType The provider type
 * @returns Formatted help text with documentation link
 */
export function getProviderHelpText(providerType?: string): string {
  const hasSpecific = hasSpecificDocumentation(providerType);

  if (hasSpecific && providerType) {
    return `Learn how to configure ${providerType} in our documentation.`;
  }

  return 'Learn how to configure providers in our documentation.';
}
