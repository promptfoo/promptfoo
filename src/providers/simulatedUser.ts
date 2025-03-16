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

export type AgentSubproviderConfig = {
  id: string;
};

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AgentProviderOptions = ProviderOptions & {
  config?: {
    userProvider?: ProviderOptions;
    instructions?: string;
    maxTurns?: number;
  };
};

export class SimulatedUser implements ApiProvider {
  private readonly identifier: string;
  private readonly maxTurns: number;
  private readonly rawInstructions: string;

  constructor({ id, label, config }: AgentProviderOptions) {
    this.identifier = id ?? label ?? 'agent-provider';
    this.maxTurns = config.maxTurns ?? 10;
    this.rawInstructions = config.instructions || '{{instructions}}';
  }

  id() {
    return this.identifier;
  }

  private async sendMessageToUser(
    messages: Message[],
    userProvider: PromptfooSimulatedUserProvider,
  ): Promise<Message[]> {
    const flippedMessages = messages.map((message) => {
      return {
        role: message.role === 'user' ? 'assistant' : 'user',
        content: message.content,
      };
    });

    const response = await userProvider.callApi(JSON.stringify(flippedMessages));
    logger.debug(`User: ${response.output}`);
    return [...messages, { role: 'user', content: response.output }];
  }

  private async sendMessageToAgent(
    messages: Message[],
    targetProvider: ApiProvider,
  ): Promise<Message[]> {
    const response = await targetProvider.callApi(JSON.stringify(messages));
    if (targetProvider.delay) {
      logger.debug(`[SimulatedUser] Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
    logger.debug(`Agent: ${response.output}`);
    return [...messages, { role: 'assistant', content: response.output }];
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
      messages = await this.sendMessageToUser(messages, userProvider);
      messages = await this.sendMessageToAgent(messages, context.originalProvider);
      numRequests += 1; // Only count the request to the agent.

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.content.includes('###STOP###')) {
        break;
      }
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
