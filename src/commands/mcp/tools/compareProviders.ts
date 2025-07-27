import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { loadApiProviders } from '../../../providers';
import { createToolResponse } from '../lib/utils';
import { withTimeout } from '../lib/utils';

/**
 * Tool to compare multiple AI providers side-by-side
 */
export function registerCompareProvidersTool(server: McpServer) {
  server.tool(
    'compare_providers',
    {
      providers: z
        .array(z.string().min(1))
        .min(2, 'At least 2 providers required for comparison')
        .max(10, 'Maximum 10 providers for comparison')
        .describe(
          dedent`
            List of providers to compare.
            Examples: ["openai:gpt-4o", "anthropic:claude-3-sonnet", "google:gemini-pro"]
          `,
        ),

      testPrompt: z
        .string()
        .min(1, 'Test prompt cannot be empty')
        .describe('The prompt to test all providers with'),

      evaluationCriteria: z
        .array(z.string())
        .optional()
        .describe(
          dedent`
            Specific criteria to evaluate responses.
            Examples: ["accuracy", "creativity", "response_time", "cost_efficiency"]
          `,
        ),

      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .default(30000)
        .describe('Timeout for each provider in milliseconds (default: 30000)'),
    },
    async (args) => {
      const { providers, testPrompt, evaluationCriteria, timeoutMs = 30000 } = args;

      try {
        // Load all providers
        const apiProviders = await loadApiProviders(providers.map((p) => ({ id: p })));

        if (apiProviders.length !== providers.length) {
          return createToolResponse(
            'compare_providers',
            false,
            { requestedProviders: providers },
            `Failed to load all providers. Loaded ${apiProviders.length} out of ${providers.length}`,
          );
        }

        // Test each provider in parallel
        const startTime = Date.now();
        const results = await Promise.allSettled(
          apiProviders.map(async (provider) => {
            const providerStartTime = Date.now();

            try {
              const response = await withTimeout(
                provider.callApi(testPrompt),
                timeoutMs,
                `Provider ${provider.id} test`,
              );

              const providerEndTime = Date.now();

              return {
                providerId: typeof provider.id === 'function' ? provider.id() : provider.id,
                success: true,
                response: response.output,
                responseTime: providerEndTime - providerStartTime,
                tokenUsage: response.tokenUsage,
                cost: response.cost,
                model: (response as any).model,
              };
            } catch (error) {
              const providerEndTime = Date.now();
              return {
                providerId: typeof provider.id === 'function' ? provider.id() : provider.id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                responseTime: providerEndTime - providerStartTime,
              };
            }
          }),
        );

        const totalTime = Date.now() - startTime;

        // Process results
        const processedResults = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              providerId: providers[index],
              success: false,
              error: result.reason?.message || 'Failed to execute',
            };
          }
        });

        // Generate comparison analysis
        const analysis = analyzeResults(processedResults, evaluationCriteria);

        return createToolResponse('compare_providers', true, {
          comparison: processedResults,
          analysis,
          summary: {
            totalProviders: providers.length,
            successfulResponses: processedResults.filter((r) => r.success).length,
            failedResponses: processedResults.filter((r) => !r.success).length,
            totalExecutionTime: totalTime,
            testPrompt,
          },
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        if (errorMessage.includes('provider')) {
          return createToolResponse(
            'compare_providers',
            false,
            {
              originalError: errorMessage,
              suggestion: 'Check provider IDs and ensure all providers are properly configured',
            },
            'Failed to load one or more providers',
          );
        }

        return createToolResponse(
          'compare_providers',
          false,
          undefined,
          `Failed to compare providers: ${errorMessage}`,
        );
      }
    },
  );
}

function analyzeResults(results: any[], criteria?: string[]): any {
  const analysis: any = {
    rankings: {},
    insights: [],
  };

  // Rank by response time
  const successfulResults = results.filter((r) => r.success);

  if (successfulResults.length > 0) {
    // Response time ranking
    const byResponseTime = [...successfulResults].sort((a, b) => a.responseTime - b.responseTime);
    analysis.rankings.responseTime = byResponseTime.map((r, i) => ({
      rank: i + 1,
      providerId: r.providerId,
      responseTime: r.responseTime,
    }));

    // Cost ranking (if available)
    const withCost = successfulResults.filter((r) => r.cost !== undefined);
    if (withCost.length > 0) {
      const byCost = [...withCost].sort((a, b) => (a.cost || 0) - (b.cost || 0));
      analysis.rankings.cost = byCost.map((r, i) => ({
        rank: i + 1,
        providerId: r.providerId,
        cost: r.cost,
      }));
    }

    // Response length as a proxy for detail
    const byResponseLength = [...successfulResults].sort(
      (a, b) => (b.response?.length || 0) - (a.response?.length || 0),
    );
    analysis.rankings.responseDetail = byResponseLength.map((r, i) => ({
      rank: i + 1,
      providerId: r.providerId,
      responseLength: r.response?.length || 0,
    }));

    // Generate insights
    const fastestProvider = byResponseTime[0];
    const slowestProvider = byResponseTime[byResponseTime.length - 1];

    analysis.insights.push(
      `Fastest provider: ${fastestProvider.providerId} (${fastestProvider.responseTime}ms)`,
    );

    if (byResponseTime.length > 1) {
      const speedDiff = slowestProvider.responseTime - fastestProvider.responseTime;
      analysis.insights.push(`Speed difference: ${speedDiff}ms between fastest and slowest`);
    }

    if (withCost.length > 0) {
      const cheapest = analysis.rankings.cost[0];
      analysis.insights.push(
        `Most cost-effective: ${cheapest.providerId} ($${cheapest.cost?.toFixed(4) || '0'})`,
      );
    }
  }

  // Add criteria-specific analysis if provided
  if (criteria && criteria.length > 0) {
    analysis.customCriteria = criteria;
    analysis.insights.push(`Custom evaluation criteria provided: ${criteria.join(', ')}`);
  }

  return analysis;
}
