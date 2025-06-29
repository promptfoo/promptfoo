import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { createToolResponse } from '../utils';

/**
 * Retrieve detailed results and analysis for a specific eval run
 *
 * Use this tool to:
 * - Analyze test results in detail
 * - Review prompt-response pairs
 * - Examine assertion outcomes
 * - Debug failed test cases
 * - Export eval data for reporting
 */
export function registerGetEvaluationDetailsTool(server: McpServer) {
  server.tool(
    'get_evaluation_details',
    {
      id: z
        .string()
        .min(1, 'Eval ID cannot be empty')
        .describe(
          dedent`
            Unique eval ID (UUID format). 
            Example: "eval_abc123def456" 
            Get this from list_evaluations.
          `,
        ),
    },
    async ({ id }) => {
      try {
        const result = await readResult(id);
        if (!result) {
          return createToolResponse(
            'get_evaluation_details',
            false,
            undefined,
            'Eval not found. Use list_evaluations to find valid IDs.',
          );
        }
        return createToolResponse('get_evaluation_details', true, result.result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('get_evaluation_details', false, undefined, errorMessage);
      }
    },
  );
}
