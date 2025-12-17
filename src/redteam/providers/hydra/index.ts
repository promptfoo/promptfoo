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
import {
  applyRuntimeTransforms,
  type LayerConfig,
  type MediaData,
  type TransformResult,
} from '../../shared/runtimeTransform';
import { Strategies } from '../../strategies';
import type { BaseRedteamMetadata } from '../../types';
import { getSessionId, isBasicRefusal } from '../../util';
import { isBlobStorageEnabled } from '../../../blobs/extractor';
import { shouldAttemptRemoteBlobUpload } from '../../../blobs/remoteUpload';
import {
  externalizeResponseForRedteamHistory,
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
    promptAudio?: MediaData;
    promptImage?: MediaData;
    output: string;
    outputAudio?: MediaData;
    outputImage?: MediaData;
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
  /**
   * Per-turn layer transforms to apply to each turn's prompt before sending to target.
   * This enables composing Hydra with delivery strategies like audio, base64, etc.
   * Set by the layer strategy when used as: layer: { steps: [hydra, audio] }
   */
  _perTurnLayers?: LayerConfig[];
}

function scrubOutputForHistory(output: string): string {
  if (typeof output !== 'string') {
    return output;
  }

  // Look for OpenAI-style JSON with b64_json fields
  const b64Match = output.match(/"b64_json"\s*:\s*"([^"]{200,})"/);
  if (b64Match) {
    return `[binary output redacted; b64_json length=${b64Match[1].length}]`;
  }

  // Generic base64-ish heuristic
  const compact = output.replace(/\s+/g, '');
  if (compact.length > 2000 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    return `[binary output redacted; length≈${compact.length}]`;
  }

  return output;
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
  private readonly perTurnLayers: LayerConfig[];
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
    this.perTurnLayers = config._perTurnLayers ?? [];

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
      perTurnLayers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
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

    let redteamHistory: Array<{
      prompt: string;
      promptAudio?: MediaData;
      promptImage?: MediaData;
      output: string;
      outputAudio?: MediaData;
      outputImage?: MediaData;
      graderPassed: boolean | undefined;
    }> = [];
    let lastTransformResult: TransformResult | undefined;

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
      const agentResp = await this.agentProvider.callApi(
        JSON.stringify(cloudRequest),
        {
          prompt: {
            raw: JSON.stringify(cloudRequest),
            label: 'hydra-agent',
          },
          vars: {},
        },
        options,
      );

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

      // ═══════════════════════════════════════════════════════════════════════
      // Apply per-turn layer transforms if configured (e.g., audio, base64)
      // This enables: layer: { steps: [hydra, audio] }
      // ═══════════════════════════════════════════════════════════════════════
      let finalTargetPrompt = targetPrompt;
      lastTransformResult = undefined;
      if (this.perTurnLayers.length > 0) {
        logger.debug('[Hydra] Applying per-turn transforms', {
          turn,
          layers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
        });
        // Transform the actual message content (nextMessage), not the full targetPrompt
        // This ensures we convert just the text to audio, not the JSON structure
        lastTransformResult = await applyRuntimeTransforms(
          nextMessage,
          this.injectVar,
          this.perTurnLayers,
          Strategies,
        );

        // Skip turn if transform failed
        if (lastTransformResult.error) {
          logger.warn('[Hydra] Transform failed, skipping turn', {
            turn,
            error: lastTransformResult.error,
          });
          // Remove the user message we added since we're skipping
          this.conversationHistory.pop();
          continue;
        }

        // For audio/image transforms, send a hybrid format:
        // - Previous turns as text (for context)
        // - Current turn as audio/image (the actual attack)
        // This allows the target model to understand conversation context while receiving the current attack in the transformed format
        if (lastTransformResult.audio || lastTransformResult.image) {
          // Build hybrid payload with conversation history + current transformed turn
          const historyWithoutCurrentTurn = this.conversationHistory.slice(0, -1);
          const hybridPayload = {
            _promptfoo_audio_hybrid: true,
            history: historyWithoutCurrentTurn,
            currentTurn: {
              role: 'user' as const,
              transcript: nextMessage, // Original text for reference
              ...(lastTransformResult.audio && {
                audio: lastTransformResult.audio,
              }),
              ...(lastTransformResult.image && {
                image: lastTransformResult.image,
              }),
            },
          };
          finalTargetPrompt = JSON.stringify(hybridPayload);
          logger.debug('[Hydra] Using hybrid format (history + audio/image current turn)', {
            turn,
            historyLength: historyWithoutCurrentTurn.length,
            hasAudio: !!lastTransformResult.audio,
            hasImage: !!lastTransformResult.image,
          });
        } else {
          // No audio/image, just use the transformed text
          finalTargetPrompt = lastTransformResult.prompt;
        }

        logger.debug('[Hydra] Per-turn transforms applied', {
          turn,
          originalLength: nextMessage.length,
          transformedLength: finalTargetPrompt.length,
          hasAudio: !!lastTransformResult.audio,
          hasImage: !!lastTransformResult.image,
        });
      }

      // Get target response
      let targetResponse = await getTargetResponse(
        targetProvider,
        finalTargetPrompt,
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

      // Externalize blobs to avoid token bloat in Hydra/meta prompts
      if (isBlobStorageEnabled() || shouldAttemptRemoteBlobUpload()) {
        const beforeOutput = targetResponse.output;
        targetResponse = await externalizeResponseForRedteamHistory(targetResponse, {
          evalId: context?.evaluationId,
          testIdx: context?.testIdx,
          promptIdx: context?.promptIdx,
        });
        if (targetResponse.output !== beforeOutput) {
          logger.debug('[Hydra] Externalized binary output', {
            turn,
            beforeLength: beforeOutput?.length,
            afterLength: targetResponse.output?.length,
            blobUris:
              targetResponse.metadata && 'blobUris' in targetResponse.metadata
                ? targetResponse.metadata.blobUris
                : undefined,
          });
        } else if (typeof targetResponse.output === 'string') {
          logger.debug('[Hydra] Binary output not externalized (using in-band)', {
            turn,
            responseLength: targetResponse.output.length,
          });
        }
      }

      const historyOutput =
        isBlobStorageEnabled() || shouldAttemptRemoteBlobUpload()
          ? scrubOutputForHistory(targetResponse.output)
          : targetResponse.output;

      // Add response to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: historyOutput,
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
          );
          graderResult = grade;
          storedGraderResult = grade;

          logger.debug('[Hydra] Grader result', {
            turn,
            passed: grade.pass,
          });
        }
      }

      // Store in redteam history (with audio/image if transforms were applied)
      redteamHistory.push({
        prompt: nextMessage,
        promptAudio: lastTransformResult?.audio,
        promptImage: lastTransformResult?.image,
        output: historyOutput,
        outputAudio: targetResponse.audio
          ? { data: targetResponse.audio.data || '', format: targetResponse.audio.format || 'wav' }
          : undefined,
        // Note: outputImage would come from provider if model responds with image
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

        const learningResponse = await this.agentProvider.callApi(
          JSON.stringify(learningRequest),
          {
            prompt: {
              raw: JSON.stringify(learningRequest),
              label: 'hydra-learning-update',
            },
            vars: {},
          },
          options,
        );
        accumulateResponseTokenUsage(totalTokenUsage, learningResponse);

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
