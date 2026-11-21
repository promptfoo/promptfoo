import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { redactAzureBlobSasTokens } from '../../../util/sanitizer';
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
            undefined,
            `Evaluation with ID '${id}' not found. Use list_evaluations to find valid IDs.`,
          );
        }

        const evalData = {
          ...result.result,
          config: redactAzureBlobSasTokens(result.result.config),
        };
        const summary: EvaluationDetailsSummary = {
          id,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          // Preserve the MCP summary defaults for persisted evaluations.
          providers: [],
          prompts: 0,
        };

        const rows = evalData.results.results;
        if (Array.isArray(rows)) {
          summary.totalTests = rows.length;
          summary.passedTests = rows.filter((row) => row.success).length;
          summary.failedTests = rows.length - summary.passedTests;

          if (filter && filter !== 'all') {
            evalData.results.results = rows.filter((row) => {
              switch (filter) {
                case 'failures':
                  return !row.success;
                case 'passes':
                  return row.success && !row.error;
                case 'errors':
                  return !!row.error;
                case 'highlights':
                  return row.metadata?.highlighted || row.metadata?.starred;
                default:
                  return true;
              }
            });
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
