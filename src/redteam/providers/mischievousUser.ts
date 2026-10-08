import { isLoggedIntoCloud } from '../../globalConfig/accounts';
import { REDTEAM_SIMULATED_USER_TASK_ID } from '../../providers/promptfoo';
import { type Message, SimulatedUser } from '../../providers/simulatedUser';
import invariant from '../../util/invariant';
import { accumulateAttackerTokenUsage } from '../../util/tokenUsageUtils';
import { getLastMessageContent, messagesToRedteamHistory, snapshotTargetMetadata } from './shared';

import type { CallApiContextParams, ProviderResponse, TokenUsage } from '../../types/index';

const PROVIDER_ID = 'promptfoo:redteam:mischievous-user';

type Config = {
  injectVar: string;
  maxTurns?: number;
  stateful?: boolean;
  targetId?: string;
};

export default class RedteamMischievousUserProvider extends SimulatedUser {
  // Cloud task:
  readonly taskId: string = REDTEAM_SIMULATED_USER_TASK_ID;
  private readonly targetMetadataSnapshots = new WeakMap<
    ProviderResponse,
    ProviderResponse['metadata'] | null
  >();

  constructor(config: Config) {
    invariant(config.injectVar, 'Expected injectVar to be set');

    let maxTurns = config.maxTurns ?? 5;
    // Cap turns for unauthenticated users
    if (!isLoggedIntoCloud()) {
      maxTurns = Math.min(maxTurns, 10);
    }

    super({
      id: PROVIDER_ID,
      config: {
        instructions: `{{${config.injectVar}}}`,
        maxTurns,
        stateful: config.stateful ?? false,
        targetId: config.targetId,
      },
    });
  }

  id() {
    return PROVIDER_ID;
  }

  protected accumulateSimulatedUserTokenUsage(
    tokenUsage: TokenUsage,
    response: ProviderResponse,
  ): void {
    accumulateAttackerTokenUsage(tokenUsage, response);
  }

  protected snapshotTargetResponse(
    response: ProviderResponse,
    context: CallApiContextParams,
  ): ProviderResponse {
    const metadata = snapshotTargetMetadata(response, context.test);
    if (metadata === undefined) {
      return response;
    }
    const selectedResponse = { ...response };
    this.targetMetadataSnapshots.set(selectedResponse, metadata);
    return selectedResponse;
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
        redteamOutputIsText: typeof finalTargetResponse?.output === 'string',
        redteamTargetMetadata: finalTargetResponse
          ? this.targetMetadataSnapshots.get(finalTargetResponse)
          : undefined,
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
