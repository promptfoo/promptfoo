import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { createToolResponse } from '../lib/utils';

/**
 * Tool to retrieve detailed results for a specific evaluation run
 */
export function registerGetEvaluationDetailsTool(server: McpServer) {
  server.tool(
    'get_evaluation_details',
    {
      id: z
        .string()
        .min(1, 'Eval ID cannot be empty')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid eval ID format')
        .describe(
          dedent`
            Unique eval ID (UUID format).
            Example: "eval_abc123def456"
            Get this from list_evaluations.
          `,
        ),
    },
    async (args) => {
      const { id } = args;

      try {
        const result = await readResult(id);

        if (!result) {
          return createToolResponse(
            'get_evaluation_details',
            false,
            {
              providedId: id,
              suggestion: 'Check if the evaluation ID is correct or if it has been deleted.',
            },
            `Evaluation with ID '${id}' not found. Use list_evaluations to find valid IDs.`,
          );
        }

        // Extract key metrics for easier consumption
        const evalData = result.result;
        const summary: any = {
          id,
        };

        // Handle different eval data structures
        if ('results' in evalData && Array.isArray(evalData.results)) {
          summary.totalTests = evalData.results.length;
          summary.passedTests = evalData.results.filter((r: any) => r.success).length;
          summary.failedTests = evalData.results.filter((r: any) => !r.success).length;
        } else {
          summary.totalTests = 0;
          summary.passedTests = 0;
          summary.failedTests = 0;
        }

        if ('table' in evalData && evalData.table) {
          const table = evalData.table as any;
          if (table.head) {
            summary.providers = table.head.providers || [];
            summary.prompts = table.head.prompts?.length || 0;
          } else {
            summary.providers = [];
            summary.prompts = 0;
          }
        } else {
          summary.providers = [];
          summary.prompts = 0;
        }

        return createToolResponse('get_evaluation_details', true, {
          evaluation: evalData,
          summary,
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('database')) {
          return createToolResponse(
            'get_evaluation_details',
            false,
            { originalError: error.message },
            'Failed to access evaluation database. Ensure promptfoo is properly initialized.',
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'get_evaluation_details',
          false,
          undefined,
          `Failed to retrieve evaluation details: ${errorMessage}`,
        );
      }
    },
  );
}
