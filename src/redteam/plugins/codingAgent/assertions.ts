import { CODING_AGENT_PLUGINS } from '../../constants/codingAgents';

import type { AssertionOrSet } from '../../../types/index';

export function hasCodingAgentAssertion(
  assertions: AssertionOrSet[] | undefined,
  pluginIds: readonly string[] = CODING_AGENT_PLUGINS,
): boolean {
  return (
    Array.isArray(assertions) &&
    assertions.some((assertion) =>
      assertion?.type === 'assert-set'
        ? hasCodingAgentAssertion(assertion.assert, pluginIds)
        : pluginIds.some((id) => assertion?.type === `promptfoo:redteam:${id}`),
    )
  );
}
