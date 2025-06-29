import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getEvalSummaries } from '../../../models/eval';
import { createToolResponse } from '../utils';

/**
 * List and browse evaluation runs in the promptfoo database
 *
 * Use this tool to:
 * - Get an overview of all evaluation runs
 * - Find specific evaluations by dataset
 * - Monitor evaluation history and trends
 * - Identify successful vs failed evaluation runs
 */
export function registerListEvaluationsTool(server: McpServer) {
  server.tool(
    'list_evaluations',
    {
      datasetId: z
        .string()
        .optional()
        .describe(
          'Filter evaluations by dataset ID. Example: "dataset_123" or leave empty to see all evaluations',
        ),
    },
    async ({ datasetId }) => {
      try {
        const evals = await getEvalSummaries(datasetId);
        return createToolResponse('list_evaluations', true, evals);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('list_evaluations', false, undefined, errorMessage);
      }
    },
  );
}
