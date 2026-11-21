import { createAdaptiveMultiTurnStrategy } from './hydra';

/**
 * ReAct crescendo strategy: same gradual-escalation multi-turn attack as
 * `crescendo`, but the attacker reasons explicitly each turn (OBSERVE ->
 * REASON -> ACT) and switches strategy vectors when stalled.
 *
 * Defined as a const (rather than a wrapper function importing `TestCase`
 * from `src/types`) so this module adds no new cross-layer imports; the
 * shared transformer carries the test-case typing.
 */
export const addReactCrescendo = createAdaptiveMultiTurnStrategy(
  {
    providerName: 'promptfoo:redteam:react-crescendo',
    metricSuffix: 'ReactCrescendo',
    strategyId: 'react-crescendo',
  },
  false,
);
