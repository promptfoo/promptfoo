/**
 * Post-call webhook support for ElevenLabs Agents
 *
 * Enables async notifications after conversations complete
 */

import logger from '../../../logger';
import { fetchWithProxy } from '../../../util/fetch/index';
import { ElevenLabsClient } from '../client';
import type { PostCallWebhookConfig } from './types';

/**
 * Register a post-call webhook for a conversation
 */
export async function registerPostCallWebhook(
  client: ElevenLabsClient,
  conversationId: string,
  config: PostCallWebhookConfig,
): Promise<void> {
  logger.debug('[ElevenLabs Webhooks] Registering post-call webhook', {
    conversationId,
    url: config.url,
    method: config.method || 'POST',
  });

  await client.post(`/convai/conversations/${conversationId}/webhook`, {
    url: config.url,
    method: config.method || 'POST',
    headers: config.headers || {},
    include_transcript: config.includeTranscript !== false,
    include_recording: config.includeRecording || false,
    include_analysis: config.includeAnalysis !== false,
  });

  logger.debug('[ElevenLabs Webhooks] Post-call webhook registered', {
    conversationId,
  });
}

/**
 * Validate webhook configuration
 */
export function validateWebhookConfig(config: PostCallWebhookConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate URL
  if (!config.url || config.url.trim().length === 0) {
    errors.push('Webhook URL is required');
  } else {
    try {
      new URL(config.url);
    } catch {
      errors.push('Webhook URL must be a valid URL');
    }
  }

  // Validate HTTP method
  if (config.method && !['POST', 'PUT'].includes(config.method)) {
    errors.push('Webhook method must be POST or PUT');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test webhook endpoint
 */
export async function testWebhookEndpoint(
  url: string,
  method: 'POST' | 'PUT' = 'POST',
  headers?: Record<string, string>,
): Promise<{
  success: boolean;
  error?: string;
  statusCode?: number;
  latency?: number;
}> {
  const startTime = Date.now();

  try {
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from ElevenLabs integration',
    };

    const response = await fetchWithProxy(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ElevenLabs-Promptfoo/1.0',
        ...headers,
      },
      body: JSON.stringify(testPayload),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status,
        latency,
      };
    }

    return {
      success: true,
      statusCode: response.status,
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

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  event: 'conversation.completed' | 'conversation.failed';
  conversation_id: string;
  timestamp: string;
  agent_id: string;
  transcript?: string;
  recording_url?: string;
  analysis?: {
    call_successful: boolean;
    summary?: string;
    evaluation_results?: Array<{
      criterion: string;
      score: number;
      passed: boolean;
    }>;
    sentiment?: {
      overall: 'positive' | 'neutral' | 'negative';
    };
  };
  metadata?: Record<string, any>;
}

/**
 * Validate webhook payload structure
 */
export function validateWebhookPayload(payload: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate required fields
  if (!payload.event) {
    errors.push('Missing required field: event');
  } else if (!['conversation.completed', 'conversation.failed'].includes(payload.event)) {
    errors.push('Invalid event type');
  }

  if (!payload.conversation_id) {
    errors.push('Missing required field: conversation_id');
  }

  if (!payload.timestamp) {
    errors.push('Missing required field: timestamp');
  }

  if (!payload.agent_id) {
    errors.push('Missing required field: agent_id');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse webhook payload from request
 */
export function parseWebhookPayload(body: string | Record<string, any>): WebhookPayload {
  if (typeof body === 'string') {
    return JSON.parse(body);
  }
  return body as WebhookPayload;
}

/**
 * Webhook retry configuration
 */
export interface WebhookRetryConfig {
  maxRetries: number; // Maximum retry attempts
  retryDelayMs: number; // Initial delay between retries
  backoffMultiplier: number; // Multiply delay by this on each retry
}

/**
 * Default retry configuration
 */
export const DEFAULT_WEBHOOK_RETRY_CONFIG: WebhookRetryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000, // 1 second
  backoffMultiplier: 2, // Exponential backoff
};
