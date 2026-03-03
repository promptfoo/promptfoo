import { REDTEAM_SIMULATED_USER_TASK_ID } from '../../providers/promptfoo';
import { type Message, SimulatedUser } from '../../providers/simulatedUser';
import invariant from '../../util/invariant';
import { getLastMessageContent, messagesToRedteamHistory } from './shared';

import type { ProviderResponse, TokenUsage } from '../../types/index';

const PROVIDER_ID = 'promptfoo:redteam:mischievous-user';

type Config = {
  injectVar: string;
  maxTurns?: number;
  stateful?: boolean;
};

export default class RedteamMischievousUserProvider extends SimulatedUser {
  // Cloud task:
  readonly taskId: string = REDTEAM_SIMULATED_USER_TASK_ID;

  constructor(config: Config) {
    invariant(config.injectVar, 'Expected injectVar to be set');

    super({
      id: PROVIDER_ID,
      config: {
        instructions: `{{${config.injectVar}}}`,
        maxTurns: config.maxTurns ?? 5,
        stateful: config.stateful ?? false,
      },
    });
  }

  id() {
    return PROVIDER_ID;
  }

  serializeOutput(
    messages: Message[],
    tokenUsage: TokenUsage,
    finalTargetResponse: ProviderResponse | undefined,
    sessionId: string,
  ) {
    const finalPrompt = getLastMessageContent(messages, 'user') || '';
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      prompt: finalPrompt,
      tokenUsage,
      metadata: {
        redteamFinalPrompt: finalPrompt,
        messages,
        redteamHistory: messagesToRedteamHistory(messages),
        sessionId,
      },
      guardrails: finalTargetResponse?.guardrails,
      sessionId,
    };
  }
}
