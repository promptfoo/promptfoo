import logger from '../logger';
import { getSessionId } from '../redteam/util';
import invariant from '../util/invariant';
import { maybeLoadConfigFromExternalFile } from '../util/file';
import { getNunjucksEngine } from '../util/templates';
import { sleep } from '../util/time';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { PromptfooSimulatedUserProvider } from './promptfoo';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

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
    initialMessages?: Message[] | string; // Array of messages or file:// path
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
  private readonly configInitialMessages?: Message[] | string;

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
    this.configInitialMessages = config.initialMessages;
  }

  id() {
    return this.identifier;
  }

  /**
   * Validates that a message has the required structure.
   */
  private isValidMessage(msg: any): msg is Message {
    return (
      msg &&
      typeof msg === 'object' &&
      typeof msg.content === 'string' &&
      (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')
    );
  }

  /**
   * Validates and filters an array of messages, logging warnings for invalid entries.
   */
  private validateMessages(messages: any[]): Message[] {
    const validMessages: Message[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (this.isValidMessage(messages[i])) {
        validMessages.push(messages[i]);
      } else {
        logger.warn(
          `[SimulatedUser] Invalid message at index ${i}, skipping. Expected {role: 'user'|'assistant'|'system', content: string}, got: ${JSON.stringify(messages[i]).substring(0, 100)}`,
        );
      }
    }
    return validMessages;
  }

  /**
   * Resolves initial messages from either an array or a file:// path.
   * Supports loading messages from JSON files.
   */
  private resolveInitialMessages(
    initialMessages: Message[] | string | undefined,
  ): Message[] {
    if (!initialMessages) {
      return [];
    }

    // If it's already an array, validate and return it
    if (Array.isArray(initialMessages)) {
      return this.validateMessages(initialMessages);
    }

    // If it's a string, handle different cases
    if (typeof initialMessages === 'string') {
      // Case 1: file:// reference that hasn't been loaded yet
      if (initialMessages.startsWith('file://')) {
        const resolved = maybeLoadConfigFromExternalFile(initialMessages);
        if (Array.isArray(resolved)) {
          return this.validateMessages(resolved);
        }
        logger.warn(
          `[SimulatedUser] Expected array of messages from file, got: ${typeof resolved}. Value: ${JSON.stringify(resolved).substring(0, 200)}`,
        );
        return [];
      }

      // Case 2: Stringified JSON array (happens when file was already loaded but then stringified for storage/transport)
      if (initialMessages.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(initialMessages);
          if (Array.isArray(parsed)) {
            return this.validateMessages(parsed);
          }
          logger.warn(
            `[SimulatedUser] Parsed JSON but got ${typeof parsed} instead of array`,
          );
        } catch (error) {
          logger.warn(
            `[SimulatedUser] Failed to parse initialMessages as JSON: ${error}. Value: ${initialMessages.substring(0, 200)}`,
          );
        }
      }

      logger.warn(
        `[SimulatedUser] initialMessages is a string but could not be resolved: ${initialMessages.substring(0, 200)}`,
      );
      return [];
    }

    return [];
  }

  private async sendMessageToUser(
    messages: Message[],
    userProvider: PromptfooSimulatedUserProvider,
  ): Promise<{ messages: Message[]; tokenUsage?: TokenUsage; error?: string }> {
    logger.debug('[SimulatedUser] Sending message to simulated user provider');

    const flippedMessages = messages.map((message) => {
      return {
        role: message.role === 'user' ? 'assistant' : 'user',
        content: message.content,
      };
    });

    const response = await userProvider.callApi(JSON.stringify(flippedMessages));

    // Propagate error from remote generation disable check
    if (response.error) {
      return {
        messages,
        error: response.error,
      };
    }

    logger.debug(`User: ${response.output}`);
    return {
      messages: [...messages, { role: 'user', content: String(response.output || '') }],
      tokenUsage: response.tokenUsage,
    };
  }

  private async sendMessageToAgent(
    messages: Message[],
    targetProvider: ApiProvider,
    context: CallApiContextParams,
  ): Promise<ProviderResponse> {
    invariant(context?.prompt?.raw, 'Expected context.prompt.raw to be set');

    // Include the assistant's prompt/instructions as a system message
    const agentPrompt = context.prompt.raw;
    const agentVars = context.vars;
    const renderedPrompt = getNunjucksEngine().renderString(agentPrompt, agentVars);

    // For stateful providers:
    //   - First turn (no sessionId): send system prompt + user message to establish session
    //   - Subsequent turns (sessionId exists): send only user message (provider maintains state)
    // For non-stateful providers: always send system prompt + full conversation
    const targetPrompt = this.stateful
      ? context.vars?.sessionId
        ? JSON.stringify([{ role: 'user', content: messages[messages.length - 1].content }])
        : JSON.stringify([
            { role: 'system', content: renderedPrompt },
            { role: 'user', content: messages[messages.length - 1].content },
          ])
      : JSON.stringify([{ role: 'system', content: renderedPrompt }, ...messages]);

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
    // NOTE: The `prompt` parameter is not used directly; `context.prompt.raw` is used instead
    // to extract the assistant's system instructions. The simulated user's instructions come from vars.
    _prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');

    const instructions = getNunjucksEngine().renderString(this.rawInstructions, context?.vars);

    const userProvider = new PromptfooSimulatedUserProvider({ instructions }, this.taskId);

    logger.debug(`[SimulatedUser] Formatted user instructions: ${instructions}`);

    // Support initial messages from either vars.initialMessages (per-test) or config.initialMessages (provider-level)
    // vars.initialMessages takes precedence over config.initialMessages
    // Both can be arrays or file:// paths
    const varsInitialMessages = context?.vars?.initialMessages as Message[] | string | undefined;
    const initialMessages = this.resolveInitialMessages(
      varsInitialMessages || this.configInitialMessages,
    );
    const messages: Message[] = [...initialMessages];

    if (initialMessages.length > 0) {
      logger.debug(`[SimulatedUser] Starting with ${initialMessages.length} initial messages`);
    }

    const maxTurns = this.maxTurns;

    const tokenUsage = createEmptyTokenUsage();

    let agentResponse: ProviderResponse | undefined;

    for (let i = 0; i < maxTurns; i++) {
      logger.debug(`[SimulatedUser] Turn ${i + 1} of ${maxTurns}`);

      // NOTE: Simulated-user provider acts as a judge to determine whether the instruction goal is satisfied.
      const userResult = await this.sendMessageToUser(messages, userProvider);

      // Check for errors from remote generation disable
      if (userResult.error) {
        return {
          error: userResult.error,
          tokenUsage,
        };
      }

      const { messages: messagesToUser } = userResult;
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

      accumulateResponseTokenUsage(tokenUsage, agentResponse);
    }

    return this.serializeOutput(
      messages,
      tokenUsage,
      agentResponse as ProviderResponse,
      getSessionId(agentResponse, context),
    );
  }

  toString() {
    return 'AgentProvider';
  }

  serializeOutput(
    messages: Message[],
    tokenUsage: TokenUsage,
    finalTargetResponse: ProviderResponse,
    sessionId?: string,
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
        sessionId,
      },
      guardrails: finalTargetResponse.guardrails,
    };
  }
}
