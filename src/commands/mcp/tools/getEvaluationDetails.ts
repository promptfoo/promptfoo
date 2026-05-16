import dedent from 'dedent';
import { z } from 'zod';
import { readResult } from '../../../util/database';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { EvaluationDetailsSummary } from '../lib/types';

function getEvaluationResults(evalData: any) {
  if ('results' in evalData && 'results' in (evalData.results as any)) {
    return (evalData.results as any).results;
  }
  return 'results' in evalData && Array.isArray(evalData.results) ? evalData.results : [];
}

function buildEvaluationDetailsSummary(id: string, evalData: any): EvaluationDetailsSummary {
  const results = getEvaluationResults(evalData);
  const summary = { id } as EvaluationDetailsSummary;
  if (Array.isArray(results)) {
    summary.totalTests = results.length;
    summary.passedTests = results.filter((result: any) => result.success).length;
    summary.failedTests = results.filter((result: any) => !result.success).length;
  } else {
    summary.totalTests = 0;
    summary.passedTests = 0;
    summary.failedTests = 0;
  }
  if ('table' in evalData && evalData.table?.head) {
    summary.providers = evalData.table.head.providers || [];
    summary.prompts = evalData.table.head.prompts?.length || 0;
  } else {
    summary.providers = [];
    summary.prompts = 0;
  }
  return summary;
}

function filterEvaluationResults(evalData: any, filter: string | undefined) {
  const results = getEvaluationResults(evalData);
  if (!filter || filter === 'all' || !Array.isArray(results)) {
    return;
  }
  const filteredResults = results.filter((result: any) => {
    switch (filter) {
      case 'failures':
        return !result.success;
      case 'passes':
        return result.success && !result.error;
      case 'errors':
        return !!result.error;
      case 'highlights':
        return result.metadata?.highlighted || result.metadata?.starred;
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

async function getEvaluationDetailsResponse(id: string, filter: string | undefined) {
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
  const evalData = result.result;
  const summary = buildEvaluationDetailsSummary(id, evalData);
  filterEvaluationResults(evalData, filter);
  return createToolResponse('get_evaluation_details', true, {
    evaluation: evalData,
    summary,
  });
}

function getEvaluationDetailsErrorResponse(error: unknown) {
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
        return await getEvaluationDetailsResponse(id, filter);
      } catch (error: unknown) {
        return getEvaluationDetailsErrorResponse(error);
      }
    },
  );
}
