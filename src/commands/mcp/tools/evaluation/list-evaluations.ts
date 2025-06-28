import { z } from 'zod';
import { getEvalSummaries } from '../../../../models/eval';
import { AbstractTool, NotFoundError } from '../../lib';
import type { EvaluationSummary, ToolResult } from '../../lib/types';

/**
 * List and browse evaluation runs in the promptfoo database
 *
 * Use this tool to:
 * - Get an overview of all evaluation runs
 * - Find specific evaluations by dataset
 * - Monitor evaluation history and trends
 * - Identify successful vs failed evaluation runs
 */
export class ListEvaluationsTool extends AbstractTool {
  readonly name = 'list_evaluations';
  readonly description = 'List and browse evaluation runs with optional dataset filtering';

  protected readonly schema = z.object({
    datasetId: z
      .string()
      .optional()
      .describe(
        'Filter evaluations by dataset ID. Example: "dataset_123" or leave empty to see all evaluations',
      ),
  });

  protected async execute(args: { datasetId?: string }): Promise<ToolResult<EvaluationSummary[]>> {
    try {
      const evaluations = await getEvalSummaries(args.datasetId);

      if (evaluations.length === 0) {
        throw new NotFoundError('Evaluations');
      }

      return this.success(evaluations);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new Error(
        `Failed to retrieve evaluations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
