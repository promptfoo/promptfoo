// Keep initial target configuration browser-safe. Runtime routing is verified by backend tests.
export function getProviderInitialConfig(
  providerType: string,
): { id: string; config: Record<string, unknown> } | undefined {
  switch (providerType) {
    case 'together':
      return { id: 'togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo', config: {} };
    case 'huggingface':
      return { id: 'huggingface:chat:meta-llama/Meta-Llama-3-70B-Instruct', config: {} };
    case 'bedrock-agent':
      return {
        id: 'bedrock:agents:your-agent-id',
        config: { agentAliasId: 'your-agent-alias-id' },
      };
    case 'fal':
      return { id: 'fal:image:fal-ai/flux/dev', config: {} };
    case 'cloudflare-ai':
      return { id: 'cloudflare-ai:chat:@cf/meta/llama-3.3-70b-instruct-fp8-fast', config: {} };
    case 'llama.cpp':
      // The native adapter reads LLAMA_BASE_URL, not config.apiBaseUrl.
      return { id: 'llama:local-model', config: { n_predict: 1024 } };
    case 'llamafile':
      return {
        id: 'openai:chat:local-model',
        config: {
          type: 'llamafile',
          apiBaseUrl: 'http://localhost:8080/v1',
          apiKeyRequired: false,
          useDefaultApiKey: false,
        },
      };
    case 'vllm':
      return {
        id: 'openai:chat:your-served-model-name',
        config: {
          type: 'vllm',
          apiBaseUrl: 'http://localhost:8000/v1',
          apiKeyRequired: false,
          useDefaultApiKey: false,
        },
      };
    case 'text-generation-webui':
      return {
        id: 'openai:chat:your-served-model-name',
        config: {
          type: 'text-generation-webui',
          apiBaseUrl: 'http://localhost:5000/v1',
          apiKeyRequired: false,
          useDefaultApiKey: false,
        },
      };
    case 'ollama':
      return { id: 'ollama:llama3.2:3b', config: {} };
    case 'databricks':
      return { id: 'databricks:databricks-meta-llama-3-3-70b-instruct', config: {} };
    case 'deepseek':
      return {
        id: 'deepseek:deepseek-v4-flash',
        config: { passthrough: { thinking: { type: 'disabled' } } },
      };
    case 'cerebras':
      return { id: 'cerebras:gpt-oss-120b', config: {} };
    case 'groq':
      return { id: 'groq:openai/gpt-oss-120b', config: {} };
    default:
      return undefined;
  }
}
