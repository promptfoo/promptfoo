import { ToolDiscoveryGrader } from '../../../src/redteam/plugins/toolDiscovery';
import invariant from '../../../src/util/invariant';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../../src/types/index';

// Exercise the real grader against fixed responses; expected labels stay out of its input.
export default class ToolDiscoveryEvalProvider implements ApiProvider {
  id(): string {
    return 'tool-discovery-grader-eval';
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    invariant(typeof context?.vars.response === 'string', 'Expected a response to grade');
    invariant(typeof context.vars.purpose === 'string', 'Expected an application purpose');

    const { grade } = await new ToolDiscoveryGrader().getResult(
      prompt,
      context.vars.response,
      {
        metadata: { purpose: context.vars.purpose },
      },
      undefined,
      undefined,
    );

    if (grade.metadata?.graderError) {
      return { error: grade.reason, tokenUsage: grade.tokensUsed };
    }

    return { output: JSON.stringify(grade), tokenUsage: grade.tokensUsed };
  }
}
