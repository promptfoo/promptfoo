import { PromptfooSimulatedUserProvider } from '../../providers/promptfoo';
import { SimulatedUser, type Message } from '../../providers/simulatedUser';
import type { ProviderResponse, TokenUsage } from '../../types';
import invariant from '../../util/invariant';
import { getLastMessageContent, messagesToRedteamHistory } from './shared';

const PROVIDER_ID = 'promptfoo:redteam:persona';

type Config = {
  injectVar: string;
  maxTurns?: number;
  stateful?: boolean;
  persona?: string;
};

export default class RedteamPersonaProvider extends SimulatedUser {
  private persona: string;

  constructor(config: Config) {
    invariant(config.injectVar, 'Expected injectVar to be set');

    // Pass through the persona if provided, otherwise let the server use its default
    const persona = config.persona || '';

    super({
      id: PROVIDER_ID,
      config: {
        instructions: `{{${config.injectVar}}}`,
        maxTurns: config.maxTurns ?? 5,
        stateful: config.stateful ?? false,
      },
    });

    this.persona = persona;
  }

  id() {
    return PROVIDER_ID;
  }

  // Override to use 'persona-redteam' task
  protected createUserProvider(instructions: string): PromptfooSimulatedUserProvider {
    return new PromptfooSimulatedUserProvider({
      instructions,
      task: 'persona-redteam',
      persona: this.persona,
    });
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
        persona: this.persona,
      },
      guardrails: finalTargetResponse.guardrails,
    };
  }
}
