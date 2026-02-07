import type { ProviderOptions } from '../types/providers';

/**
 * Default provider list shown in the eval creator UI.
 * This list can be overridden by server administrators using ui-providers.yaml
 */
export const defaultProviders: ProviderOptions[] = (
  [] as (ProviderOptions & { id: string; label?: string })[]
)
  .concat([
    {
      id: 'openai:gpt-5',
      label: 'OpenAI: GPT-5',
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
      id: 'openai:gpt-5-mini',
      label: 'OpenAI: GPT-5 Mini',
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
      id: 'openai:gpt-5-nano',
      label: 'OpenAI: GPT-5 Nano',
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
      label: 'OpenAI: o3 (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 1024,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
    {
      id: 'openai:o4-mini',
      label: 'OpenAI: o4-mini (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 2048,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
    {
      id: 'openai:o3-mini',
      label: 'OpenAI: o3-mini (with thinking)',
      config: {
        organization: '',
        isReasoningModel: true,
        max_completion_tokens: 2048,
        reasoning_effort: 'medium', // Options: 'low', 'medium', 'high'
      },
    },
  ])
  .concat([
    {
      id: 'anthropic:messages:claude-opus-4-6',
      label: 'Anthropic: Claude 4.6 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-opus-4-5-20251101',
      label: 'Anthropic: Claude 4.5 Opus',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-sonnet-4-5-20250929',
      label: 'Anthropic: Claude 4.5 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-sonnet-4-20250514',
      label: 'Anthropic: Claude 4 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:messages:claude-opus-4-1-20250805',
      label: 'Anthropic: Claude 4.1 Opus',
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
      id: 'anthropic:messages:claude-haiku-4-5-20251001',
      label: 'Anthropic: Claude 4.5 Haiku',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
      },
    },
    {
      id: 'anthropic:claude-agent-sdk',
      label: 'Anthropic: Claude Agent SDK',
      config: {},
    },
  ])
  .concat([
    {
      id: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      label: 'Bedrock: Claude 4.5 Sonnet',
      config: {
        max_tokens: 2048,
        temperature: 0.5,
        region: 'us-east-1',
      },
    },
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
      id: 'bedrock:us.anthropic.claude-opus-4-1-20250805-v1:0',
      label: 'Bedrock: Claude 4.1 Opus',
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
  ])
  .concat([
    {
      id: 'azure:chat:gpt-5',
      label: 'Azure: GPT-5',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-5-mini',
      label: 'Azure: GPT-5 Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-4o',
      label: 'Azure: GPT-4o',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
        temperature: 0.5,
        max_tokens: 1024,
      },
    },
    {
      id: 'azure:chat:gpt-4o-mini',
      label: 'Azure: GPT-4o Mini',
      config: {
        api_host: 'your-resource-name.openai.azure.com',
        api_version: '2025-08-07',
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
  ])
  .concat([
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
  ])
  .concat([
    {
      id: 'vertex:claude-sonnet-4-5@20250929',
      label: 'Vertex: Claude 4.5 Sonnet',
      config: {
        region: 'global',
        anthropic_version: 'vertex-2024-10-22',
        max_tokens: 2048,
        temperature: 0.5,
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
      id: 'vertex:claude-opus-4-1@20250805',
      label: 'Vertex: Claude 4.1 Opus',
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
      id: 'vertex:claude-4-5-haiku@20251001',
      label: 'Vertex: Claude 4.5 Haiku',
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
        region: 'us-central1', // Llama models are only available in this region
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
        region: 'us-central1', // Llama models are only available in this region
      },
    },
  ])
  .concat([
    {
      id: 'openrouter:anthropic/claude-sonnet-4-5-20250929',
      label: 'OpenRouter: Claude 4.5 Sonnet',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-sonnet-4-20250514',
      label: 'OpenRouter: Claude 4 Sonnet',
      config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    {
      id: 'openrouter:anthropic/claude-opus-4-1-20250805',
      label: 'OpenRouter: Claude 4.1 Opus',
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
  ])
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Provider groups for UI organization
 */
export const PROVIDER_GROUPS: Record<string, string> = {
  'openai:': 'OpenAI',
  'anthropic:': 'Anthropic',
  'bedrock:': 'Amazon Web Services',
  'bedrock-agent:': 'Amazon Web Services',
  'azure:': 'Azure',
  'openrouter:': 'OpenRouter',
  'replicate:': 'Replicate',
  'vertex:': 'Google Vertex AI',
};

/**
 * Get the group name for a provider
 */
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
