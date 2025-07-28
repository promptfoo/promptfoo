/**
 * Aggregation unit implementations for Verdict
 * Based on verdict/common/model_ensemble.py and verdict/common/ensemble_verify.py
 */

import { BaseUnit } from './base';
import type { ExecutionContext, UnitConfig, UnitInput, UnitOutput } from '../types';

interface AggregateInput extends UnitInput {
  results: UnitOutput[];
}

// ==================== Max Pool Unit (Majority Vote) ====================

export class MaxPoolUnit extends BaseUnit<AggregateInput, UnitOutput> {
  type = 'max-pool';

  async execute(input: AggregateInput, context: ExecutionContext): Promise<UnitOutput> {
    const results = this.getResults(input, context);

    if (results.length === 0) {
      throw new Error('MaxPoolUnit requires at least one result to aggregate');
    }

    // Count votes for each value
    const votes = new Map<string, number>();
    const resultMap = new Map<string, UnitOutput>();

    for (const result of results) {
      const key = this.getVoteKey(result);
      votes.set(key, (votes.get(key) || 0) + 1);
      resultMap.set(key, result); // Keep last result for each key
    }

    // Find the most common
    let maxVotes = 0;
    let winner: string | undefined;

    for (const [key, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = key;
      }
    }

    if (!winner) {
      throw new Error('Could not determine winner in MaxPoolUnit');
    }

    // Return the result that won
    const winningResult = resultMap.get(winner)!;
    return {
      ...winningResult,
      _aggregation: {
        method: 'max-pool',
        votes: Object.fromEntries(votes),
        winner,
        count: maxVotes,
        total: results.length,
      },
    };
  }

  protected getResults(input: AggregateInput, context: ExecutionContext): UnitOutput[] {
    // If results are provided directly, use them
    if (input.results && input.results.length > 0) {
      return input.results;
    }

    // Otherwise, get all previous results
    if (context.previous) {
      const allResults: UnitOutput[] = [];
      for (const [_, output] of context.previous.units) {
        allResults.push(output);
      }
      return allResults;
    }

    return [];
  }

  protected getVoteKey(result: UnitOutput): string {
    // For different result types, extract the key to vote on
    if ('choice' in result && result.choice) {
      return String(result.choice);
    }
    if ('score' in result && result.score !== undefined) {
      return String(result.score);
    }
    if ('chosen' in result && result.chosen) {
      return String(result.chosen);
    }

    // Fallback to JSON representation
    return JSON.stringify(result);
  }

  // No prompt needed for aggregation
  protected async preparePrompt(input: AggregateInput, context: ExecutionContext): Promise<string> {
    return '';
  }

  // Override to skip API call
  validate(): void {}
  process(input: AggregateInput, response: any): UnitOutput {
    return response;
  }
}

// ==================== Mean Pool Unit ====================

interface MeanPoolOutput extends UnitOutput {
  score: number;
  scores: number[];
  _aggregation?: any;
  _scale?: {
    min: number;
    max: number;
  };
}

export class MeanPoolUnit extends BaseUnit<AggregateInput, MeanPoolOutput> {
  type = 'mean-pool';

  async execute(input: AggregateInput, context: ExecutionContext): Promise<MeanPoolOutput> {
    const results = this.getResults(input, context);

    if (results.length === 0) {
      throw new Error('MeanPoolUnit requires at least one result to aggregate');
    }

    // Extract scores
    const scores: number[] = [];
    for (const result of results) {
      const score = this.extractScore(result);
      if (score !== undefined) {
        scores.push(score);
      }
    }

    if (scores.length === 0) {
      throw new Error('No numeric scores found to average');
    }

    // Calculate mean
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / scores.length;

    // Extract scale information from results if available
    let scaleInfo: { min: number; max: number } | undefined;
    for (const result of results) {
      if (result._scale) {
        scaleInfo = result._scale;
        break;
      }
    }

    return {
      score: mean,
      scores,
      _aggregation: {
        method: 'mean-pool',
        count: scores.length,
        sum,
        mean,
        min: Math.min(...scores),
        max: Math.max(...scores),
      },
      _scale: scaleInfo,
    };
  }

  protected getResults(input: AggregateInput, context: ExecutionContext): UnitOutput[] {
    if (input.results && input.results.length > 0) {
      return input.results;
    }

    if (context.previous) {
      const allResults: UnitOutput[] = [];
      for (const [_, output] of context.previous.units) {
        allResults.push(output);
      }
      return allResults;
    }

    return [];
  }

  protected extractScore(result: UnitOutput): number | undefined {
    if ('score' in result && typeof result.score === 'number') {
      return result.score;
    }
    if ('score' in result && typeof result.score === 'string') {
      const parsed = parseFloat(result.score);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    
    // Handle categorical results
    if ('choice' in result) {
      const choice = String(result.choice).toLowerCase();
      if (choice === 'yes' || choice === 'true' || choice === 'correct' || choice === 'valid') {
        return 1;
      } else if (choice === 'no' || choice === 'false' || choice === 'incorrect' || choice === 'invalid') {
        return 0;
      }
    }
    
    return undefined;
  }

  protected async preparePrompt(input: AggregateInput, context: ExecutionContext): Promise<string> {
    return '';
  }

  validate(): void {}
  process(input: AggregateInput, response: any): MeanPoolOutput {
    return response;
  }
}

// ==================== Weighted Mean Pool Unit ====================

interface WeightedMeanPoolConfig extends UnitConfig {
  weights?: Record<string, number> | number[];
}

export class WeightedMeanPoolUnit extends MeanPoolUnit {
  type = 'weighted-mean-pool';
  weights: Record<string, number> | number[];

  constructor(config: WeightedMeanPoolConfig = {}) {
    super(config);
    this.weights = config.weights || {};
  }

  async execute(input: AggregateInput, context: ExecutionContext): Promise<MeanPoolOutput> {
    const results = this.getResults(input, context);

    if (results.length === 0) {
      throw new Error('WeightedMeanPoolUnit requires at least one result to aggregate');
    }

    // Extract scores and weights
    const scores: number[] = [];
    const weights: number[] = [];

    if (Array.isArray(this.weights)) {
      // Array weights - use by index
      for (let i = 0; i < results.length; i++) {
        const score = this.extractScore(results[i]);
        if (score !== undefined) {
          scores.push(score);
          weights.push(i < this.weights.length ? this.weights[i] : 1);
        }
      }
    } else {
      // Object weights - use by unit name
      for (const result of results) {
        const score = this.extractScore(result);
        if (score !== undefined) {
          scores.push(score);

          // Find weight by checking _unitName in result
          const unitName = (result as any)._unitName;
          const weight = unitName && this.weights[unitName] ? this.weights[unitName] : 1;
          weights.push(weight);
        }
      }
    }

    if (scores.length === 0) {
      throw new Error('No numeric scores found to average');
    }

    // Calculate weighted mean
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
      totalWeight += weights[i];
    }

    const weightedMean = weightedSum / totalWeight;

    // Extract scale information from results if available
    let scaleInfo: { min: number; max: number } | undefined;
    for (const result of results) {
      if (result._scale) {
        scaleInfo = result._scale;
        break;
      }
    }

    return {
      score: weightedMean,
      scores,
      _aggregation: {
        method: 'weighted-mean-pool',
        count: scores.length,
        weights,
        weightedSum,
        totalWeight,
        weightedMean,
      },
      _scale: scaleInfo,
    };
  }
}

// ==================== Min Pool Unit ====================

export class MinPoolUnit extends BaseUnit<AggregateInput, UnitOutput> {
  type = 'min-pool';

  async execute(input: AggregateInput, context: ExecutionContext): Promise<UnitOutput> {
    const results = this.getResults(input, context);

    if (results.length === 0) {
      throw new Error('MinPoolUnit requires at least one result to aggregate');
    }

    // Find minimum score
    let minScore = Infinity;
    let minResult: UnitOutput | undefined;

    for (const result of results) {
      const score = this.extractScore(result);
      if (score !== undefined && score < minScore) {
        minScore = score;
        minResult = result;
      }
    }

    if (!minResult) {
      throw new Error('No numeric scores found for MinPoolUnit');
    }

    return {
      ...minResult,
      _aggregation: {
        method: 'min-pool',
        minScore,
        totalResults: results.length,
      },
    };
  }

  protected getResults(input: AggregateInput, context: ExecutionContext): UnitOutput[] {
    if (input.results && input.results.length > 0) {
      return input.results;
    }

    if (context.previous) {
      const allResults: UnitOutput[] = [];
      for (const [_, output] of context.previous.units) {
        allResults.push(output);
      }
      return allResults;
    }

    return [];
  }

  protected extractScore(result: UnitOutput): number | undefined {
    if ('score' in result) {
      const score =
        typeof result.score === 'number' ? result.score : parseFloat(String(result.score));
      return isNaN(score) ? undefined : score;
    }
    
    // Handle categorical results
    if ('choice' in result) {
      const choice = String(result.choice).toLowerCase();
      if (choice === 'yes' || choice === 'true' || choice === 'correct' || choice === 'valid') {
        return 1;
      } else if (choice === 'no' || choice === 'false' || choice === 'incorrect' || choice === 'invalid') {
        return 0;
      }
    }
    
    return undefined;
  }

  protected async preparePrompt(input: AggregateInput, context: ExecutionContext): Promise<string> {
    return '';
  }

  validate(): void {}
  process(input: AggregateInput, response: any): UnitOutput {
    return response;
  }
}
