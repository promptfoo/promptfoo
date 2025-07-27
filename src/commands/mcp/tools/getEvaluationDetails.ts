import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { AbstractTool } from '../lib/baseTool';
import type { ToolResult } from '../lib/types';

/**
 * Retrieve detailed results and analysis for a specific eval run
 *
 * Use this tool to:
 * - Analyze test results in detail
 * - Review prompt-response pairs
 * - Examine assertion outcomes
 * - Debug failed test cases
 * - Export eval data for reporting
 * 
 * @example
 * // Get details for a specific evaluation
 * await getEvaluationDetails({ id: "eval_abc123def456" })
 */
export class GetEvaluationDetailsTool extends AbstractTool {
  readonly name = 'get_evaluation_details';
  readonly description = 'Retrieve detailed results and analysis for a specific eval run';
  
  protected readonly schema = z.object({
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
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { id } = this.schema.parse(args);
    
    try {
      const result = await readResult(id);
      
      if (!result) {
        return this.error(
          `Evaluation with ID '${id}' not found. Use list_evaluations to find valid IDs.`,
          { providedId: id, suggestion: 'Check if the evaluation ID is correct or if it has been deleted.' }
        );
      }
      
      // Extract key metrics for easier consumption
      const evalData = result.result;
      const summary = {
        id,
        totalTests: evalData.results?.length || 0,
        passedTests: evalData.results?.filter((r: any) => r.success).length || 0,
        failedTests: evalData.results?.filter((r: any) => !r.success).length || 0,
        providers: evalData.providers?.map((p: any) => p.id) || [],
        prompts: evalData.prompts?.length || 0,
      };
      
      return this.success({
        evaluation: evalData,
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
      return this.error(`Failed to retrieve evaluation details: ${errorMessage}`);
    }
  }
}

/**
 * Register the get evaluation details tool with the MCP server
 */
export function registerGetEvaluationDetailsTool(server: McpServer) {
  const tool = new GetEvaluationDetailsTool();
  tool.register(server);
}
