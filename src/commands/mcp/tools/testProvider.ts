import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { loadApiProvider, loadApiProviders } from '../../../providers';
import { AbstractTool } from '../lib/baseTool';
import type { TestResult, ToolResult } from '../lib/types';

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
 * 
 * @example
 * // Test OpenAI provider
 * await testProvider({ provider: "openai:gpt-4o" })
 * 
 * @example
 * // Test with custom config
 * await testProvider({ 
 *   provider: { id: "custom-provider", config: { apiKey: "..." } },
 *   timeoutMs: 60000 
 * })
 */
export class TestProviderTool extends AbstractTool {
  readonly name = 'test_provider';
  readonly description = 'Test AI provider connectivity, response quality, and performance';
  
  protected readonly schema = z.object({
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
      .default(30000)
      .describe(
        dedent`
          Request timeout in milliseconds. 
          Range: 1000-300000 (1s-5min). 
          Default: 30000 (30s). 
          Increase for slower providers.
        `,
      ),
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { provider, testPrompt, timeoutMs } = this.schema.parse(args);
    
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
      // Extract provider ID for error messages
      const providerId = typeof provider === 'string' ? provider : provider.id;
      
      // Load the provider
      const apiProvider = await this.loadProvider(provider);
      
      // Test the provider with timeout and detailed metrics
      const startTime = Date.now();

      try {
        const response = await this.withTimeout(
          apiProvider.callApi(defaultPrompt),
          timeoutMs,
          `Provider test`
        );

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Evaluate response quality
        const responseQuality = this.evaluateResponseQuality(response.output);

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
            responseQuality,
            promptLength: defaultPrompt.length,
            responseLength: response.output?.length || 0,
          },
        };

        return this.success(testResult);
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
            errorType: timedOut ? 'timeout' : 'api_error',
          },
        };

        return this.error(
          `Provider test failed: ${errorMessage}`,
          testResult
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const providerId = typeof provider === 'string' ? provider : provider.id;

      // Provide specific error guidance
      if (errorMessage.includes('credentials')) {
        return this.error(
          `Invalid credentials for provider "${providerId}". Check your API keys and configuration.`,
          { providerId, suggestion: 'Set the appropriate environment variables or update your config file.' }
        );
      }
      
      if (errorMessage.includes('not found') || errorMessage.includes('unknown provider')) {
        return this.error(
          `Provider "${providerId}" not found. Check the provider ID format.`,
          { 
            providerId, 
            suggestion: 'Use format like "openai:gpt-4" or check available providers with "promptfoo providers"',
            examples: ['openai:gpt-4o', 'anthropic:messages:claude-3-sonnet', 'azure:deployment-name']
          }
        );
      }

      return this.error(
        `Failed to test provider: ${errorMessage}`,
        { providerId, originalError: errorMessage }
      );
    }
  }
  
  private async loadProvider(provider: string | { id: string; config?: Record<string, unknown> }) {
    if (typeof provider === 'string') {
      return await loadApiProvider(provider);
    } else {
      const providers = await loadApiProviders([provider]);
      if (!providers[0]) {
        throw new Error(`Failed to load provider configuration`);
      }
      return providers[0];
    }
  }
  
  private evaluateResponseQuality(response: string | undefined): string {
    if (!response) return 'no_response';
    
    const length = response.length;
    const hasReasoning = response.toLowerCase().includes('step') || 
                        response.toLowerCase().includes('because') ||
                        response.toLowerCase().includes('therefore');
    const hasAnswer = /\b9\b/.test(response); // The correct answer is 9
    
    if (length > 200 && hasReasoning && hasAnswer) return 'excellent';
    if (length > 100 && (hasReasoning || hasAnswer)) return 'good';
    if (length > 50) return 'adequate';
    return 'poor';
  }
}

/**
 * Register the test provider tool with the MCP server
 */
export function registerTestProviderTool(server: McpServer) {
  const tool = new TestProviderTool();
  tool.register(server);
}
