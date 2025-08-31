import logger from '../logger';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { sleep } from '../util/time';
import { PromptfooSimulatedUserProvider } from './promptfoo';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../types';
import { createEmptyTokenUsage, accumulateResponseTokenUsage } from '../util/tokenUsageUtils';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type AgentProviderOptions = ProviderOptions & {
  config?: {
    userProvider?: ProviderOptions;
    instructions?: string;
    maxTurns?: number;
    stateful?: boolean;
  };
};

/**
 * TODO(Will): Ideally this class is an Abstract Base Class that's implemented by the
 * Redteam and Non-Redteam SimulatedUser Providers. Address this in a follow-up PR.
 */
export class SimulatedUser implements ApiProvider {
  private readonly identifier: string;
  private readonly maxTurns: number;
  private readonly rawInstructions: string;
  private readonly stateful: boolean;

  /**
   * Because the SimulatedUser is inherited by the RedteamMischievousUserProvider, and different
   * Cloud tasks are used for each, the taskId needs to be explicitly defined/scoped.
   */
  readonly taskId: string = 'tau';

  constructor({ id, label, config }: AgentProviderOptions) {
    this.identifier = id ?? label ?? 'agent-provider';
    this.maxTurns = config.maxTurns ?? 10;
    this.rawInstructions = config.instructions || '{{instructions}}';
    this.stateful = config.stateful ?? false;
  }

  id() {
    return this.identifier;
  }

  private async sendMessageToUser(
    messages: Message[],
    userProvider: PromptfooSimulatedUserProvider,
  ): Promise<Message[]> {
    logger.debug('[SimulatedUser] Sending message to simulated user provider');

    const flippedMessages = messages.map((message) => {
      return {
        role: message.role === 'user' ? 'assistant' : 'user',
        content: message.content,
      };
    });

    const response = await userProvider.callApi(JSON.stringify(flippedMessages));
    logger.debug(`User: ${response.output}`);
    return [...messages, { role: 'user', content: String(response.output || '') }];
  }

  private async sendMessageToAgent(
    messages: Message[],
    targetProvider: ApiProvider,
    context: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const targetPrompt = this.stateful
      ? messages[messages.length - 1].content
      : JSON.stringify(messages);

    logger.debug(`[SimulatedUser] Sending message to target provider: ${targetPrompt}`);

    const response = await targetProvider.callApi(targetPrompt, context);

    if (response.sessionId) {
      context = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
      context.vars.sessionId = response.sessionId;
    }

    if (targetProvider.delay) {
      logger.debug(`[SimulatedUser] Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }

    logger.debug(`[SimulatedUser] Agent: ${response.output}`);
    return response;
  }

  async callApi(
    // NOTE: `prompt` is not used in this provider; `vars.instructions` is used instead.
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');

    const instructions = getNunjucksEngine().renderString(this.rawInstructions, context?.vars);

    const userProvider = new PromptfooSimulatedUserProvider({ instructions }, this.taskId);

    logger.debug(`[SimulatedUser] Formatted user instructions: ${instructions}`);
    const messages: Message[] = [];
    const maxTurns = this.maxTurns;

    const tokenUsage = createEmptyTokenUsage();

    let agentResponse: ProviderResponse | undefined;

    for (let i = 0; i < maxTurns; i++) {
      logger.debug(`[SimulatedUser] Turn ${i + 1} of ${maxTurns}`);

      // NOTE: Simulated-user provider acts as a judge to determine whether the instruction goal is satisfied.
      const messagesToUser = await this.sendMessageToUser(messages, userProvider);
      const lastMessage = messagesToUser[messagesToUser.length - 1];

      // Check whether the judge has determined that the instruction goal is satisfied.
      if (
        lastMessage.content &&
        typeof lastMessage.content === 'string' &&
        lastMessage.content.includes('###STOP###')
      ) {
        break;
      }

      messages.push(lastMessage);

      agentResponse = await this.sendMessageToAgent(
        messagesToUser,
        context.originalProvider,
        context,
      );

      messages.push({ role: 'assistant', content: String(agentResponse.output ?? '') });

      // Track token usage
      accumulateResponseTokenUsage(tokenUsage, agentResponse);
    }

    return this.serializeOutput(messages, tokenUsage, agentResponse as ProviderResponse);
  }

  toString() {
    return 'AgentProvider';
  }

  serializeOutput(
    messages: Message[],
    tokenUsage: TokenUsage,
    finalTargetResponse: ProviderResponse,
  ) {
    return {
      output: messages
        .map(
          (message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`,
        )
        .join('\n---\n'),
      tokenUsage,
      metadata: {
        messages,
      },
      guardrails: finalTargetResponse.guardrails,
    };
  }
}
