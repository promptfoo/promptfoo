/**
 * Provider catalog for the init wizard.
 *
 * This defines the available provider families and their models
 * for selection during project initialization.
 */

import type { ProviderFamily } from '../machines/initMachine.types';

export const PROVIDER_CATALOG: ProviderFamily[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT and o-series models',
    icon: '🤖',
    apiKeyEnv: 'OPENAI_API_KEY',
    website: 'https://platform.openai.com',
    models: [
      {
        id: 'openai:gpt-4.1',
        name: 'GPT-4.1',
        description: 'Latest flagship model',
        tags: ['latest'],
        defaultSelected: true,
      },
      {
        id: 'openai:gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'Fast and affordable',
        tags: ['fast', 'cheap'],
        defaultSelected: true,
      },
      {
        id: 'openai:gpt-4o',
        name: 'GPT-4o',
        description: 'Multimodal flagship',
        tags: ['vision'],
      },
      {
        id: 'openai:gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast multimodal',
        tags: ['fast', 'cheap', 'vision'],
      },
      {
        id: 'openai:o3',
        name: 'o3',
        description: 'Advanced reasoning model',
        tags: ['reasoning'],
      },
      {
        id: 'openai:o4-mini',
        name: 'o4-mini',
        description: 'Fast reasoning model',
        tags: ['reasoning', 'fast'],
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models',
    icon: '🎭',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    website: 'https://console.anthropic.com',
    models: [
      {
        id: 'anthropic:messages:claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Latest balanced model',
        tags: ['latest'],
        defaultSelected: true,
      },
      {
        id: 'anthropic:messages:claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Most capable model',
        tags: ['latest'],
      },
      {
        id: 'anthropic:messages:claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and efficient',
        tags: ['fast', 'cheap'],
        defaultSelected: true,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models via Vertex AI',
    icon: '🔷',
    apiKeyEnv: 'GOOGLE_APPLICATION_CREDENTIALS',
    models: [
      {
        id: 'vertex:gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Latest fast Gemini model',
        tags: ['latest', 'fast'],
        defaultSelected: true,
      },
      {
        id: 'vertex:gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Long context model',
      },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama',
    icon: '🦙',
    website: 'https://ollama.ai',
    models: [
      {
        id: 'ollama:chat:llama3.3',
        name: 'Llama 3.3',
        description: "Meta's latest Llama",
        defaultSelected: true,
      },
      {
        id: 'ollama:chat:phi4',
        name: 'Phi-4',
        description: "Microsoft's Phi-4",
      },
      {
        id: 'ollama:chat:qwen2.5',
        name: 'Qwen 2.5',
        description: "Alibaba's Qwen",
      },
      {
        id: 'ollama:chat:mistral',
        name: 'Mistral',
        description: 'Mistral AI model',
      },
    ],
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    description: 'Models via AWS Bedrock',
    icon: '☁️',
    apiKeyEnv: 'AWS_ACCESS_KEY_ID',
    models: [
      {
        id: 'bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude 3.5 Sonnet (Bedrock)',
        description: 'Claude via AWS',
        defaultSelected: true,
      },
      {
        id: 'bedrock:us.meta.llama3-3-70b-instruct-v1:0',
        name: 'Llama 3.3 70B (Bedrock)',
        description: 'Llama via AWS',
      },
    ],
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'OpenAI models via Azure',
    icon: '☁️',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    models: [
      {
        id: 'azure:chat:gpt-4',
        name: 'GPT-4 (Azure)',
        description: 'GPT-4 via Azure deployment',
        config: {
          apiHost: 'YOUR_RESOURCE.openai.azure.com',
        },
        defaultSelected: true,
      },
    ],
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    description: 'Models via HuggingFace Inference',
    icon: '🤗',
    apiKeyEnv: 'HF_API_TOKEN',
    models: [
      {
        id: 'huggingface:text-generation:meta-llama/Meta-Llama-3.1-8B-Instruct',
        name: 'Llama 3.1 8B',
        description: 'Meta Llama via HuggingFace',
        defaultSelected: true,
      },
      {
        id: 'huggingface:text-generation:microsoft/Phi-3-mini-4k-instruct',
        name: 'Phi-3 Mini',
        description: 'Microsoft Phi-3',
      },
    ],
  },
  {
    id: 'custom-http',
    name: 'HTTP Endpoint',
    description: 'Your own HTTP API endpoint',
    icon: '🌐',
    isCustom: true,
    models: [
      {
        id: 'https://example.com/api/chat',
        name: 'Custom HTTP',
        description: 'Enter your API URL',
        defaultSelected: true,
      },
    ],
  },
  {
    id: 'custom-python',
    name: 'Python Script',
    description: 'Local Python provider',
    icon: '🐍',
    isCustom: true,
    models: [
      {
        id: 'file://provider.py',
        name: 'provider.py',
        description: 'Custom Python script',
        defaultSelected: true,
      },
    ],
  },
  {
    id: 'custom-javascript',
    name: 'JavaScript Module',
    description: 'Local JavaScript provider',
    icon: '📜',
    isCustom: true,
    models: [
      {
        id: 'file://provider.js',
        name: 'provider.js',
        description: 'Custom JavaScript module',
        defaultSelected: true,
      },
    ],
  },
];

/**
 * Get a provider family by ID.
 */
export function getProviderFamily(id: string): ProviderFamily | undefined {
  return PROVIDER_CATALOG.find((family) => family.id === id);
}

/**
 * Get default selected models for a provider family.
 */
export function getDefaultModels(familyId: string): string[] {
  const family = getProviderFamily(familyId);
  if (!family) {
    return [];
  }
  return family.models.filter((m) => m.defaultSelected).map((m) => m.id);
}

/**
 * Check if an API key is set for a provider.
 */
export function isApiKeySet(family: ProviderFamily): boolean {
  if (!family.apiKeyEnv) {
    return true; // No API key required
  }
  return Boolean(process.env[family.apiKeyEnv]);
}

/**
 * Get provider families that require API keys but don't have them set.
 */
export function getMissingApiKeys(
  selectedFamilies: string[],
): Array<{ family: string; envVar: string }> {
  const missing: Array<{ family: string; envVar: string }> = [];
  for (const familyId of selectedFamilies) {
    const family = getProviderFamily(familyId);
    if (family?.apiKeyEnv && !isApiKeySet(family)) {
      missing.push({ family: family.name, envVar: family.apiKeyEnv });
    }
  }
  return missing;
}
