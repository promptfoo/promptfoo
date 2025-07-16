import type { ProviderOptions } from '@promptfoo/types';

export interface DefaultProvider extends ProviderOptions {
  id: string;
  label: string;
  config?: Record<string, any>;
}

export const DEFAULT_PROVIDERS: DefaultProvider[] = [
  // OpenAI
  {
    id: 'openai:gpt-4.1',
    label: 'OpenAI: GPT-4.1',
    config: {
      organization: '',
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      function_call: undefined,
      functions: undefined,
      stop: undefined,
    },
  },
  {
    id: 'openai:gpt-4.1-mini',
    label: 'OpenAI: GPT-4.1 Mini',
    config: {
      organization: '',
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
  {
    id: 'openai:gpt-4.1-nano',
    label: 'OpenAI: GPT-4.1 Nano',
    config: {
      organization: '',
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
  {
    id: 'openai:gpt-4o',
    label: 'OpenAI: GPT-4o',
    config: {
      organization: '',
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      function_call: undefined,
      functions: undefined,
      stop: undefined,
    },
  },
  {
    id: 'openai:gpt-4o-mini',
    label: 'OpenAI: GPT-4o Mini',
    config: {
      organization: '',
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
  {
    id: 'openai:o3',
    label: 'OpenAI: GPT-o3 (with thinking)',
    config: {
      organization: '',
      isReasoningModel: true,
      max_completion_tokens: 1024,
      reasoning_effort: 'medium',
    },
  },
  {
    id: 'openai:o4-mini',
    label: 'OpenAI: GPT-o4 Mini (with thinking)',
    config: {
      organization: '',
      isReasoningModel: true,
      max_completion_tokens: 2048,
      reasoning_effort: 'medium',
    },
  },
  {
    id: 'openai:o3-mini',
    label: 'OpenAI: GPT-o3 Mini (with thinking)',
    config: {
      organization: '',
      isReasoningModel: true,
      max_completion_tokens: 2048,
      reasoning_effort: 'medium',
    },
  },
  // Anthropic
  {
    id: 'anthropic:messages:claude-sonnet-4-20250514',
    label: 'Anthropic: Claude 4 Sonnet',
    config: {
      max_tokens: 2048,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-opus-4-20250514',
    label: 'Anthropic: Claude 4 Opus',
    config: {
      max_tokens: 2048,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-sonnet-4-20250514',
    label: 'Anthropic: Claude 4 Sonnet (with thinking)',
    config: {
      max_tokens: 8192,
      temperature: 1.0,
      thinking: {
        type: 'enabled',
        budget_tokens: 4096,
      },
      showThinking: true,
    },
  },
  {
    id: 'anthropic:messages:claude-3-7-sonnet-20250219',
    label: 'Anthropic: Claude 3.7 Sonnet',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-3-7-sonnet-20250219',
    label: 'Anthropic: Claude 3.7 Sonnet (with thinking)',
    config: {
      max_tokens: 2048,
      temperature: 1.0,
      thinking: {
        type: 'enabled',
        budget_tokens: 1024,
      },
      showThinking: true,
    },
  },
  {
    id: 'anthropic:messages:claude-3-5-sonnet-20241022',
    label: 'Anthropic: Claude 3.5 Sonnet',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-3-5-sonnet-20240620',
    label: 'Anthropic: Claude 3.5 Sonnet (June)',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'anthropic:messages:claude-3-5-haiku-20241022',
    label: 'Anthropic: Claude 3.5 Haiku',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  // AWS Bedrock
  {
    id: 'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
    label: 'Bedrock: Claude 4 Sonnet',
    config: {
      max_tokens: 2048,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.anthropic.claude-opus-4-20250514-v1:0',
    label: 'Bedrock: Claude 4 Opus',
    config: {
      max_tokens: 2048,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0',
    label: 'Bedrock: Claude 4 Sonnet (with thinking)',
    config: {
      max_tokens: 8192,
      temperature: 1.0,
      region: 'us-east-1',
      thinking: {
        type: 'enabled',
        budget_tokens: 4096,
      },
      showThinking: true,
    },
  },
  {
    id: 'bedrock:us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    label: 'Bedrock: Claude 3.7 Sonnet',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      anthropic_version: 'bedrock-2023-05-31',
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    label: 'Bedrock: Claude 3.7 Sonnet (with thinking)',
    config: {
      max_tokens: 2048,
      temperature: 1.0,
      anthropic_version: 'bedrock-2023-05-31',
      region: 'us-east-1',
      thinking: {
        type: 'enabled',
        budget_tokens: 1024,
      },
      showThinking: true,
    },
  },
  {
    id: 'bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    label: 'Bedrock: Claude 3.5 Sonnet',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      anthropic_version: 'bedrock-2023-05-31',
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.meta.llama3-2-3b-instruct-v1:0',
    label: 'Bedrock: Llama 3.2 (3B)',
    config: {
      temperature: 0.7,
      top_p: 0.9,
      max_new_tokens: 1024,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.meta.llama3-2-90b-instruct-v1:0',
    label: 'Bedrock: Llama 3.2 (90B)',
    config: {
      temperature: 0.7,
      top_p: 0.9,
      max_new_tokens: 1024,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.meta.llama3-3-70b-instruct-v1:0',
    label: 'Bedrock: Llama 3.3 (70B)',
    config: {
      temperature: 0.7,
      top_p: 0.9,
      max_new_tokens: 1024,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.meta.llama3-3-8b-instruct-v1:0',
    label: 'Bedrock: Llama 3.3 (8B)',
    config: {
      temperature: 0.7,
      top_p: 0.9,
      max_new_tokens: 1024,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.amazon.nova-pro-v1:0',
    label: 'Bedrock: Amazon Titan Nova Pro',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.amazon.nova-lite-v1:0',
    label: 'Bedrock: Amazon Titan Nova Lite',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.amazon.nova-micro-v1:0',
    label: 'Bedrock: Amazon Titan Nova Micro',
    config: {
      max_tokens: 1024,
      temperature: 0.5,
      region: 'us-east-1',
    },
  },
  {
    id: 'bedrock:us.amazon.nova-sonic-v1:0',
    label: 'Bedrock: Amazon Nova Sonic',
    config: {
      inferenceConfiguration: {
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.95,
      },
      textOutputConfiguration: {
        mediaType: 'text/plain',
      },
      region: 'us-east-1',
    },
  },
  // Azure
  {
    id: 'azure:chat:gpt-4.1',
    label: 'Azure: GPT-4.1',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-02-15-preview',
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'azure:chat:gpt-4.1-mini',
    label: 'Azure: GPT-4.1 Mini',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-02-15-preview',
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'azure:chat:gpt-4o',
    label: 'Azure: GPT-4o',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-02-15-preview',
      temperature: 0.5,
      max_tokens: 1024,
    },
  },
  {
    id: 'azure:chat:gpt-4o-mini',
    label: 'Azure: GPT-4o Mini',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-02-15-preview',
      temperature: 0.5,
      max_tokens: 2048,
    },
  },
  {
    id: 'azure:chat:o4-mini',
    label: 'Azure: O4 Mini',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-05-15-preview',
      temperature: 0.5,
      max_tokens: 4096,
    },
  },
  {
    id: 'azure:chat:o3-mini',
    label: 'Azure: O3 Mini',
    config: {
      api_host: 'your-resource-name.openai.azure.com',
      api_version: '2024-05-15-preview',
      temperature: 0.5,
      max_tokens: 4096,
    },
  },
  // Google Vertex AI
  {
    id: 'vertex:gemini-2.5-pro-exp-03-25',
    label: 'Vertex: Gemini 2.5 Pro (Exp)',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    },
  },
  {
    id: 'vertex:gemini-2.5-pro',
    label: 'Vertex: Gemini 2.5 Pro',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    },
  },
  {
    id: 'vertex:gemini-2.5-flash',
    label: 'Vertex: Gemini 2.5 Flash',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    },
  },
  {
    id: 'vertex:gemini-2.0-pro',
    label: 'Vertex: Gemini 2.0 Pro',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    },
  },
  {
    id: 'vertex:gemini-2.0-flash-001',
    label: 'Vertex: Gemini 2.0 Flash',
    config: {
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
    },
  },
  {
    id: 'vertex:claude-sonnet-4@20250514',
    label: 'Vertex: Claude 4 Sonnet',
    config: {
      region: 'global',
      anthropic_version: 'vertex-2024-10-22',
      max_tokens: 2048,
      temperature: 0.5,
    },
  },
  {
    id: 'vertex:claude-opus-4@20250514',
    label: 'Vertex: Claude 4 Opus',
    config: {
      region: 'global',
      anthropic_version: 'vertex-2024-10-22',
      max_tokens: 2048,
      temperature: 0.5,
    },
  },
  {
    id: 'vertex:claude-3-5-sonnet-v2@20241022',
    label: 'Vertex: Claude 3.5 Sonnet',
    config: {
      region: 'us-east5',
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'vertex:claude-3-5-haiku@20241022',
    label: 'Vertex: Claude 3.5 Haiku',
    config: {
      region: 'us-east5',
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 1024,
      temperature: 0.5,
    },
  },
  {
    id: 'vertex:llama-3.3-70b-instruct-maas',
    label: 'Vertex: Llama 3.3 (70B)',
    config: {
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
      region: 'us-central1',
    },
  },
  {
    id: 'vertex:llama-3.3-8b-instruct-maas',
    label: 'Vertex: Llama 3.3 (8B)',
    config: {
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
      region: 'us-central1',
    },
  },
  // OpenRouter
  {
    id: 'openrouter:anthropic/claude-sonnet-4-20250514',
    label: 'OpenRouter: Claude 4 Sonnet',
    config: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
  {
    id: 'openrouter:anthropic/claude-opus-4-20250514',
    label: 'OpenRouter: Claude 4 Opus',
    config: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
  {
    id: 'openrouter:anthropic/claude-3-5-sonnet',
    label: 'OpenRouter: Claude 3.5 Sonnet',
    config: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
  {
    id: 'openrouter:meta-llama/llama-3.1-405b-instruct',
    label: 'OpenRouter: Llama 3.1 405B',
    config: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
  {
    id: 'openrouter:mistralai/mistral-large-2402',
    label: 'OpenRouter: Mistral Large',
    config: {
      temperature: 0.7,
      max_tokens: 4096,
    },
  },
  {
    id: 'openrouter:google/gemini-1.5-pro',
    label: 'OpenRouter: Gemini 1.5 Pro',
    config: {
      temperature: 0.7,
      max_tokens: 8192,
    },
  },
].sort((a, b) => a.id.localeCompare(b.id));

export const PROVIDER_GROUPS: Record<string, string> = {
  'openai:': 'OpenAI',
  'anthropic:': 'Anthropic',
  'bedrock:': 'Amazon Web Services',
  'azure:': 'Azure',
  'openrouter:': 'OpenRouter',
  'replicate:': 'Replicate',
  'vertex:': 'Google Vertex AI',
};

export function getProviderGroup(option: string | ProviderOptions): string {
  if (!option) {
    return 'Other';
  }

  let id = '';
  if (typeof option === 'string') {
    id = option;
  } else if (option && typeof option === 'object' && option.id) {
    id = option.id as string;
  }

  for (const prefix in PROVIDER_GROUPS) {
    if (id && typeof id === 'string' && id.indexOf(prefix) === 0) {
      return PROVIDER_GROUPS[prefix];
    }
  }

  return 'Other';
}

export function getProviderLabel(option: string | ProviderOptions): string {
  if (!option) {
    return '';
  }

  if (typeof option === 'string') {
    // Try to find a matching default provider
    const defaultProvider = DEFAULT_PROVIDERS.find((p) => p.id === option);
    return defaultProvider?.label || option;
  }

  if (typeof option === 'object' && option) {
    return option.label || option.id || '';
  }

  return '';
}

export function getProviderId(option: string | ProviderOptions): string {
  if (!option) {
    return '';
  }

  if (typeof option === 'string') {
    return option;
  }

  if (typeof option === 'object' && option) {
    return option.id || '';
  }

  return '';
}

// Helper to convert simple provider options for the redteam setup
export function toSimpleProviderList(): Array<{ value: string; label: string }> {
  return DEFAULT_PROVIDERS.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));
}
