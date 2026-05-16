import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { EvaluationDetailsSummary } from '../lib/types';

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
        .regex(/^[a-zA-Z0-9_:-]+$/, 'Invalid eval ID format')
        .describe(
          dedent`
            Unique eval ID.
            Example: "eval-8h1-2025-11-15T14:17:18"
            Get this from list_evaluations.
          `,
        ),
      filter: z
        .enum(['all', 'failures', 'passes', 'errors', 'highlights'])
        .optional()
        .default('all')
        .describe('Filter results by status'),
    },
    async (args) => {
      const { id, filter } = args;

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
        const summary = {
          id,
        } as EvaluationDetailsSummary;

        // Handle different eval data structures
        const results =
          'results' in evalData && 'results' in (evalData.results as any)
            ? (evalData.results as any).results
            : 'results' in evalData && Array.isArray(evalData.results)
              ? evalData.results
              : [];

        if (Array.isArray(results)) {
          summary.totalTests = results.length;
          summary.passedTests = results.filter((r: any) => r.success).length;
          summary.failedTests = results.filter((r: any) => !r.success).length;
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

        if (filter && filter !== 'all' && Array.isArray(results)) {
          const filteredResults = results.filter((r: any) => {
            switch (filter) {
              case 'failures':
                return !r.success;
              case 'passes':
                return r.success && !r.error;
              case 'errors':
                return !!r.error;
              case 'highlights':
                return r.metadata?.highlighted || r.metadata?.starred;
              default:
                return true;
            }
          });

          if ('results' in evalData && 'results' in (evalData.results as any)) {
            (evalData.results as any).results = filteredResults;
          } else if ('results' in evalData && Array.isArray(evalData.results)) {
            (evalData as any).results = filteredResults;
          }
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
