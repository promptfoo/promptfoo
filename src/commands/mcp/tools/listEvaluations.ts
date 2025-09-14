import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getEvalSummaries } from '../../../models/eval';
import { evaluationCache, paginate } from '../lib/performance';
import { createToolResponse } from '../lib/utils';

/**
 * Tool to list and browse evaluation runs
 * Provides filtered views and pagination support
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
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe('Page number for pagination (default: 1)'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Number of items per page (1-100, default: 20)'),
    },
    async (args) => {
      const { datasetId, page = 1, pageSize = 20 } = args;

      try {
        // Check cache first
        const cacheKey = `evals:${datasetId || 'all'}`;
        let evals = evaluationCache.get(cacheKey);

        if (!evals) {
          // Fetch from database
          evals = await getEvalSummaries(datasetId);

          // Cache the results
          evaluationCache.set(cacheKey, evals);
        }

        // Apply pagination
        const paginatedResult = paginate(evals, { page, pageSize });

        // Add helpful summary information
        const summary = {
          totalCount: paginatedResult.pagination.totalItems,
          recentCount: evals.filter((e: any) => {
            const createdAt = new Date(e.createdAt);
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return createdAt > dayAgo;
          }).length,
          datasetId: datasetId || 'all',
          cacheStats: evaluationCache.getStats(),
        };

        return createToolResponse('list_evaluations', true, {
          evaluations: paginatedResult.data,
          pagination: paginatedResult.pagination,
          summary,
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('database')) {
          return createToolResponse(
            'list_evaluations',
            false,
            { originalError: error.message },
            'Failed to access evaluation database. Ensure promptfoo is properly initialized.',
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'list_evaluations',
          false,
          undefined,
          `Failed to list evaluations: ${errorMessage}`,
        );
      }
    },
  );
}
