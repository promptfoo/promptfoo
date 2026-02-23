import dedent from 'dedent';
import { z } from 'zod';
import { loadApiProvider, loadApiProviders } from '../../../providers/index';
import { createToolResponse, withTimeout } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TokenUsage } from '../../../types/index';

interface TestResult {
  providerId: string;
  success: boolean;
  responseTime: number;
  response?: string;
  error?: string;
  tokenUsage?: TokenUsage;
  cost?: number;
  timedOut: boolean;
  metadata: {
    prompt: string;
    completedAt?: string;
    failedAt?: string;
    model?: string;
    responseQuality?: string;
    promptLength?: number;
    responseLength?: number;
    timeoutMs?: number;
    errorType?: string;
    isCustomPrompt?: boolean;
  };
}

async function loadProvider(provider: string | { id: string; config?: Record<string, unknown> }) {
  if (typeof provider === 'string') {
    return await loadApiProvider(provider);
  }
  const providers = await loadApiProviders([provider]);
  if (!providers[0]) {
    throw new Error(`Failed to load provider configuration`);
  }
  return providers[0];
}

function getProviderId(apiProvider: any): string {
  return typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id;
}

function buildProviderLoadErrorResponse(providerId: string, errorMessage: string): object {
  if (errorMessage.includes('credentials')) {
    return createToolResponse(
      'test_provider',
      false,
      {
        providerId,
        suggestion: 'Set the appropriate environment variables or update your config file.',
      },
      `Invalid credentials for provider "${providerId}". Check your API keys and configuration.`,
    );
  }

  if (errorMessage.includes('not found') || errorMessage.includes('unknown provider')) {
    return createToolResponse(
      'test_provider',
      false,
      {
        providerId,
        suggestion:
          'Use format like "openai:gpt-4" or check available providers with "promptfoo providers"',
        examples: ['openai:gpt-4o', 'anthropic:messages:claude-3-sonnet', 'azure:deployment-name'],
      },
      `Provider "${providerId}" not found. Check the provider ID format.`,
    );
  }

  return createToolResponse(
    'test_provider',
    false,
    { providerId, originalError: errorMessage },
    `Failed to test provider: ${errorMessage}`,
  );
}

async function executeProviderTest(
  apiProvider: any,
  prompt: string,
  isCustomPrompt: boolean,
  timeoutMs: number,
): Promise<object> {
  const startTime = Date.now();
  const providerId = getProviderId(apiProvider);

  try {
    const response = await withTimeout(apiProvider.callApi(prompt), timeoutMs, `Provider test`);
    const endTime = Date.now();
    const responseQuality = evaluateResponseQuality(response.output, isCustomPrompt);

    const testResult: TestResult = {
      providerId,
      success: true,
      responseTime: endTime - startTime,
      response: response.output,
      tokenUsage: response.tokenUsage,
      cost: response.cost,
      timedOut: false,
      metadata: {
        prompt,
        completedAt: new Date(endTime).toISOString(),
        model: (response as any).model || 'unknown',
        responseQuality,
        promptLength: prompt.length,
        responseLength: response.output?.length || 0,
        isCustomPrompt,
      },
    };

    return createToolResponse('test_provider', true, testResult);
  } catch (error) {
    const endTime = Date.now();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const timedOut = errorMessage.includes('timed out');

    const testResult: TestResult = {
      providerId,
      success: false,
      responseTime: endTime - startTime,
      error: errorMessage,
      timedOut,
      metadata: {
        prompt,
        failedAt: new Date(endTime).toISOString(),
        timeoutMs,
        errorType: timedOut ? 'timeout' : 'api_error',
      },
    };

    return createToolResponse(
      'test_provider',
      false,
      testResult,
      `Provider test failed: ${errorMessage}`,
    );
  }
}

/**
 * Evaluate response quality based on response characteristics.
 * For custom prompts, we only check response length and structure (not correctness).
 * For the default prompt, we also verify the answer is correct (9).
 */
function evaluateResponseQuality(response: string | undefined, isCustomPrompt: boolean): string {
  if (!response) {
    return 'no_response';
  }

  const length = response.length;
  const lowerResponse = response.toLowerCase();
  const hasReasoning =
    lowerResponse.includes('step') ||
    lowerResponse.includes('because') ||
    lowerResponse.includes('therefore');

  if (isCustomPrompt) {
    if (length > 200 && hasReasoning) {
      return 'excellent';
    }
    if (length > 100) {
      return 'good';
    }
    if (length > 50) {
      return 'adequate';
    }
    return 'poor';
  }

  const hasCorrectAnswer = /\b9\b/.test(response);

  if (length > 200 && hasReasoning && hasCorrectAnswer) {
    return 'excellent';
  }
  if (length > 100 && (hasReasoning || hasCorrectAnswer)) {
    return 'good';
  }
  if (length > 50) {
    return 'adequate';
  }
  return 'poor';
}

/**
 * Tool to test AI provider connectivity and response quality
 */
export function registerTestProviderTool(server: McpServer) {
  server.tool(
    'test_provider',
    {
      provider: z
        .union([
          z.string().min(1, 'Provider ID cannot be empty'),
          z.object({
            id: z.string().min(1, 'Provider ID cannot be empty'),
            config: z.record(z.string(), z.unknown()).optional(),
          }),
        ])
        .describe(
          dedent`
            Provider to test. Examples:
            - "openai:gpt-4o"
            - "anthropic:messages:claude-sonnet-4"
            - {"id": "custom-provider", "config": {...}}
            - path to custom provider file
          `,
        ),
      testPrompt: z
        .string()
        .optional()
        .describe(
          dedent`
            Custom test prompt to evaluate provider response quality.
            Default uses a reasoning test to verify logical thinking capabilities.
          `,
        ),
      timeoutMs: z
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .prefault(30000)
        .describe(
          dedent`
            Request timeout in milliseconds.
            Range: 1000-300000 (1s-5min).
            Default: 30000 (30s).
            Increase for slower providers.
          `,
        ),
    },
    async (args) => {
      const { provider, testPrompt, timeoutMs = 30000 } = args;

      const isCustomPrompt = Boolean(testPrompt);
      const prompt =
        testPrompt ||
        dedent`
          Please solve this step-by-step reasoning problem:

          A farmer has 17 sheep. All but 9 die. How many sheep are left alive?

          Requirements:
          1. Show your step-by-step reasoning
          2. Explain any assumptions you make
          3. Provide the final numerical answer

          This tests logical reasoning, reading comprehension, and instruction following.
        `;

      try {
        const apiProvider = await loadProvider(provider);
        return await executeProviderTest(apiProvider, prompt, isCustomPrompt, timeoutMs);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const providerId = typeof provider === 'string' ? provider : provider.id;
        return buildProviderLoadErrorResponse(providerId, errorMessage);
      }
    },
  );
}
