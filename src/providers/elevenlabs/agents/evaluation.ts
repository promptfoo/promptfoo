/**
 * Evaluation criteria processing for ElevenLabs Agents
 */

import logger from '../../../logger';

import type { EvaluationResult } from './types';

/**
 * Process evaluation results from agent simulation
 */
export function processEvaluationResults(
  results:
    | Record<
        string,
        {
          criteria_id: string;
          result: 'success' | 'failure';
          rationale?: string;
        }
      >
    | any,
): Map<string, EvaluationResult> {
  // Handle missing or invalid results
  if (!results || typeof results !== 'object') {
    logger.debug('[ElevenLabs Agents] No evaluation results or invalid format', {
      resultsType: typeof results,
    });
    return new Map();
  }

  logger.debug('[ElevenLabs Agents] Processing evaluation results', {
    resultCount: Object.keys(results).length,
  });

  const processed = new Map<string, EvaluationResult>();

  // Results is an object with criterion IDs as keys
  for (const [criterionId, result] of Object.entries(results)) {
    const evaluationResult = result as any;
    const passed = evaluationResult.result === 'success';
    processed.set(criterionId, {
      criterion: evaluationResult.criteria_id || criterionId,
      score: passed ? 1.0 : 0.0, // API doesn't provide numeric scores, map success/failure to 1.0/0.0
      passed,
      feedback: evaluationResult.rationale,
      evidence: undefined, // API doesn't provide evidence array in this format
    });
  }

  return processed;
}

/**
 * Calculate overall evaluation score
 */
export function calculateOverallScore(
  results: Map<string, EvaluationResult>,
  weights?: Map<string, number>,
): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [criterion, result] of results.entries()) {
    const weight = weights?.get(criterion) ?? 1.0;
    totalWeightedScore += result.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}

/**
 * Determine if evaluation passed
 */
export function isEvaluationPassed(
  results: Map<string, EvaluationResult>,
  overallThreshold: number = 0.7,
): boolean {
  // Check if all individual criteria passed
  const allPassed = Array.from(results.values()).every((result) => result.passed);

  // Check if overall score exceeds threshold
  const overallScore = calculateOverallScore(results);
  const scoreAboveThreshold = overallScore >= overallThreshold;

  return allPassed && scoreAboveThreshold;
}

/**
 * Generate evaluation summary report
 */
export function generateEvaluationSummary(results: Map<string, EvaluationResult>): string {
  const lines: string[] = [];
  const overallScore = calculateOverallScore(results);
  const passed = isEvaluationPassed(results);

  lines.push(
    `Overall Score: ${(overallScore * 100).toFixed(1)}% - ${passed ? 'PASSED' : 'FAILED'}`,
  );
  lines.push('');
  lines.push('Criteria Results:');

  for (const [criterion, result] of results.entries()) {
    const status = result.passed ? '✓' : '✗';
    const scorePercent = (result.score * 100).toFixed(1);

    lines.push(`${status} ${criterion}: ${scorePercent}%`);

    if (result.feedback) {
      lines.push(`  Feedback: ${result.feedback}`);
    }

    if (result.evidence && result.evidence.length > 0) {
      lines.push(`  Evidence:`);
      result.evidence.forEach((quote) => {
        lines.push(`    - "${quote}"`);
      });
    }
  }

  return lines.join('\n');
}
