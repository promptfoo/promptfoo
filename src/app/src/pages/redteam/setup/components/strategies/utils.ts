import type { RedteamStrategy } from '@promptfoo/redteam/types';

export function getStrategyId(strategy: RedteamStrategy): string {
  return typeof strategy === 'string' ? strategy : strategy.id;
}
