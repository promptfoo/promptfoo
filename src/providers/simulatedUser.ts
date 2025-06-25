import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { sleep } from '../util/time';
import { PromptfooSimulatedUserProvider } from './promptfoo';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AgentProviderOptions = ProviderOptions & {
  config?: {
    userProvider?: ProviderOptions;
    instructions?: string;
    maxTurns?: number;
    stateful?: boolean;
  };
};

export class SimulatedUser implements ApiProvider {
  private readonly identifier: string;
  private readonly maxTurns: number;
  private readonly rawInstructions: string;

  private targetConfig: {
    /**
     * Whether the target provider is stateful.
     */
    stateful: boolean;
    /**
     * If the target is stateful, a session id returned by the target during the first call to it.
     */
    sessionId: string | null;
  };

  constructor({ id, label, config }: AgentProviderOptions) {
    this.identifier = id ?? label ?? 'agent-provider';
    this.maxTurns = config.maxTurns ?? 10;
    this.rawInstructions = config.instructions || '{{instructions}}';

    this.targetConfig = {
      stateful: config.stateful ?? false,
      sessionId: null,
    };
  }

  id() {
    return this.identifier;
  }

  private async sendMessageToUser(
    messages: Message[],
    userProvider: PromptfooSimulatedUserProvider,
  ): Promise<Message[]> {
    logger.debug('[SimulatedUser] Sending message to simulated user (tau) provider');

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
    prompt: string,
  ): Promise<Message[]> {
    logger.debug('[SimulatedUser] Sending message to target provider');

    const payload = this.targetConfig.stateful
      ? JSON.stringify([{ role: 'system', content: prompt }])
      : JSON.stringify([{ role: 'system', content: prompt }, ...messages]);

    const response = await targetProvider.callApi(
      payload,
      this.targetConfig.sessionId
        ? {
            vars: { sessionId: this.targetConfig.sessionId },
            prompt: { raw: '', label: 'target' },
          }
        : undefined,
    );

    if (this.targetConfig.stateful && response.sessionId) {
      this.targetConfig.sessionId = response.sessionId;
    }

    if (targetProvider.delay) {
      logger.debug(`[SimulatedUser] Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }

    logger.debug(`[SimulatedUser] Agent: ${response.output}`);
    return [...messages, { role: 'assistant', content: String(response.output || '') }];
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');

    const instructions = getNunjucksEngine().renderString(this.rawInstructions, context?.vars);
    const userProvider = new PromptfooSimulatedUserProvider({
      instructions,
    });

    logger.debug(`Formatted user instructions: ${instructions}`);
    let messages: Message[] = [];
    const maxTurns = this.maxTurns;
    let numRequests = 0;
    for (let i = 0; i < maxTurns; i++) {
      logger.debug(`[SimulatedUser] Turn ${i + 1} of ${maxTurns}`);

      const messagesToUser = await this.sendMessageToUser(messages, userProvider);
      const lastMessage = messagesToUser[messagesToUser.length - 1];
      if (
        lastMessage.content &&
        typeof lastMessage.content === 'string' &&
        lastMessage.content.includes('###STOP###')
      ) {
        break;
      }

      const messagesToAgent = await this.sendMessageToAgent(
        messagesToUser,
        context.originalProvider,
        prompt,
      );
      messages = messagesToAgent;
      numRequests += 1; // Only count the request to the agent.
    }

    return {
      output: messages
        .map(
          (message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`,
        )
        .join('\n---\n'),
      tokenUsage: {
        numRequests,
      },
      metadata: {
        messages,
      },
    };
  }

  toString() {
    return 'AgentProvider';
  }
}
