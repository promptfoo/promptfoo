/**
 * Provider metadata and utilities for the init wizard.
 *
 * Contains provider choices, categories, and API key status checking.
 */

import { getEnvString } from '../../../envars';
import type { ProviderOptions } from '../../../types/providers';
import type { ProviderChoice, ProviderStatus, UseCase } from '../types';

/**
 * Environment variable mappings for API key detection.
 */
const API_KEY_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  vertex: 'GOOGLE_APPLICATION_CREDENTIALS',
  'google-ai': 'GOOGLE_API_KEY',
  bedrock: 'AWS_ACCESS_KEY_ID',
  azure: 'AZURE_OPENAI_API_KEY',
  cohere: 'COHERE_API_KEY',
  huggingface: 'HF_TOKEN',
  watsonx: 'WATSONX_AI_APIKEY',
};

/**
 * Check if an API key is set for a provider.
 */
export function getProviderStatus(providerId: string): ProviderStatus {
  // Local providers don't need API keys
  if (
    providerId.startsWith('file://') ||
    providerId.startsWith('exec:') ||
    providerId.startsWith('python:') ||
    providerId.startsWith('ollama:') ||
    providerId.startsWith('http://localhost') ||
    providerId.startsWith('https://localhost')
  ) {
    return 'local';
  }

  // Check for API key
  const prefix = providerId.split(':')[0].toLowerCase();
  const envVar = API_KEY_ENV_VARS[prefix];

  if (!envVar) {
    // Unknown provider, assume ready
    return 'ready';
  }

  return getEnvString(envVar) ? 'ready' : 'missing-key';
}

/**
 * Get the environment variable name for a provider's API key.
 */
export function getProviderEnvVar(providerId: string): string | undefined {
  const prefix = providerId.split(':')[0].toLowerCase();
  return API_KEY_ENV_VARS[prefix];
}

/**
 * Provider choices organized by category.
 * Mirrors the choices from src/onboarding.ts but with enhanced metadata.
 */
export function getProviderChoices(useCase: UseCase): ProviderChoice[] {
  const choices: ProviderChoice[] = [];

  // Recommended providers
  choices.push({
    value: ['openai:gpt-5-mini', 'openai:gpt-5'],
    label: "I'll choose later",
    description: 'Default: GPT-5 Mini and GPT-5',
    category: 'recommended',
    status: getProviderStatus('openai:gpt-5-mini'),
    envVar: 'OPENAI_API_KEY',
  });

  // OpenAI
  const openaiValue: (string | ProviderOptions)[] =
    useCase === 'agent'
      ? [
          {
            id: 'openai:gpt-5',
            config: {
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'get_current_weather',
                    description: 'Get the current weather in a given location',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: {
                          type: 'string',
                          description: 'The city and state, e.g. San Francisco, CA',
                        },
                      },
                      required: ['location'],
                    },
                  },
                },
              ],
            },
          },
        ]
      : ['openai:gpt-5-mini', 'openai:gpt-5'];

  choices.push({
    value: openaiValue,
    label: '[OpenAI] GPT 5, GPT 4.1, ...',
    description: 'Most popular choice',
    category: 'cloud',
    vendor: 'OpenAI',
    status: getProviderStatus('openai:gpt-5-mini'),
    envVar: 'OPENAI_API_KEY',
  });

  // Anthropic
  choices.push({
    value: [
      'anthropic:messages:claude-opus-4-5-20251101',
      'anthropic:messages:claude-sonnet-4-5-20250929',
      'anthropic:messages:claude-opus-4-1-20250805',
      'anthropic:messages:claude-3-7-sonnet-20250219',
    ],
    label: '[Anthropic] Claude Opus, Sonnet, Haiku, ...',
    description: 'Advanced reasoning models',
    category: 'cloud',
    vendor: 'Anthropic',
    status: getProviderStatus('anthropic:messages:claude-sonnet'),
    envVar: 'ANTHROPIC_API_KEY',
  });

  // Google
  choices.push({
    value: ['vertex:gemini-2.5-pro'],
    label: '[Google] Gemini 2.5 Pro, ...',
    description: 'Google Cloud AI',
    category: 'cloud',
    vendor: 'Google',
    status: getProviderStatus('vertex:gemini'),
    envVar: 'GOOGLE_APPLICATION_CREDENTIALS',
  });

  // HuggingFace
  choices.push({
    value: [
      'huggingface:text-generation:meta-llama/Meta-Llama-3.1-8B-Instruct',
      'huggingface:text-generation:microsoft/Phi-4-mini-instruct',
      'huggingface:text-generation:google/gemma-3-4b-it',
    ],
    label: '[HuggingFace] Llama, Phi, Gemma, ...',
    description: 'Open source models',
    category: 'cloud',
    vendor: 'HuggingFace',
    status: getProviderStatus('huggingface:text-generation'),
    envVar: 'HF_TOKEN',
  });

  // Azure
  choices.push({
    value: [
      {
        id: 'azure:chat:deploymentNameHere',
        config: {
          apiHost: 'xxxxxxxx.openai.azure.com',
        },
      },
    ],
    label: '[Azure] OpenAI, DeepSeek, Llama, ...',
    description: 'Azure OpenAI Service',
    category: 'cloud',
    vendor: 'Azure',
    status: getProviderStatus('azure:chat'),
    envVar: 'AZURE_OPENAI_API_KEY',
  });

  // AWS Bedrock
  choices.push({
    value: ['bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0'],
    label: '[AWS Bedrock] Claude, Llama, Titan, ...',
    description: 'AWS managed models',
    category: 'cloud',
    vendor: 'AWS',
    status: getProviderStatus('bedrock:us.anthropic'),
    envVar: 'AWS_ACCESS_KEY_ID',
  });

  // Cohere
  choices.push({
    value: ['cohere:command-r', 'cohere:command-r-plus'],
    label: '[Cohere] Command R, Command R+, ...',
    description: 'Enterprise AI',
    category: 'cloud',
    vendor: 'Cohere',
    status: getProviderStatus('cohere:command'),
    envVar: 'COHERE_API_KEY',
  });

  // WatsonX
  choices.push({
    value: [
      'watsonx:meta-llama/llama-3-2-11b-vision-instruct',
      'watsonx:ibm/granite-3-3-8b-instruct',
    ],
    label: '[WatsonX] Llama, IBM Granite, ...',
    description: 'IBM WatsonX AI',
    category: 'cloud',
    vendor: 'IBM',
    status: getProviderStatus('watsonx:meta-llama'),
    envVar: 'WATSONX_AI_APIKEY',
  });

  // Local providers
  choices.push({
    value: ['ollama:chat:llama3.3', 'ollama:chat:phi4'],
    label: '[Ollama] Llama, Qwen, Phi, ...',
    description: 'Run models locally',
    category: 'local',
    status: 'local',
  });

  choices.push({
    value: ['file://provider.py'],
    label: 'Local Python script',
    description: 'Custom Python provider',
    category: 'local',
    status: 'local',
  });

  choices.push({
    value: ['file://provider.js'],
    label: 'Local JavaScript script',
    description: 'Custom JavaScript provider',
    category: 'local',
    status: 'local',
  });

  choices.push({
    value: [process.platform === 'win32' ? 'exec:provider.bat' : 'exec:provider.sh'],
    label: 'Local executable',
    description: 'Custom shell script',
    category: 'local',
    status: 'local',
  });

  // Custom
  choices.push({
    value: ['https://example.com/api/generate'],
    label: 'HTTP endpoint',
    description: 'Custom API endpoint',
    category: 'custom',
    status: 'local',
  });

  return choices;
}

/**
 * Get provider display label for the first provider in a list.
 */
export function getProviderLabel(providers: (string | ProviderOptions)[]): string {
  if (providers.length === 0) {
    return 'None';
  }

  const first = providers[0];
  if (typeof first === 'string') {
    return first;
  }
  return first.id ?? 'Custom';
}

/**
 * Extract provider prefix (e.g., 'openai' from 'openai:gpt-5-mini').
 */
export function getProviderPrefix(provider: string | ProviderOptions): string {
  if (typeof provider === 'string') {
    return provider.split(':')[0];
  }
  return provider.id?.split(':')[0] ?? 'unknown';
}

/**
 * Check if a provider needs a Python script file.
 */
export function needsPythonProvider(providers: (string | ProviderOptions)[]): boolean {
  return providers.some(
    (p) =>
      typeof p === 'string' &&
      (p.startsWith('python:') || (p.startsWith('file://') && p.endsWith('.py'))),
  );
}

/**
 * Check if a provider needs a JavaScript script file.
 */
export function needsJavaScriptProvider(providers: (string | ProviderOptions)[]): boolean {
  return providers.some(
    (p) => typeof p === 'string' && p.startsWith('file://') && p.endsWith('.js'),
  );
}

/**
 * Check if a provider needs an executable script file.
 */
export function needsExecProvider(providers: (string | ProviderOptions)[]): boolean {
  return providers.some((p) => typeof p === 'string' && p.startsWith('exec:'));
}

/**
 * Report warnings for missing API keys based on selected providers.
 * Returns an array of warning messages for providers missing API keys.
 */
export function reportProviderAPIKeyWarnings(
  providers: (string | ProviderOptions)[],
): string[] {
  const ids = providers.map((p) => (typeof p === 'object' ? (p.id ?? '') : p));

  return Object.entries(API_KEY_ENV_VARS)
    .filter(([prefix, envVar]) => ids.some((id) => id.startsWith(prefix)) && !getEnvString(envVar))
    .map(
      ([_prefix, envVar]) =>
        `Warning: ${envVar} environment variable is not set. ` +
        `Please set this environment variable: export ${envVar}=<your-api-key>`,
    );
}
