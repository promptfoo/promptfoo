/**
 * Export all unit implementations
 */

export { BaseUnit, PreviousResultsImpl } from './base';
export {
  JudgeUnit,
  CategoricalJudgeUnit,
  PairwiseJudgeUnit,
  VerifyUnit,
} from './judge';
export {
  MaxPoolUnit,
  MeanPoolUnit,
  WeightedMeanPoolUnit,
  MinPoolUnit,
} from './aggregate';

// Unit factory function
import type { Unit, UnitConfig } from '../types';
import { JudgeUnit, CategoricalJudgeUnit, PairwiseJudgeUnit, VerifyUnit } from './judge';
import { MaxPoolUnit, MeanPoolUnit, WeightedMeanPoolUnit, MinPoolUnit } from './aggregate';

export function createUnit(type: string, config: UnitConfig = {}): Unit {
  switch (type) {
    case 'judge':
    case 'likert':
      return new JudgeUnit(config);

    case 'categorical':
    case 'categorical-judge':
      return new CategoricalJudgeUnit(config);

    case 'pairwise':
    case 'pairwise-judge':
      return new PairwiseJudgeUnit(config);

    case 'verify':
      return new VerifyUnit(config);

    case 'max-pool':
    case 'majority-vote':
      return new MaxPoolUnit(config);

    case 'mean-pool':
    case 'average':
      return new MeanPoolUnit(config);

    case 'weighted-mean':
    case 'weighted-mean-pool':
      return new WeightedMeanPoolUnit(config);

    case 'min-pool':
      return new MinPoolUnit(config);

    default:
      throw new Error(`Unknown unit type: ${type}`);
  }
}
