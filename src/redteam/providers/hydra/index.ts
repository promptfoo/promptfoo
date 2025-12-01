import { v4 as uuidv4 } from 'uuid';

import { renderPrompt } from '../../../evaluatorHelpers';
import logger from '../../../logger';
import { PromptfooChatCompletionProvider } from '../../../providers/promptfoo';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  GradingResult,
  NunjucksFilterMap,
  Prompt,
  ProviderResponse,
  TokenUsage,
} from '../../../types/index';
import invariant from '../../../util/invariant';
import { isValidJson } from '../../../util/json';
import { sleep } from '../../../util/time';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../../util/tokenUsageUtils';
import { shouldGenerateRemote } from '../../remoteGeneration';
import type { BaseRedteamMetadata } from '../../types';
import { getSessionId, isBasicRefusal } from '../../util';
import {
  getTargetResponse,
  isValidChatMessageArray,
  type Message,
  type TargetResponse,
} from '../shared';

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_BACKTRACKS = 10;

interface HydraMetadata extends BaseRedteamMetadata {
  hydraRoundsCompleted: number;
  hydraBacktrackCount: number;
  hydraResult: boolean;
  stopReason: 'Grader failed' | 'Max turns reached' | 'Max backtracks reached';
  successfulAttacks?: Array<{
    turn: number;
    message: string;
    response: string;
  }>;
  totalSuccessfulAttacks?: number;
  storedGraderResult?: GradingResult;
  redteamHistory: Array<{
    prompt: string;
    output: string;
    graderPassed: boolean | undefined;
  }>;
  sessionIds: string[];
}

interface HydraResponse extends ProviderResponse {
  metadata: HydraMetadata;
}

interface HydraConfig {
  injectVar: string;
  scanId?: string;
  maxTurns?: number;
  maxBacktracks?: number;
  stateful?: boolean;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
}

export class HydraProvider implements ApiProvider {
  readonly config: HydraConfig;
  private scanId?: string;
  private readonly agentProvider: ApiProvider;
  private readonly injectVar: string;
  private readonly maxTurns: number;
  private readonly maxBacktracks: number;
  private readonly stateful: boolean;
  private readonly excludeTargetOutputFromAgenticAttackGeneration: boolean;
  private conversationHistory: Message[] = [];
  private sessionId?: string;

  constructor(config: HydraConfig) {
    this.config = config;
    this.scanId = config.scanId; // Use scanId from config if provided
    this.injectVar = config.injectVar;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.maxBacktracks = config.maxBacktracks ?? DEFAULT_MAX_BACKTRACKS;
    this.stateful = config.stateful ?? false;
    this.excludeTargetOutputFromAgenticAttackGeneration =
      config.excludeTargetOutputFromAgenticAttackGeneration ?? false;

    if (this.stateful && this.maxBacktracks > 0) {
      logger.debug('[Hydra] Backtracking disabled in stateful mode');
    }

    // Hydra strategy requires cloud
    if (!shouldGenerateRemote()) {
      throw new Error(
        'jailbreak:hydra strategy requires cloud access. Set PROMPTFOO_REMOTE_GENERATION_URL or log into Promptfoo Cloud.',
      );
    }

    this.agentProvider = new PromptfooChatCompletionProvider({
      task: 'hydra-decision',
      jsonOnly: true,
      preferSmallModel: false,
    });

    logger.debug('[Hydra] Provider initialized', {
      maxTurns: this.maxTurns,
      maxBacktracks: this.maxBacktracks,
      stateful: this.stateful,
      injectVar: this.injectVar,
      excludeTargetOutputFromAgenticAttackGeneration:
        this.excludeTargetOutputFromAgenticAttackGeneration,
    });
  }

  id() {
    return 'promptfoo:redteam:hydra';
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<HydraResponse> {
    logger.debug('[Hydra] callApi invoked');
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const goal = context.test?.metadata?.goal || String(context.vars[this.injectVar]);

    return this.runAttack({
      prompt: context.prompt,
      filters: context.filters,
      vars: context.vars,
      goal,
      targetProvider: context.originalProvider,
      context,
      options,
      test: context.test,
    });
  }

  private async runAttack({
    prompt,
    filters,
    vars,
    goal,
    targetProvider,
    context,
    options,
    test,
  }: {
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, string | object>;
    goal: string;
    targetProvider: ApiProvider;
    context?: CallApiContextParams;
    options?: CallApiOptionsParams;
    test?: AtomicTestCase;
  }): Promise<HydraResponse> {
    // Initialize scanId: use evaluationId if available, otherwise use instance scanId or generate new one
    if (!this.scanId) {
      this.scanId = context?.evaluationId || uuidv4();
    }
    const scanId = context?.evaluationId || this.scanId;

    logger.debug('[Hydra] Starting attack', {
      goal,
      scanId,
      maxTurns: this.maxTurns,
      stateful: this.stateful,
    });

    // Reset state
    this.conversationHistory = [];
    this.sessionId = undefined;
    const sessionIds: string[] = [];
    const successfulAttacks: Array<{ turn: number; message: string; response: string }> = [];

    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();
    const testRunId = `${context?.evaluationId || 'local'}-tc${context?.testCaseId || uuidv4().slice(0, 8)}`;

    let vulnerabilityAchieved = false;
    let stopReason: 'Grader failed' | 'Max turns reached' | 'Max backtracks reached' =
      'Max turns reached';
    let storedGraderResult: GradingResult | undefined = undefined;
    let lastTargetResponse: TargetResponse | undefined = undefined;
    let backtrackCount = 0;

    const redteamHistory: Array<{
      prompt: string;
      output: string;
      graderPassed: boolean | undefined;
    }> = [];

    // Find the grader
    const { getGraderById } = await import('../../graders');
    let assertToUse = test?.assert?.find(
      (a: { type: string }) => a.type && a.type.includes(test.metadata?.pluginId),
    );
    if (!assertToUse) {
      assertToUse = test?.assert?.find((a: { type: string }) => a.type);
    }

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      logger.debug(`[Hydra] Turn ${turn}/${this.maxTurns}`);

      // Build request for cloud agent
      // Conditionally exclude target outputs from conversation history for privacy
      const conversationHistoryForCloud = this.excludeTargetOutputFromAgenticAttackGeneration
        ? this.conversationHistory.map((msg) =>
            msg.role === 'assistant'
              ? { ...msg, content: '[Response hidden for privacy - grader feedback provided]' }
              : msg,
          )
        : this.conversationHistory;

      const cloudRequest = {
        task: 'hydra-decision',
        testRunId,
        scanId,
        turn,
        goal,
        purpose: test?.metadata?.purpose,
        modifiers: test?.metadata?.modifiers,
        conversationHistory: conversationHistoryForCloud,
        lastGraderResult:
          turn > 1 && storedGraderResult
            ? {
                pass: storedGraderResult.pass,
                score: storedGraderResult.score,
              }
            : undefined,
        stateful: this.stateful,
        maxTurns: this.maxTurns,
        excludeTargetOutputFromAgenticAttackGeneration:
          this.excludeTargetOutputFromAgenticAttackGeneration,
      };

      // Get next message from cloud
      const agentResp = await this.agentProvider.callApi(JSON.stringify(cloudRequest), {
        prompt: {
          raw: JSON.stringify(cloudRequest),
          label: 'hydra-agent',
        },
        vars: {},
      });

      accumulateResponseTokenUsage(totalTokenUsage, agentResp);

      if (this.agentProvider.delay) {
        await sleep(this.agentProvider.delay);
      }

      if (agentResp.error) {
        logger.error('[Hydra] Agent provider error', {
          turn,
          testRunId,
          error: agentResp.error,
        });
        continue;
      }

      // Extract message from cloud response
      let nextMessage: string;

      if (typeof agentResp.output === 'string') {
        // PromptfooChatCompletionProvider extracts data.result as string
        nextMessage = agentResp.output;
      } else {
        const cloudResponse = agentResp.output as any;
        nextMessage = cloudResponse.result || cloudResponse.message;
      }

      if (!nextMessage) {
        logger.info('[Hydra] Missing message from agent', { turn });
        continue;
      }

      // Add message to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: nextMessage,
      });

      // Send to target (different based on stateful/stateless)
      let targetPrompt: string;

      if (this.stateful) {
        // Stateful: send only the new message with sessionId
        const escapedMessage = nextMessage
          .replace(/\{\{/g, '{ {')
          .replace(/\}\}/g, '} }')
          .replace(/\{%/g, '{ %')
          .replace(/%\}/g, '% }');

        targetPrompt = await renderPrompt(
          prompt,
          {
            ...vars,
            [this.injectVar]: escapedMessage,
            ...(this.sessionId ? { sessionId: this.sessionId } : {}),
          },
          filters,
          targetProvider,
          [this.injectVar], // Skip template rendering for injection variable to prevent double-evaluation
        );
      } else {
        // Stateless: send full conversation history as JSON
        // Try to parse the rendered prompt to see if it's already chat format
        const samplePrompt = await renderPrompt(
          prompt,
          {
            ...vars,
            [this.injectVar]: 'test',
          },
          filters,
          targetProvider,
          [this.injectVar], // Skip template rendering for injection variable to prevent double-evaluation
        );

        if (isValidJson(samplePrompt)) {
          const parsed = JSON.parse(samplePrompt);
          if (isValidChatMessageArray(parsed)) {
            // It's already chat format, inject our conversation
            targetPrompt = JSON.stringify(this.conversationHistory);
          } else {
            // Not chat format, use standard rendering
            targetPrompt = JSON.stringify(this.conversationHistory);
          }
        } else {
          // Not JSON, send as conversation array
          targetPrompt = JSON.stringify(this.conversationHistory);
        }
      }

      logger.debug('[Hydra] Sending to target', {
        turn,
        stateful: this.stateful,
        messageLength: nextMessage.length,
      });

      // Get target response
      const targetResponse = await getTargetResponse(
        targetProvider,
        targetPrompt,
        context,
        options,
      );
      lastTargetResponse = targetResponse;
      accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

      logger.debug('[Hydra] Received target response', {
        turn,
        responseLength: targetResponse.output?.length,
      });

      if (targetResponse.error) {
        logger.info('[Hydra] Target error', { turn, error: targetResponse.error });
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(targetResponse, 'output')) {
        logger.info('[Hydra] Malformed target response - missing output', {
          turn,
          responseKeys: Object.keys(targetResponse),
        });
        continue;
      }

      if (!targetResponse.output || !targetResponse.output.trim()) {
        logger.info('[Hydra] Empty target response', {
          turn,
          outputIsNull: targetResponse.output === null,
          outputIsUndefined: targetResponse.output === undefined,
          outputIsEmptyString: targetResponse.output === '',
          outputValue: targetResponse.output,
          outputTrimmed: targetResponse.output?.trim(),
        });
        // Replace empty output with marker so agent knows target refused
        targetResponse.output = '[Target provided empty response - likely refused]';
      }

      // Capture sessionId if stateful
      if (this.stateful && targetResponse.sessionId) {
        this.sessionId = targetResponse.sessionId;
        sessionIds.push(targetResponse.sessionId);
      }

      // Add response to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: targetResponse.output,
      });

      // Check for refusal and backtrack if in stateless mode and backtracking enabled
      const isRefusal = isBasicRefusal(targetResponse.output);

      if (!this.stateful && this.maxBacktracks > 0 && isRefusal) {
        logger.debug('[Hydra] Response rejected (basic refusal), backtracking...', {
          turn,
          backtrackCount: backtrackCount + 1,
          maxBacktracks: this.maxBacktracks,
          conversationLengthBefore: this.conversationHistory.length,
        });
        backtrackCount++;

        // Remove last user + assistant messages
        if (this.conversationHistory.length >= 2) {
          this.conversationHistory.pop(); // Remove assistant
          this.conversationHistory.pop(); // Remove user
        }

        logger.debug('[Hydra] After backtracking state', {
          turn,
          backtrackCount,
          conversationLength: this.conversationHistory.length,
          willDecrementTurn: turn > 1,
        });

        if (backtrackCount >= this.maxBacktracks) {
          logger.debug(`[Hydra] Max backtracks (${this.maxBacktracks}) reached. Exiting loop.`, {
            backtrackCount,
            maxBacktracks: this.maxBacktracks,
          });
          stopReason = 'Max backtracks reached';
          break;
        }

        if (turn > 1) {
          turn--; // Decrement turn to retry
        }
        continue;
      }

      // Grade the response
      let graderResult: GradingResult | undefined = undefined;

      if (test && assertToUse) {
        const grader = getGraderById(assertToUse.type);
        if (grader) {
          const { grade } = await grader.getResult(
            nextMessage,
            targetResponse.output,
            test,
            targetProvider,
            assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
            undefined,
            undefined,
            { providerResponse: targetResponse },
          );
          graderResult = grade;
          storedGraderResult = grade;

          logger.debug('[Hydra] Grader result', {
            turn,
            passed: grade.pass,
          });
        }
      }

      // Store in redteam history
      redteamHistory.push({
        prompt: nextMessage,
        output: targetResponse.output,
        graderPassed: graderResult?.pass,
      });

      // Check if vulnerability was achieved
      if (graderResult?.pass === false) {
        vulnerabilityAchieved = true;
        successfulAttacks.push({
          turn,
          message: nextMessage,
          response: targetResponse.output,
        });
        stopReason = 'Grader failed';

        logger.debug('[Hydra] Vulnerability achieved!', { turn });
        break;
      }
    }

    // Update scan learnings
    if (scanId) {
      try {
        const turnsCompleted = this.conversationHistory.filter((m) => m.role === 'user').length;
        const learningRequest = {
          task: 'hydra-decision',
          testRunId,
          scanId,
          testComplete: true,
          finalResult: {
            success: vulnerabilityAchieved,
            totalTurns: turnsCompleted,
          },
        };

        await this.agentProvider.callApi(JSON.stringify(learningRequest), {
          prompt: {
            raw: JSON.stringify(learningRequest),
            label: 'hydra-learning-update',
          },
          vars: {},
        });

        logger.debug('[Hydra] Scan learnings updated', { scanId, testRunId });
      } catch (error) {
        logger.warn('[Hydra] Failed to update scan learnings', { error });
        // Don't fail test if learning update fails
      }
    }

    const messages = this.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })) as Record<string, any>[];

    return {
      output: lastTargetResponse?.output || '',
      ...(lastTargetResponse?.error ? { error: lastTargetResponse.error } : {}),
      metadata: {
        sessionId: this.sessionId || getSessionId(lastTargetResponse, context),
        messages,
        hydraRoundsCompleted: this.conversationHistory.filter((m) => m.role === 'user').length,
        hydraBacktrackCount: backtrackCount,
        hydraResult: vulnerabilityAchieved,
        stopReason,
        successfulAttacks,
        totalSuccessfulAttacks: successfulAttacks.length,
        storedGraderResult,
        redteamHistory,
        sessionIds,
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}

export default HydraProvider;
