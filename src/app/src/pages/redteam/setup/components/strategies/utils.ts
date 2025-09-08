import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { getEstimatedProbes } from '@promptfoo/redteam/sharedFrontend';
import { Config } from '../../types';
import type { RedteamStrategy } from '@promptfoo/redteam/types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}

export function getEstimatedDuration(config: Config): string {
  const numProbes = getEstimatedProbes(config);
  const concurrency = config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY;

  // Estimate test generation time (roughly 1-2 seconds per test)
  const testGenTime = Math.ceil((config.numTests || 1) * 1.5);

  // Estimate probe execution time (roughly 2-5 seconds per probe, accounting for concurrency)
  const avgProbeTime = 3; // seconds
  const probeExecutionTime = Math.ceil((numProbes * avgProbeTime) / concurrency);

  const totalSeconds = testGenTime + probeExecutionTime;

  if (totalSeconds < 60) {
    return `~${totalSeconds}s`;
  } else if (totalSeconds < 3600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes}m`;
  } else {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.ceil((totalSeconds % 3600) / 60);
    return `~${hours}h ${minutes}m`;
  }
}
