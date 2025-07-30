import { type Message, SimulatedUser } from '../../providers/simulatedUser';
import invariant from '../../util/invariant';
import { getLastMessageContent, messagesToRedteamHistory } from './shared';

import type { ProviderResponse, TokenUsage } from '../../types';

const PROVIDER_ID = 'promptfoo:redteam:mischievous-user';

type Config = {
  injectVar: string;
  maxTurns?: number;
  stateful?: boolean;
};

export default class RedteamMischievousUserProvider extends SimulatedUser {
  // Cloud task:
  readonly taskId: string = 'mischievous-user-redteam';

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
    finalTargetResponse: ProviderResponse,
  ) {
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      tokenUsage,
      metadata: {
        redteamFinalPrompt: getLastMessageContent(messages, 'user') || '',
        messages,
        redteamHistory: messagesToRedteamHistory(messages),
      },
      guardrails: finalTargetResponse.guardrails,
    };
  }
}
