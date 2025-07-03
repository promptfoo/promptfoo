import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { loadApiProvider, loadApiProviders } from '../../../providers';
import type { TestResult } from '../types';
import { createToolResponse, withTimeout } from '../utils';

/**
 * Test AI provider connectivity, response quality, and performance
 *
 * Use this tool to:
 * - Verify provider credentials and connectivity
 * - Test response quality with reasoning tasks
 * - Measure response time and token usage
 * - Debug provider configuration issues
 * - Compare different provider capabilities
 *
 * Supports all promptfoo provider formats including custom providers.
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
            config: z.record(z.unknown()).optional(),
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
        .number()
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .describe(
          dedent`
            Request timeout in milliseconds. 
            Range: 1000-300000 (1s-5min). 
            Default: 30000 (30s). 
            Increase for slower providers.
          `,
        ),
    },
    async ({ provider, testPrompt, timeoutMs = 30000 }) => {
      // Use a comprehensive test prompt that evaluates reasoning, accuracy, and instruction following
      const defaultPrompt =
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
        let providerId: string;
        let providerToLoad: any = provider;

        // Handle different provider formats with better error messages
        if (typeof provider === 'string') {
          providerId = provider;
        } else if (typeof provider === 'object' && provider.id) {
          providerId = provider.id;
          providerToLoad = provider;
        } else {
          return createToolResponse(
            'test_provider',
            false,
            undefined,
            'Invalid provider format. Use string like "openai:gpt-4" or object like {"id": "provider-name", "config": {...}}',
          );
        }

        // Load the provider using the same logic as the main codebase
        let apiProvider;
        try {
          if (typeof providerToLoad === 'string') {
            apiProvider = await loadApiProvider(providerToLoad);
          } else {
            const providers = await loadApiProviders([providerToLoad]);
            apiProvider = providers[0];
          }
        } catch (error) {
          return createToolResponse(
            'test_provider',
            false,
            undefined,
            `Failed to load provider "${providerId}": ${error instanceof Error ? error.message : 'Unknown error'}. Check provider ID format and credentials.`,
          );
        }

        if (!apiProvider) {
          return createToolResponse(
            'test_provider',
            false,
            undefined,
            `Provider "${providerId}" could not be loaded. Verify the provider ID is correct and properly configured.`,
          );
        }

        // Test the provider with timeout and detailed metrics
        const startTime = Date.now();

        try {
          const response = await withTimeout(
            apiProvider.callApi(defaultPrompt),
            timeoutMs,
            `Provider test timed out after ${timeoutMs}ms`,
          );

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          const testResult: TestResult = {
            providerId: typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id,
            success: true,
            responseTime,
            response: response.output,
            tokenUsage: response.tokenUsage,
            cost: response.cost,
            timedOut: false,
            metadata: {
              prompt: defaultPrompt,
              completedAt: new Date(endTime).toISOString(),
              model: (response as any).model || 'unknown',
              responseQuality: response.output?.length > 50 ? 'detailed' : 'brief',
            },
          };

          return createToolResponse('test_provider', true, testResult);
        } catch (error) {
          const endTime = Date.now();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          const timedOut = errorMessage.includes('timed out');

          const testResult: TestResult = {
            providerId: typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id,
            success: false,
            responseTime: endTime - startTime,
            error: errorMessage,
            timedOut,
            metadata: {
              prompt: defaultPrompt,
              failedAt: new Date(endTime).toISOString(),
              timeoutMs,
            },
          };

          return createToolResponse('test_provider', false, testResult);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const providerId =
          typeof provider === 'string' ? provider : (provider as any).id || 'unknown';

        const testResult: TestResult = {
          providerId,
          success: false,
          error: `Unexpected error testing provider: ${errorMessage}`,
          timedOut: false,
        };

        return createToolResponse('test_provider', false, testResult);
      }
    },
  );
}
