import { z } from 'zod';
import { getEvalSummaries } from '../../../models/eval';
import { evaluationCache, paginate } from '../lib/performance';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
          'Filter evaluations by dataset ID (SHA256 hash). Example: "0e65b35936119614815dfb3a2bd2c09863d8abbcd32d0cae1e98902b04b5df4e" or leave empty to see all evaluations',
        ),
      page: z
        .int()
        .positive()
        .optional()
        .prefault(1)
        .describe('Page number for pagination (default: 1)'),
      pageSize: z
        .int()
        .min(1)
        .max(100)
        .optional()
        .prefault(20)
        .describe('Number of items per page (1-100, default: 20)'),
    },
    async (args) => {
      const { datasetId, page, pageSize } = args;

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
          recentCount: evals.filter((e) => {
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
