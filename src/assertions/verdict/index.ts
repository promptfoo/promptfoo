/**
 * Verdict assertion handler for Promptfoo
 *
 * Implements a TypeScript port of the Verdict library for scaling judge-time compute
 * Based on https://github.com/haizelabs/verdict
 *
 * @citation
 * Kalra, N., & Tang, L. (2025). VERDICT: A Library for Scaling Judge-Time Compute.
 * arXiv preprint arXiv:2502.18018.
 */

import invariant from '../../util/invariant';
import type { AssertionParams } from '../../types';
import { createPipeline } from './pipeline';
import { PreviousResultsImpl, createUnit } from './units';
import type {
  ExecutionContext,
  Pipeline,
  Unit,
  VerdictConfig,
  VerdictGradingResult,
  VerdictValue,
} from './types';

export const handleVerdict = async ({
  assertion,
  outputString,
  test,
  latencyMs,
}: AssertionParams): Promise<VerdictGradingResult> => {
  invariant(
    typeof assertion.value === 'string' || typeof assertion.value === 'object',
    'verdict assertion must have a string or object value',
  );

  const config = parseVerdictConfig(assertion.value as VerdictValue);
  const threshold = assertion.threshold ?? config.threshold ?? 0.5;

  // Create execution context
  const context: ExecutionContext = {
    test,
    vars: {
      ...test.vars,
      _tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 0,
      },
    },
    previous: new PreviousResultsImpl(),
  };

  // Set provider if specified
  if (config.provider || assertion.provider) {
    const { getAndCheckProvider } = await import('../../matchers');
    context.provider = await getAndCheckProvider(
      'text',
      config.provider || assertion.provider,
      null,
      'verdict assertion',
    );
  }

  try {
    // Execute based on config type
    let result: any;

    if (typeof config.value === 'object' && 'pipeline' in config.value) {
      // Complex pipeline execution
      const pipeline = createPipeline(config.value.pipeline);
      result = await executePipeline(pipeline, outputString, context);
    } else {
      // Simple unit execution
      const unit = createUnitFromConfig(config.value);
      result = await unit.execute({ output: outputString, vars: test.vars }, context);
    }

    // Extract score and determine pass/fail
    const { score, pass, reason } = evaluateResult(result, threshold);

    return {
      assertion,
      pass,
      score,
      reason,
      tokensUsed: context.vars?._tokenUsage,
      verdictDetails: {
        executionTrace: getExecutionTrace(context),
        tokenUsage: context.vars?._tokenUsage,
      },
    };
  } catch (error) {
    return {
      assertion,
      pass: false,
      score: 0,
      reason: `Verdict execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

function parseVerdictConfig(value: string | VerdictValue): VerdictConfig {
  if (typeof value === 'string') {
    // Simple prompt string - default to categorical yes/no
    return {
      value: {
        type: 'categorical',
        prompt: `${value}\n\nResponse: {{ output }}\n\nAnswer with one of: yes, no`,
        categories: ['yes', 'no'],
      },
    };
  }

  // Object configuration
  return { value } as VerdictConfig;
}

function createUnitFromConfig(config: any): Unit {
  // Handle simple type configurations
  if (typeof config === 'object' && config.type) {
    const unitConfig: any = { ...config };

    // Handle scale/categories configuration
    if (config.categories) {
      unitConfig.categories = config.categories;
    }
    if (config.scale) {
      unitConfig.scale = config.scale;
    }

    return createUnit(config.type, unitConfig);
  }

  // Default to categorical judge
  return createUnit('categorical', {
    prompt: String(config),
    categories: ['yes', 'no'],
  });
}

async function executePipeline(
  pipeline: Pipeline,
  outputString: string,
  context: ExecutionContext,
): Promise<any> {
  const input = {
    output: outputString,
    vars: context.test?.vars || {},
  };

  return pipeline.execute(input, context);
}

function evaluateResult(
  result: any,
  threshold: number,
): { score: number; pass: boolean; reason: string } {
  // Handle aggregated results
  if (result._aggregation) {
    if ('score' in result) {
      const rawScore = Number(result.score);
      const normalizedScore = normalizeScore(rawScore, result);
      return {
        score: normalizedScore,
        pass: normalizedScore >= threshold,
        reason: formatAggregationReason(result),
      };
    }
    if ('choice' in result || 'chosen' in result) {
      const choice = result.choice || result.chosen;
      const isPositive = isPositiveChoice(choice);
      return {
        score: isPositive ? 1 : 0,
        pass: isPositive,
        reason: formatAggregationReason(result),
      };
    }
  }

  // Handle single unit results
  if ('score' in result) {
    const rawScore = Number(result.score);
    // Normalize score to 0-1 range if it has scale information
    const normalizedScore = normalizeScore(rawScore, result);
    return {
      score: normalizedScore,
      pass: normalizedScore >= threshold,
      reason: result.explanation || `Score: ${rawScore}${result._scale ? ` (normalized: ${normalizedScore.toFixed(2)})` : ''}`,
    };
  }

  if ('choice' in result || 'chosen' in result) {
    const choice = result.choice || result.chosen;
    
    // For custom categorical judgments (non yes/no), any valid choice is considered a pass
    // The user should use the threshold parameter or specific assertions to check for expected values
    const isYesNoChoice = ['yes', 'no'].includes(choice.toLowerCase());
    
    if (!isYesNoChoice) {
      // Custom categories - consider any choice as pass (score 1)
      return {
        score: 1,
        pass: true,
        reason: formatChoiceReason(choice, result.explanation),
      };
    }
    
    // For yes/no choices, use positive detection
    const isPositive = isPositiveChoice(choice);
    return {
      score: isPositive ? 1 : 0,
      pass: isPositive,
      reason: formatChoiceReason(choice, result.explanation),
    };
  }

  // Fallback
  return {
    score: 0,
    pass: false,
    reason: 'Could not extract verdict result',
  };
}

function isPositiveChoice(choice: string): boolean {
  const positive = ['yes', 'true', 'correct', 'valid', 'good', 'positive', 'a'];
  return positive.includes(choice.toLowerCase());
}

function formatChoiceReason(choice: string, explanation?: string): string {
  if (explanation) {
    // If explanation includes the choice already, just return it
    if (explanation.toLowerCase().includes(choice.toLowerCase())) {
      return explanation;
    }
    // Otherwise format as "Choice: X\n\nReasoning: Y"
    return `Choice: ${choice}\n\nReasoning: ${explanation}`;
  }
  return `Choice: ${choice}`;
}

function normalizeScore(score: number, result: any): number {
  // If no scale info, assume already normalized or use as-is
  if (!result._scale) {
    return score;
  }

  const { min, max } = result._scale;
  
  // Already in 0-1 range
  if (min === 0 && max === 1) {
    return score;
  }
  
  // Normalize to 0-1
  return (score - min) / (max - min);
}

function formatAggregationReason(result: any): string {
  const agg = result._aggregation;

  if (agg.method === 'max-pool') {
    return `Majority vote: ${agg.winner} (${agg.count}/${agg.total} votes)`;
  }

  if (agg.method === 'mean-pool') {
    const normalizedMean = result._scale ? normalizeScore(agg.mean, result) : agg.mean;
    return `Average score: ${agg.mean.toFixed(2)} (normalized: ${normalizedMean.toFixed(2)}, min: ${agg.min}, max: ${agg.max})`;
  }

  if (agg.method === 'weighted-mean-pool') {
    const normalizedMean = result._scale ? normalizeScore(agg.weightedMean, result) : agg.weightedMean;
    return `Weighted average: ${agg.weightedMean.toFixed(2)} (normalized: ${normalizedMean.toFixed(2)})`;
  }

  if (result.explanation) {
    return result.explanation;
  }

  return JSON.stringify(agg);
}

function getExecutionTrace(context: ExecutionContext): any[] {
  const trace: any[] = [];

  if (context.previous) {
    for (const [unit, output] of context.previous.units) {
      trace.push({
        unit: unit.type,
        name: unit.name,
        output,
      });
    }
  }

  return trace;
}

// Re-export types for external use
export * from './types';
export * from './scales';
export { createUnit } from './units';
export { createPipeline, createLayer } from './pipeline';
