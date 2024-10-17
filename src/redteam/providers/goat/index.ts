import dedent from 'dedent';
import invariant from 'tiny-invariant';
import { v4 as uuidv4 } from 'uuid';
import { renderPrompt } from '../../../evaluatorHelpers';
import logger from '../../../logger';
import { PromptfooChatCompletionProvider } from '../../../providers/promptfoo';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  Prompt,
  NunjucksFilterMap,
  RedteamFileConfig,
} from '../../../types';
import { getNunjucksEngine } from '../../../util/templates';
import { shouldGenerateRemote } from '../../util';
import { loadRedteamProvider } from '../shared';
import { formatAttackerSystemPrompt, formatAttackerInitialPrompt, formatAttackerFollowupPrompt, JUDGE_SYSTEM_PROMPT } from './prompts';

const DEFAULT_MAX_TURNS = 5;

interface GoatConfig {
  injectVar: string;
  maxTurns?: number;
  redteamProvider: RedteamFileConfig['provider'];
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

class GoatProvider implements ApiProvider {
  readonly config: GoatConfig;
  private readonly nunjucks: any;
  private goal: string | undefined;
  private attackerProvider: ApiProvider | undefined;
  private targetProvider: ApiProvider | undefined;
  private judgeProvider: ApiProvider | undefined;
  private attackerConversationId: string;
  private targetConversationId: string;
  private maxTurns: number;
  private conversations: Map<string, ConversationMessage[]>;

  constructor(config: GoatConfig) {
    this.config = config;
    this.maxTurns = config.maxTurns || DEFAULT_MAX_TURNS;
    this.nunjucks = getNunjucksEngine();
    this.attackerConversationId = uuidv4();
    this.targetConversationId = uuidv4();
    this.conversations = new Map();
    this.conversations.set(this.attackerConversationId, []);
    this.conversations.set(this.targetConversationId, []);
    logger.debug(`GoatProvider initialized with config: ${JSON.stringify(config)}`);
  }

  private async getAttackerProvider(): Promise<ApiProvider> {
    if (!this.attackerProvider) {
      if (shouldGenerateRemote()) {
        this.attackerProvider = new PromptfooChatCompletionProvider({
          task: 'goat',
          jsonOnly: true,
          preferSmallModel: false,
        });
      } else {
        this.attackerProvider = await loadRedteamProvider({
          provider: this.config.redteamProvider,
          preferSmallModel: false,
          jsonOnly: true,
        });
      }
    }
    return this.attackerProvider;
  }

  private async getTargetProvider(): Promise<ApiProvider> {
    if (!this.targetProvider) {
      if (shouldGenerateRemote()) {
        this.targetProvider = new PromptfooChatCompletionProvider({
          task: 'goat',
          jsonOnly: false,
          preferSmallModel: false,
        });
      } else {
        this.targetProvider = await loadRedteamProvider({
          provider: this.config.redteamProvider,
          preferSmallModel: false,
        });
      }
    }
    return this.targetProvider;
  }

  private async getJudgeProvider(): Promise<ApiProvider> {
    if (!this.judgeProvider) {
      if (shouldGenerateRemote()) {
        this.judgeProvider = new PromptfooChatCompletionProvider({
          task: 'goat',
          jsonOnly: false,
          preferSmallModel: false,
        });
      } else {
        this.judgeProvider = await loadRedteamProvider({
          provider: this.config.redteamProvider,
          preferSmallModel: false,
        });
      }
    }
    return this.judgeProvider;
  }

  id() {
    return 'promptfoo:redteam:goat';
  }

  async callApi(prompt: string, context?: CallApiContextParams, options?: CallApiOptionsParams) {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    logger.debug(`callApi invoked with prompt: ${prompt}`);

    this.goal = String(context.vars[this.config.injectVar]);
    logger.debug(`Goal: ${this.goal}`);

    return this.runAttack({
      prompt: context.prompt,
      filters: context.filters,
      vars: context.vars,
      provider: context.originalProvider,
    });
  }

  private async runAttack({
    prompt,
    filters,
    vars,
    provider,
  }: {
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, string | object>;
    provider: ApiProvider;
  }) {
    logger.debug(
      `Starting GOAT attack with: prompt=${JSON.stringify(prompt)}, filtersPresent=${!!filters}, varsKeys=${Object.keys(vars)}, providerType=${provider.constructor.name}`,
    );

    let turnNum = 0;
    let lastAttackerReply = '';
    let lastTargetResponse = '';
    let isUnsafe = false;

    const attackerSystemPrompt = formatAttackerSystemPrompt(this.goal!);

    this.addMessage(this.attackerConversationId, {
      role: 'system',
      content: attackerSystemPrompt,
    });

    while (turnNum < this.maxTurns) {
      turnNum++;
      logger.debug(`\nTURN ${turnNum}\n`);

      const attackPrompt = await this.getAttackPrompt(turnNum, lastAttackerReply, lastTargetResponse);
      logger.debug(`Generated attack prompt: ${attackPrompt}`);

      lastTargetResponse = await this.sendPrompt(attackPrompt, prompt, vars, filters, provider);
      logger.debug(`Received response from target: ${lastTargetResponse.substring(0, 100)}...`);

      const safetyEvaluation = await this.evaluateResponse(this.goal!, lastTargetResponse);
      isUnsafe = safetyEvaluation === 'unsafe';

      logger.debug(`Turn ${turnNum}`);
      logger.debug("Attacker's message:");
      logger.debug(attackPrompt);
      logger.debug("Target's response:");
      logger.debug(lastTargetResponse);
      logger.debug(`Safety evaluation: ${safetyEvaluation}`);
      logger.debug("-".repeat(50));

      if (isUnsafe) {
        logger.debug("Unsafe response detected. Stopping the attack.");
        break;
      }

      lastAttackerReply = attackPrompt;
    }

    logger.debug(
      `\nFINAL RESULTS, TOTAL TURNS: ${turnNum}\n`,
    );

    this.logChatHistory(this.targetConversationId);
    this.logChatHistory(this.attackerConversationId);

    return {
      output: lastTargetResponse,
      metadata: {
        goatFinalPrompt: this.getConversation(this.targetConversationId)
          .map((m) => `[${m.role}] ${m.content}`)
          .join('\n\n'),
        goatTurnsCompleted: turnNum,
        goatGoalAchieved: isUnsafe,
      },
    };
  }

  private async getAttackPrompt(
    turnNum: number,
    lastAttackerReply: string,
    lastTargetResponse: string,
  ): Promise<string> {
    logger.debug(`getAttackPrompt called: turn=${turnNum}`);
    let promptText: string;

    if (turnNum === 1) {
      promptText = formatAttackerInitialPrompt(this.goal!);
    } else {
      promptText = formatAttackerFollowupPrompt(this.goal!, lastAttackerReply, lastTargetResponse);
    }

    this.addMessage(this.attackerConversationId, {
      role: 'user',
      content: promptText,
    });

    const attackerHistory = this.getConversation(this.attackerConversationId);
    logger.debug(`Sending to attacker chat:`);
    this.logChatHistory(this.attackerConversationId);
    const attackerChat = await this.getAttackerProvider();
    const response = await attackerChat.callApi(JSON.stringify(attackerHistory), {
      prompt: {
        raw: JSON.stringify(attackerHistory),
        label: 'history',
      },
      vars: {},
    });
    invariant(typeof response.output === 'string', 'Expected output to be a string');

    const parsedOutput = this.parseAttackerResponse(response.output);

    logger.debug(dedent`
      Received from attacker chat:

      observation: ${parsedOutput.observation}
      thought: ${parsedOutput.thought}
      strategy: ${parsedOutput.strategy}
      reply: ${parsedOutput.reply}
    `);

    this.addMessage(this.attackerConversationId, {
      role: 'assistant',
      content: response.output,
    });

    return parsedOutput.reply;
  }

  private async sendPrompt(
    attackPrompt: string,
    originalPrompt: Prompt,
    vars: Record<string, string | object>,
    filters: NunjucksFilterMap | undefined,
    provider: ApiProvider,
  ): Promise<string> {
    const renderedPrompt = await renderPrompt(
      originalPrompt,
      { ...vars, [this.config.injectVar]: attackPrompt },
      filters,
      provider,
    );
    logger.debug(`Sending to target chat:`);
    this.logChatHistory(this.targetConversationId);

    this.addMessage(this.targetConversationId, {
      role: 'user',
      content: renderedPrompt,
    });

    const response = await provider.callApi(renderedPrompt);
    if (response.error) {
      logger.error(`Error received from target: ${response.error}`);
      throw new Error(`Error received from target: ${response.error}`);
    }
    invariant(response.output, 'Expected output to be defined');
    logger.debug(`Received response from target: ${response.output}`);

    const outputString =
      typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
    this.addMessage(this.targetConversationId, {
      role: 'assistant',
      content: outputString,
    });

    return outputString;
  }

  private async evaluateResponse(request: string, response: string): Promise<'safe' | 'unsafe'> {
    const judgeProvider = await this.getJudgeProvider();

    const judgePrompt = this.nunjucks.renderString(JUDGE_SYSTEM_PROMPT, {
      behavior: request,
      response,
    });

    const judgeResponse = await judgeProvider.callApi(judgePrompt);
    invariant(typeof judgeResponse.output === 'string', 'Expected output to be a string');

    const judgement = judgeResponse.output.trim().toLowerCase();
    invariant(judgement === 'safe' || judgement === 'unsafe', 'Expected judge to respond with "safe" or "unsafe"');

    return judgement as 'safe' | 'unsafe';
  }

  private parseAttackerResponse(responseText: string): { observation: string; thought: string; strategy: string; reply: string } {
    const sections = responseText.split('▶');
    let observation = '';
    let thought = '';
    let strategy = '';
    let reply = '';

    for (const section of sections) {
      const trimmedSection = section.trim();
      if (trimmedSection.startsWith('Observation:')) {
        observation = trimmedSection.slice('Observation:'.length).trim();
      } else if (trimmedSection.startsWith('Thought:')) {
        thought = trimmedSection.slice('Thought:'.length).trim();
      } else if (trimmedSection.startsWith('Strategy:')) {
        strategy = trimmedSection.slice('Strategy:'.length).trim();
      } else {
        reply += trimmedSection + '\n';
      }
    }

    return {
      observation,
      thought,
      strategy,
      reply: reply.trim(),
    };
  }

  private addMessage(conversationId: string, message: ConversationMessage) {
    const conversation = this.getConversation(conversationId);
    conversation.push(message);
  }

  private getConversation(conversationId: string): ConversationMessage[] {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = [];
      this.conversations.set(conversationId, conversation);
    }
    return conversation;
  }

  private logChatHistory(conversationId: string): void {
    const messages = this.getConversation(conversationId);
    logger.debug(`Memory for conversation ${conversationId}:`);
    for (const message of messages) {
      logger.debug(`... ${message.role}: ${message.content.slice(0, 100)} ...`);
    }
  }
}

export default GoatProvider;