import { SimulatedUser, type Message } from '../../providers/simulatedUser';
import type { ProviderResponse, TokenUsage } from '../../types';
import invariant from '../../util/invariant';
import { REDTEAM_SIMULATED_USER_STRATEGY_ID } from '../constants/strategies';
import { getLastMessageContent, messagesToRedteamHistory } from './shared';

const PROVIDER_ID = `promptfoo:redteam:${REDTEAM_SIMULATED_USER_STRATEGY_ID}`;

type RedteamSimulatedUserConfig = {
  injectVar: string;
  maxTurns?: number;
  stateful?: boolean;
};

export default class RedteamSimulatedUserProvider extends SimulatedUser {
  constructor(config: RedteamSimulatedUserConfig) {
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

  get taskId() {
    return 'simulated-user-redteam';
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
