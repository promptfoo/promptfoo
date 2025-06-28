import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { createToolResponse } from '../utils';

/**
 * Calculate comprehensive statistics and metrics for an evaluation run
 *
 * Use this tool to:
 * - Get pass/fail rates and success metrics
 * - Analyze performance trends
 * - Generate evaluation reports
 * - Compare evaluation results
 * - Monitor model quality over time
 */
export function registerAnalyzeEvaluationMetricsTool(server: McpServer) {
  server.tool(
    'analyze_evaluation_metrics',
    {
      id: z
        .string()
        .min(1, 'Evaluation ID cannot be empty')
        .describe(
          'Evaluation ID to analyze. Example: "eval_abc123" - get from list_evaluations for comprehensive stats',
        ),
    },
    async ({ id }) => {
      try {
        const result = await readResult(id);
        if (!result) {
          return createToolResponse(
            'analyze_evaluation_metrics',
            false,
            undefined,
            'Evaluation not found. Use list_evaluations to find valid IDs.',
          );
        }

        const evalResults = result.result.results?.results || [];

        // Calculate comprehensive statistics
        const totalTests = evalResults.length;
        const passedTests = evalResults.filter((r: any) => r.success === true).length;
        const failedTests = totalTests - passedTests;
        const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        // Group by test case for detailed analysis
        const testCaseGroups = evalResults.reduce<Record<string, unknown[]>>((acc, r: any) => {
          const testCase = r.vars ? JSON.stringify(r.vars) : 'unknown';
          if (!acc[testCase]) {
            acc[testCase] = [];
          }
          acc[testCase].push(r);
          return acc;
        }, {});

        // Calculate additional metrics
        const avgResponseTime =
          evalResults.reduce((sum: number, r: any) => {
            return sum + (r.latencyMs || 0);
          }, 0) / totalTests;

        const totalTokens = evalResults.reduce((sum: number, r: any) => {
          return sum + (r.tokenUsage?.total || 0);
        }, 0);

        const totalCost = evalResults.reduce((sum: number, r: any) => {
          return sum + (r.cost || 0);
        }, 0);

        const stats = {
          id,
          summary: {
            totalTests,
            passedTests,
            failedTests,
            passRate: `${passRate.toFixed(2)}%`,
            testCaseCount: Object.keys(testCaseGroups).length,
          },
          performance: {
            avgResponseTimeMs: Math.round(avgResponseTime),
            totalTokens,
            totalCost: totalCost.toFixed(4),
          },
          metadata: {
            description: result.result.config?.description || 'No description',
            createdAt: (result as any).createdAt || (result as any).timestamp || 'Unknown',
            configFile: (result.result.config as any)?.configPath || 'Unknown',
          },
        };

        return createToolResponse('analyze_evaluation_metrics', true, stats);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('analyze_evaluation_metrics', false, undefined, errorMessage);
      }
    },
  );
}
