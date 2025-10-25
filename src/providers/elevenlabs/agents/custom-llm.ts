/**
 * Custom LLM endpoint support for ElevenLabs Agents
 *
 * Allows using proprietary or custom LLM models with agents
 */

import logger from '../../../logger';
import { fetchWithProxy } from '../../../util/fetch/index';
import { ElevenLabsClient } from '../client';
import type { CustomLLMConfig } from './types';

/**
 * Register a custom LLM endpoint with ElevenLabs
 */
export async function registerCustomLLM(
  client: ElevenLabsClient,
  config: CustomLLMConfig,
): Promise<void> {
  logger.debug('[ElevenLabs Custom LLM] Registering custom LLM endpoint', {
    name: config.name,
    url: config.url,
  });

  // Store API key in workspace secrets if provided
  if (config.apiKey) {
    try {
      await client.post('/workspace/secrets', {
        name: `custom_llm_${config.name}_api_key`,
        value: config.apiKey,
      });

      logger.debug('[ElevenLabs Custom LLM] API key stored in secrets', {
        secretName: `custom_llm_${config.name}_api_key`,
      });
    } catch (error) {
      logger.warn('[ElevenLabs Custom LLM] Failed to store API key in secrets', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Register the custom LLM endpoint
  await client.post('/convai/custom-llm', {
    name: config.name,
    url: config.url,
    model: config.model || 'default',
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 1000,
    headers: config.headers || {},
  });

  logger.debug('[ElevenLabs Custom LLM] Custom LLM registered successfully', {
    name: config.name,
  });
}

/**
 * Validate custom LLM configuration
 */
export function validateCustomLLMConfig(config: CustomLLMConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate name
  if (!config.name || config.name.trim().length === 0) {
    errors.push('Custom LLM name is required');
  }

  // Validate URL
  if (!config.url || config.url.trim().length === 0) {
    errors.push('Custom LLM URL is required');
  } else {
    try {
      new URL(config.url);
    } catch {
      errors.push('Custom LLM URL must be a valid URL');
    }
  }

  // Validate temperature
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  // Validate max tokens
  if (config.maxTokens !== undefined && config.maxTokens <= 0) {
    errors.push('Max tokens must be positive');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test custom LLM endpoint connectivity
 */
export async function testCustomLLMEndpoint(
  url: string,
  apiKey?: string,
  headers?: Record<string, string>,
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const startTime = Date.now();

  try {
    const testHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (apiKey) {
      testHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithProxy(url, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({
        prompt: 'Hello, this is a test message.',
        max_tokens: 10,
      }),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        latency,
      };
    }

    return {
      success: true,
      latency,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      latency: Date.now() - startTime,
    };
  }
}
