import { ResultFailureReason as ResultFailureReasonEnum } from '../../../types/index';

import type {
  EvaluateResult,
  EvaluateSummaryV2,
  EvaluateSummaryV3,
  ResultFailureReason,
} from '../../../types/index';

/**
 * Union type for evaluation summaries
 * The formatter handles both V2 and V3 formats
 */
type EvaluateSummary = EvaluateSummaryV2 | EvaluateSummaryV3;

/**
 * Options for formatting evaluation results
 */
export interface ResultFormattingOptions {
  /** Maximum number of results to include (default: 20) */
  resultLimit?: number;
  /** Number of results to skip for pagination (default: 0) */
  resultOffset?: number;
  /** Maximum number of assertions to show per result (default: 5) */
  assertionLimit?: number;
  /** Maximum length for text truncation (default: 200) */
  maxTextLength?: number;
}

/**
 * Formatted evaluation result for MCP response
 */
export interface FormattedEvalResult {
  index: number;
  testCase: {
    description?: string;
    vars: Record<string, unknown>;
  };
  prompt: {
    label?: string;
    raw: string;
  };
  provider: {
    id: string;
    label?: string;
  };
  response: {
    output: string | null;
    tokenUsage?: unknown;
    cost?: number;
    latencyMs?: number;
  };
  eval: {
    success: boolean;
    score: number;
    namedScores?: Record<string, number>;
    error?: string;
    failureReason?: string;
  };
  assertions: {
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
    componentResults: Array<{
      index: number;
      type: string;
      pass: boolean;
      score: number;
      reason: string;
      metric?: string;
    }>;
  } | null;
}

/**
 * Pagination metadata for results
 */
export interface PaginationInfo {
  totalResults: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  returnedCount: number;
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}

/**
 * Convert numeric ResultFailureReason to string representation
 * Returns undefined for NONE (test passed) or string for ASSERT/ERROR
 */
function formatFailureReason(reason: ResultFailureReason): string | undefined {
  if (reason === ResultFailureReasonEnum.ASSERT) {
    return 'assertion_failed';
  }
  if (reason === ResultFailureReasonEnum.ERROR) {
    return 'error';
  }
  // NONE or unknown - return undefined
  return undefined;
}

/**
 * Format a single evaluation result for MCP response
 */
function formatSingleResult(
  result: EvaluateResult,
  index: number,
  options: ResultFormattingOptions,
): FormattedEvalResult {
  const maxTextLength = options.maxTextLength ?? 200;
  const assertionLimit = options.assertionLimit ?? 5;

  // Format output safely
  let outputText: string | null = null;
  if (result.response?.output) {
    outputText =
      typeof result.response.output === 'string'
        ? truncateText(result.response.output, maxTextLength)
        : truncateText(JSON.stringify(result.response.output), maxTextLength);
  }

  // Format prompt raw text safely
  const promptRaw = result.prompt?.raw ? truncateText(result.prompt.raw, 100) : '';

  // Format assertions if present
  let assertions: FormattedEvalResult['assertions'] = null;
  if (result.gradingResult) {
    const componentResults = result.gradingResult.componentResults || [];
    assertions = {
      totalAssertions: result.testCase.assert?.length || 0,
      passedAssertions: componentResults.filter((r) => r.pass).length,
      failedAssertions: componentResults.filter((r) => !r.pass).length,
      componentResults: componentResults.slice(0, assertionLimit).map((cr, idx) => ({
        index: idx,
        type: result.testCase.assert?.[idx]?.type || 'unknown',
        pass: cr.pass,
        score: cr.score,
        reason: truncateText(cr.reason || '', 100),
        metric: result.testCase.assert?.[idx]?.metric,
      })),
    };
  }

  return {
    index,
    testCase: {
      description: result.testCase.description,
      vars: result.vars,
    },
    prompt: {
      label: result.prompt?.label,
      raw: promptRaw,
    },
    provider: {
      id: result.provider?.id ?? 'unknown',
      label: result.provider?.label,
    },
    response: {
      output: outputText,
      tokenUsage: result.tokenUsage,
      cost: result.cost,
      latencyMs: result.latencyMs,
    },
    eval: {
      success: result.success,
      score: result.score,
      namedScores: result.namedScores,
      error: result.error ?? undefined,
      failureReason: formatFailureReason(result.failureReason),
    },
    assertions,
  };
}

/**
 * Format evaluation results with pagination support
 * This is the single source of truth for result formatting across all MCP tools
 */
export function formatEvaluationResults(
  summary: EvaluateSummary,
  options: ResultFormattingOptions = {},
): {
  results: FormattedEvalResult[];
  pagination: PaginationInfo;
} {
  const limit = Math.min(Math.max(options.resultLimit ?? 20, 1), 100);
  const offset = Math.max(options.resultOffset ?? 0, 0);

  const totalResults = summary.results.length;
  const paginatedResults = summary.results.slice(offset, offset + limit);

  const formattedResults = paginatedResults.map((result, idx) =>
    formatSingleResult(result, offset + idx, options),
  );

  return {
    results: formattedResults,
    pagination: {
      totalResults,
      limit,
      offset,
      hasMore: offset + limit < totalResults,
      returnedCount: formattedResults.length,
    },
  };
}

/**
 * Format prompts summary from evaluation
 */
export function formatPromptsSummary(summary: EvaluateSummary): Array<{
  label?: string;
  provider?: string;
  metrics?: unknown;
}> {
  if (summary.version === 3 && 'prompts' in summary) {
    return summary.prompts.map((prompt) => ({
      label: prompt.label,
      provider: prompt.provider,
      metrics: prompt.metrics,
    }));
  }
  return [];
}
