import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getEvalSummaries } from '../../../models/eval';
import { AbstractTool } from '../lib/baseTool';
import type { ToolResult } from '../lib/types';
import { paginate, evaluationCache } from '../lib/performance';

/**
 * List and browse evaluation runs in the promptfoo database
 *
 * Use this tool to:
 * - Get an overview of all evaluation runs
 * - Find specific evaluations by dataset
 * - Monitor evaluation history and trends
 * - Identify successful vs failed evaluation runs
 * 
 * @example
 * // List all evaluations
 * await listEvaluations({})
 * 
 * @example
 * // List evaluations for a specific dataset
 * await listEvaluations({ datasetId: "dataset_123" })
 * 
 * @example
 * // List evaluations with pagination
 * await listEvaluations({ page: 2, pageSize: 10 })
 */
export class ListEvaluationsTool extends AbstractTool {
  readonly name = 'list_evaluations';
  readonly description = 'List and browse evaluation runs in the promptfoo database';
  
  protected readonly schema = z.object({
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
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { datasetId, page, pageSize } = this.schema.parse(args);
    
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
      
      return this.success({
        evaluations: paginatedResult.data,
        pagination: paginatedResult.pagination,
        summary,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('database')) {
        return this.error(
          'Failed to access evaluation database. Ensure promptfoo is properly initialized.',
          { originalError: error.message }
        );
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.error(`Failed to list evaluations: ${errorMessage}`);
    }
  }
}

/**
 * Register the list evaluations tool with the MCP server
 */
export function registerListEvaluationsTool(server: McpServer) {
  const tool = new ListEvaluationsTool();
  tool.register(server);
}
