import { getStrategyId, STRATEGY_PROBE_MULTIPLIER, getEstimatedProbes as getEstimatedProbesBase } from '@promptfoo/redteam';
import type { Config } from '../../types';

// Re-export the imported functions
export { getStrategyId, STRATEGY_PROBE_MULTIPLIER };

// Wrapper function to adapt the generic function to work with Config type
export function getEstimatedProbes(config: Config) {
  return getEstimatedProbesBase(config);
}
