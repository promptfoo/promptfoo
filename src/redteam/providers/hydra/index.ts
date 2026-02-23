import { isBlobStorageEnabled } from '../../../blobs/extractor';
import { shouldAttemptRemoteBlobUpload } from '../../../blobs/remoteUpload';
import { renderPrompt } from '../../../evaluatorHelpers';
import logger from '../../../logger';
import { PromptfooChatCompletionProvider } from '../../../providers/promptfoo';
import {
  extractTraceIdFromTraceparent,
  fetchTraceContext,
  type TraceContextData,
} from '../../../tracing/traceContext';
import invariant from '../../../util/invariant';
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
import { checkExfilTracking } from '../../strategies/indirectWebPwn';
import {
  extractInputVarsFromPrompt,
  extractPromptFromTags,
  getSessionId,
  isBasicRefusal,
} from '../../util';
import {
  buildGraderResultAssertion,
  externalizeResponseForRedteamHistory,
  getTargetResponse,
  type Message,
  type TargetResponse,
} from '../shared';
import { formatTraceForMetadata, formatTraceSummary } from '../traceFormatting';
import { resolveTracingOptions } from '../tracingOptions';

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
  VarValue,
} from '../../../types/index';
import type { BaseRedteamMetadata } from '../../types';

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
    traceSummary?: string;
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
    trace?: Record<string, unknown>;
    traceSummary?: string;
  }>;
  sessionIds: string[];
  traceSnapshots?: Record<string, unknown>[];
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
  /**
   * Multi-input schema for generating multiple vars at each turn.
   * Keys are variable names, values are descriptions.
   */
  inputs?: Record<string, string>;
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
      // Pass inputs schema for multi-input mode
      inputs: this.config.inputs as Record<string, string> | undefined,
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

  private buildTargetPrompt(
    processedMessage: string,
    currentInputVars: Record<string, string> | null,
    prompt: Prompt,
    vars: Record<string, VarValue>,
    filters: NunjucksFilterMap | undefined,
    targetProvider: ApiProvider,
  ): Promise<string> {
    if (this.stateful) {
      const escapedMessage = processedMessage
        .replace(/\{\{/g, '{ {')
        .replace(/\}\}/g, '} }')
        .replace(/\{%/g, '{ %')
        .replace(/%\}/g, '% }');

      const updatedVars: Record<string, VarValue> = {
        ...vars,
        [this.injectVar]: escapedMessage,
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
        ...(currentInputVars || {}),
      };

      return renderPrompt(prompt, updatedVars, filters, targetProvider, [this.injectVar]);
    }

    // Stateless: always send the full conversation as JSON
    return Promise.resolve(JSON.stringify(this.conversationHistory));
  }

  private async applyHydraPerTurnTransforms(
    nextMessage: string,
    context: CallApiContextParams | undefined,
    test: AtomicTestCase | undefined,
  ): Promise<{ finalTargetPrompt: string; transformResult: TransformResult } | null> {
    if (this.perTurnLayers.length === 0) {
      return null;
    }

    logger.debug('[Hydra] Applying per-turn transforms', {
      layers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
    });

    const transformResult = await applyRuntimeTransforms(
      nextMessage,
      this.injectVar,
      this.perTurnLayers,
      Strategies,
      {
        evaluationId: context?.evaluationId,
        testCaseId: test?.metadata?.testCaseId as string | undefined,
        purpose: test?.metadata?.purpose as string | undefined,
        goal: test?.metadata?.goal as string | undefined,
      },
    );

    if (transformResult.error) {
      return { finalTargetPrompt: '', transformResult };
    }

    let finalTargetPrompt: string;
    if (transformResult.audio || transformResult.image) {
      const historyWithoutCurrentTurn = this.conversationHistory.slice(0, -1);
      const hybridPayload = {
        _promptfoo_audio_hybrid: true,
        history: historyWithoutCurrentTurn,
        currentTurn: {
          role: 'user' as const,
          transcript: nextMessage,
          ...(transformResult.audio && { audio: transformResult.audio }),
          ...(transformResult.image && { image: transformResult.image }),
        },
      };
      finalTargetPrompt = JSON.stringify(hybridPayload);
    } else {
      finalTargetPrompt = transformResult.prompt;
    }

    return { finalTargetPrompt, transformResult };
  }

  private async fetchHydraTrace(
    iterationStart: number,
    context: CallApiContextParams | undefined,
    tracingOptions: ReturnType<typeof resolveTracingOptions>,
    traceSnapshots: TraceContextData[],
  ): Promise<{ traceContext: TraceContextData | null; computedTraceSummary: string | undefined }> {
    const traceparent = context?.traceparent ?? undefined;
    const traceId = traceparent ? extractTraceIdFromTraceparent(traceparent) : null;

    if (!traceId) {
      return { traceContext: null, computedTraceSummary: undefined };
    }

    const traceContext = await fetchTraceContext(traceId, {
      earliestStartTime: iterationStart,
      includeInternalSpans: tracingOptions.includeInternalSpans,
      maxSpans: tracingOptions.maxSpans,
      maxDepth: tracingOptions.maxDepth,
      maxRetries: tracingOptions.maxRetries,
      retryDelayMs: tracingOptions.retryDelayMs,
      spanFilter: tracingOptions.spanFilter,
      sanitizeAttributes: tracingOptions.sanitizeAttributes,
    });

    let computedTraceSummary: string | undefined;
    if (traceContext) {
      traceSnapshots.push(traceContext);
      if (tracingOptions.includeInAttack || tracingOptions.includeInGrading) {
        computedTraceSummary = formatTraceSummary(traceContext);
      }
    }

    return { traceContext, computedTraceSummary };
  }

  private async buildHydraGradingContext(
    lastTransformResult: TransformResult | undefined,
    targetResponse: TargetResponse,
    traceContext: TraceContextData | null,
    tracingOptions: ReturnType<typeof resolveTracingOptions>,
    gradingTraceSummary: string | undefined,
    context: CallApiContextParams | undefined,
  ): Promise<
    | {
        traceContext?: TraceContextData | null;
        traceSummary?: string;
        wasExfiltrated?: boolean;
        exfilCount?: number;
        exfilRecords?: Array<{
          timestamp: string;
          ip: string;
          userAgent: string;
          queryParams: Record<string, string>;
        }>;
      }
    | undefined
  > {
    const webPageUuid = lastTransformResult?.metadata?.webPageUuid as string | undefined;
    if (webPageUuid) {
      const webPageUrl = lastTransformResult?.metadata?.webPageUrl as string | undefined;
      const evalId =
        context?.evaluationId ??
        (webPageUrl?.match(/\/dynamic-pages\/([^/]+)\//)?.[1] as string | undefined);

      logger.debug('[Hydra] Fetching exfil tracking from server API', {
        webPageUuid,
        evalId,
        source: 'lastTransformResult.metadata',
      });

      try {
        const exfilData = await checkExfilTracking(webPageUuid, evalId);
        if (exfilData) {
          return {
            ...(tracingOptions.includeInGrading
              ? { traceContext, traceSummary: gradingTraceSummary }
              : {}),
            wasExfiltrated: exfilData.wasExfiltrated,
            exfilCount: exfilData.exfilCount,
            exfilRecords: exfilData.exfilRecords,
          };
        }
      } catch (error) {
        logger.warn('[Hydra] Failed to fetch exfil tracking from server', { error, webPageUuid });
      }
    }

    if (targetResponse.metadata?.wasExfiltrated !== undefined) {
      logger.debug('[Hydra] Using exfil data from provider response metadata (fallback)');
      return {
        ...(tracingOptions.includeInGrading
          ? { traceContext, traceSummary: gradingTraceSummary }
          : {}),
        wasExfiltrated: Boolean(targetResponse.metadata.wasExfiltrated),
        exfilCount: Number(targetResponse.metadata.exfilCount) || 0,
        exfilRecords: [],
      };
    }

    if (tracingOptions.includeInGrading) {
      return { traceContext, traceSummary: gradingTraceSummary };
    }

    return undefined;
  }

  private handleHydraBacktrack(
    turn: number,
    backtrackCount: number,
    maxBacktracks: number,
  ): { newBacktrackCount: number; shouldExit: boolean; newTurn: number } {
    const newBacktrackCount = backtrackCount + 1;

    logger.debug('[Hydra] Response rejected (basic refusal), backtracking...', {
      turn,
      backtrackCount: newBacktrackCount,
      maxBacktracks,
      conversationLengthBefore: this.conversationHistory.length,
    });

    if (this.conversationHistory.length >= 2) {
      this.conversationHistory.pop();
      this.conversationHistory.pop();
    }

    logger.debug('[Hydra] After backtracking state', {
      turn,
      backtrackCount: newBacktrackCount,
      conversationLength: this.conversationHistory.length,
      willDecrementTurn: turn > 1,
    });

    if (newBacktrackCount >= maxBacktracks) {
      logger.debug(`[Hydra] Max backtracks (${maxBacktracks}) reached. Exiting loop.`, {
        backtrackCount: newBacktrackCount,
        maxBacktracks,
      });
      return { newBacktrackCount, shouldExit: true, newTurn: turn };
    }

    return { newBacktrackCount, shouldExit: false, newTurn: turn > 1 ? turn - 1 : turn };
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

  private async runHydraAttackLoop({
    prompt,
    filters,
    vars,
    goal,
    targetProvider,
    context,
    options,
    test,
    scanId,
    testRunId,
    tracingOptions,
    shouldFetchTrace,
    traceSnapshots,
    totalTokenUsage,
    redteamHistory,
    assertToUse,
    getGraderById,
  }: {
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, VarValue>;
    goal: string;
    targetProvider: ApiProvider;
    context: CallApiContextParams | undefined;
    options: CallApiOptionsParams | undefined;
    test: AtomicTestCase | undefined;
    scanId: string;
    testRunId: string;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    traceSnapshots: TraceContextData[];
    totalTokenUsage: TokenUsage;
    redteamHistory: Array<{
      prompt: string;
      promptAudio?: MediaData;
      promptImage?: MediaData;
      output: string;
      outputAudio?: MediaData;
      outputImage?: MediaData;
      graderPassed: boolean | undefined;
      trace?: Record<string, unknown>;
      traceSummary?: string;
      inputVars?: Record<string, string>;
    }>;
    assertToUse: { type: string; value?: unknown } | undefined;
    getGraderById: (id: string) => unknown;
  }): Promise<{
    vulnerabilityAchieved: boolean;
    stopReason: 'Grader failed' | 'Max turns reached' | 'Max backtracks reached';
    storedGraderResult: GradingResult | undefined;
    lastTargetResponse: TargetResponse | undefined;
    backtrackCount: number;
    sessionIds: string[];
    successfulAttacks: Array<{
      turn: number;
      message: string;
      response: string;
      traceSummary?: string;
    }>;
    lastTransformDisplayVars: Record<string, string> | undefined;
    lastFinalAttackPrompt: string | undefined;
  }> {
    const sessionIds: string[] = [];
    const successfulAttacks: Array<{
      turn: number;
      message: string;
      response: string;
      traceSummary?: string;
    }> = [];
    let vulnerabilityAchieved = false;
    let stopReason: 'Grader failed' | 'Max turns reached' | 'Max backtracks reached' =
      'Max turns reached';
    let storedGraderResult: GradingResult | undefined;
    let lastTargetResponse: TargetResponse | undefined;
    let backtrackCount = 0;
    let lastTransformDisplayVars: Record<string, string> | undefined;
    let lastFinalAttackPrompt: string | undefined;
    let previousTraceSummary: string | undefined;

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      logger.debug(`[Hydra] Turn ${turn}/${this.maxTurns}`);

      const turnResult = await this.runHydraTurn({
        turn,
        prompt,
        filters,
        vars,
        goal,
        targetProvider,
        context,
        options,
        test,
        scanId,
        testRunId,
        tracingOptions,
        shouldFetchTrace,
        traceSnapshots,
        totalTokenUsage,
        storedGraderResult,
        assertToUse,
        getGraderById: getGraderById as any,
        previousTraceSummary,
        redteamHistory,
        lastTransformDisplayVars,
        backtrackCount,
      });

      if (turnResult.exit) {
        stopReason = turnResult.stopReason ?? stopReason;
        backtrackCount = turnResult.newBacktrackCount ?? backtrackCount;
        break;
      }

      if (turnResult.skip) {
        backtrackCount = turnResult.newBacktrackCount ?? backtrackCount;
        if (turnResult.newTurn !== undefined && turnResult.newTurn !== turn) {
          turn = turnResult.newTurn;
        }
        continue;
      }

      if (turnResult.targetResponse) {
        lastTargetResponse = turnResult.targetResponse;
        if (this.stateful && turnResult.targetResponse.sessionId) {
          sessionIds.push(turnResult.targetResponse.sessionId);
        }
      }
      lastFinalAttackPrompt = turnResult.lastFinalAttackPrompt ?? lastFinalAttackPrompt;
      storedGraderResult = turnResult.storedGraderResult ?? storedGraderResult;
      previousTraceSummary = turnResult.newPreviousTraceSummary ?? previousTraceSummary;
      lastTransformDisplayVars = turnResult.newLastTransformDisplayVars ?? lastTransformDisplayVars;

      if (turnResult.graderResult?.pass === false) {
        vulnerabilityAchieved = true;
        successfulAttacks.push({
          turn,
          message: turnResult.nextMessage || '',
          response: turnResult.targetResponse?.output || '',
          traceSummary: turnResult.computedTraceSummary,
        });
        stopReason = 'Grader failed';
        logger.debug('[Hydra] Vulnerability achieved!', { turn });
        break;
      }
    }

    return {
      vulnerabilityAchieved,
      stopReason,
      storedGraderResult,
      lastTargetResponse,
      backtrackCount,
      sessionIds,
      successfulAttacks,
      lastTransformDisplayVars,
      lastFinalAttackPrompt,
    };
  }

  private async updateHydraScanLearnings(
    scanId: string,
    testRunId: string,
    vulnerabilityAchieved: boolean,
    totalTokenUsage: TokenUsage,
    options: CallApiOptionsParams | undefined,
  ): Promise<void> {
    try {
      const turnsCompleted = this.conversationHistory.filter((m) => m.role === 'user').length;
      const learningRequest = {
        task: 'hydra-decision',
        testRunId,
        scanId,
        testComplete: true,
        finalResult: { success: vulnerabilityAchieved, totalTurns: turnsCompleted },
      };

      const learningResponse = await this.agentProvider.callApi(
        JSON.stringify(learningRequest),
        {
          prompt: { raw: JSON.stringify(learningRequest), label: 'hydra-learning-update' },
          vars: {},
        },
        options,
      );
      accumulateResponseTokenUsage(totalTokenUsage, learningResponse, { countAsRequest: false });
      logger.debug('[Hydra] Scan learnings updated', { scanId, testRunId });
    } catch (error) {
      logger.warn('[Hydra] Failed to update scan learnings', { error });
    }
  }

  private buildHydraCloudRequest({
    turn,
    goal,
    test,
    testRunId,
    scanId,
    storedGraderResult,
    tracingOptions,
    previousTraceSummary,
  }: {
    turn: number;
    goal: string;
    test: AtomicTestCase | undefined;
    testRunId: string;
    scanId: string;
    storedGraderResult: GradingResult | undefined;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    previousTraceSummary: string | undefined;
  }): Record<string, unknown> {
    const conversationHistoryForCloud = this.excludeTargetOutputFromAgenticAttackGeneration
      ? this.conversationHistory.map((msg) =>
          msg.role === 'assistant'
            ? { ...msg, content: '[Response hidden for privacy - grader feedback provided]' }
            : msg,
        )
      : this.conversationHistory;

    return {
      task: 'hydra-decision',
      testRunId,
      scanId,
      turn,
      goal,
      purpose: test?.metadata?.purpose,
      modifiers: test?.metadata?.modifiers,
      conversationHistory: conversationHistoryForCloud,
      ...(this.config.inputs && { inputs: this.config.inputs }),
      lastGraderResult:
        turn > 1 && storedGraderResult
          ? { pass: storedGraderResult.pass, score: storedGraderResult.score }
          : undefined,
      stateful: this.stateful,
      maxTurns: this.maxTurns,
      excludeTargetOutputFromAgenticAttackGeneration:
        this.excludeTargetOutputFromAgenticAttackGeneration,
      ...(tracingOptions.includeInAttack && previousTraceSummary
        ? { traceSummary: previousTraceSummary }
        : {}),
    };
  }

  private validateHydraTargetResponse(
    targetResponse: TargetResponse,
    turn: number,
  ): TargetResponse | null {
    if (targetResponse.error) {
      logger.info('[Hydra] Target error', { turn, error: targetResponse.error });
      return null;
    }

    if (!Object.prototype.hasOwnProperty.call(targetResponse, 'output')) {
      logger.info('[Hydra] Malformed target response - missing output', {
        turn,
        responseKeys: Object.keys(targetResponse),
      });
      return null;
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
      // Return a copy with the placeholder output
      return { ...targetResponse, output: '[Target provided empty response - likely refused]' };
    }

    return targetResponse;
  }

  private async runHydraGrader({
    test,
    assertToUse,
    getGraderById,
    nextMessage,
    targetResponse,
    targetProvider,
    lastTransformResult,
    traceContext,
    tracingOptions,
    gradingTraceSummary,
    context,
    storedGraderResult,
  }: {
    test: AtomicTestCase | undefined;
    assertToUse: { type: string; value?: unknown } | undefined;
    getGraderById: (
      id: string,
    ) =>
      | { getResult: (...args: unknown[]) => Promise<{ grade: GradingResult; rubric: string }> }
      | undefined;
    nextMessage: string;
    targetResponse: TargetResponse;
    targetProvider: ApiProvider;
    lastTransformResult: TransformResult | undefined;
    traceContext: TraceContextData | null;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    gradingTraceSummary: string | undefined;
    context: CallApiContextParams | undefined;
    storedGraderResult: GradingResult | undefined;
  }): Promise<{
    graderResult: GradingResult | undefined;
    newStoredGraderResult: GradingResult | undefined;
  }> {
    if (!test || !assertToUse) {
      return { graderResult: undefined, newStoredGraderResult: storedGraderResult };
    }
    const grader = getGraderById(assertToUse.type);
    if (!grader) {
      return { graderResult: undefined, newStoredGraderResult: storedGraderResult };
    }

    const gradingContext = await this.buildHydraGradingContext(
      lastTransformResult,
      targetResponse,
      traceContext,
      tracingOptions,
      gradingTraceSummary,
      context,
    );

    const { grade, rubric } = await grader.getResult(
      nextMessage,
      targetResponse.output,
      test,
      targetProvider,
      assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
      undefined,
      undefined,
      gradingContext,
    );
    const newStoredGraderResult = {
      ...grade,
      assertion: buildGraderResultAssertion(grade.assertion, assertToUse, rubric),
    };
    return { graderResult: grade, newStoredGraderResult };
  }

  private async externalizeHydraBlobs(
    targetResponse: TargetResponse,
    turn: number,
    context: CallApiContextParams | undefined,
  ): Promise<TargetResponse> {
    if (!isBlobStorageEnabled() && !shouldAttemptRemoteBlobUpload()) {
      return targetResponse;
    }
    const beforeOutput = targetResponse.output;
    const externalized = await externalizeResponseForRedteamHistory(targetResponse, {
      evalId: context?.evaluationId,
      testIdx: context?.testIdx,
      promptIdx: context?.promptIdx,
    });
    if (externalized.output !== beforeOutput) {
      logger.debug('[Hydra] Externalized binary output', {
        turn,
        beforeLength: beforeOutput?.length,
        afterLength: externalized.output?.length,
        blobUris:
          externalized.metadata && 'blobUris' in externalized.metadata
            ? externalized.metadata.blobUris
            : undefined,
      });
    } else if (typeof externalized.output === 'string') {
      logger.debug('[Hydra] Binary output not externalized (using in-band)', {
        turn,
        responseLength: externalized.output.length,
      });
    }
    return externalized;
  }

  private async runHydraTurn({
    turn,
    prompt,
    filters,
    vars,
    goal,
    targetProvider,
    context,
    options,
    test,
    scanId,
    testRunId,
    tracingOptions,
    shouldFetchTrace,
    traceSnapshots,
    totalTokenUsage,
    storedGraderResult,
    assertToUse,
    getGraderById,
    previousTraceSummary,
    redteamHistory,
    lastTransformDisplayVars,
  }: {
    turn: number;
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, VarValue>;
    goal: string;
    targetProvider: ApiProvider;
    context: CallApiContextParams | undefined;
    options: CallApiOptionsParams | undefined;
    test: AtomicTestCase | undefined;
    scanId: string;
    testRunId: string;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    traceSnapshots: TraceContextData[];
    totalTokenUsage: TokenUsage;
    storedGraderResult: GradingResult | undefined;
    assertToUse: { type: string; value?: unknown } | undefined;
    getGraderById: (
      id: string,
    ) =>
      | { getResult: (...args: unknown[]) => Promise<{ grade: GradingResult; rubric: string }> }
      | undefined;
    previousTraceSummary: string | undefined;
    redteamHistory: Array<{
      prompt: string;
      promptAudio?: MediaData;
      promptImage?: MediaData;
      output: string;
      outputAudio?: MediaData;
      outputImage?: MediaData;
      graderPassed: boolean | undefined;
      trace?: Record<string, unknown>;
      traceSummary?: string;
      inputVars?: Record<string, string>;
    }>;
    lastTransformDisplayVars: Record<string, string> | undefined;
    backtrackCount: number;
  }): Promise<{
    skip: boolean;
    exit: boolean;
    stopReason?: 'Grader failed' | 'Max backtracks reached';
    targetResponse?: TargetResponse;
    lastTransformResult?: TransformResult;
    lastFinalAttackPrompt?: string;
    nextMessage?: string;
    graderResult?: GradingResult;
    storedGraderResult?: GradingResult;
    newBacktrackCount?: number;
    newPreviousTraceSummary?: string;
    newLastTransformDisplayVars?: Record<string, string>;
    currentInputVars?: Record<string, string> | null;
    historyOutput?: string;
    traceContext?: TraceContextData | null;
    computedTraceSummary?: string;
    newTurn?: number;
  }> {
    const cloudRequest = this.buildHydraCloudRequest({
      turn,
      goal,
      test,
      testRunId,
      scanId,
      storedGraderResult,
      tracingOptions,
      previousTraceSummary,
    });

    const agentResp = await this.agentProvider.callApi(
      JSON.stringify(cloudRequest),
      { prompt: { raw: JSON.stringify(cloudRequest), label: 'hydra-agent' }, vars: {} },
      options,
    );

    accumulateResponseTokenUsage(totalTokenUsage, agentResp, { countAsRequest: false });

    if (this.agentProvider.delay) {
      await sleep(this.agentProvider.delay);
    }

    if (agentResp.error) {
      logger.debug('[Hydra] Agent provider error', { turn, testRunId, error: agentResp.error });
      return { skip: true, exit: false };
    }

    let nextMessage: string;
    if (typeof agentResp.output === 'string') {
      nextMessage = agentResp.output;
    } else {
      const cloudResponse = agentResp.output as any;
      nextMessage = cloudResponse.result || cloudResponse.message;
    }

    if (!nextMessage) {
      logger.info('[Hydra] Missing message from agent', { turn });
      return { skip: true, exit: false };
    }

    let processedMessage = nextMessage;
    const extractedPrompt = extractPromptFromTags(nextMessage);
    if (extractedPrompt) {
      processedMessage = extractedPrompt;
    }

    const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);

    this.conversationHistory.push({ role: 'user', content: processedMessage });

    const targetPrompt = await this.buildTargetPrompt(
      processedMessage,
      currentInputVars,
      prompt,
      vars,
      filters,
      targetProvider,
    );

    logger.debug('[Hydra] Sending to target', {
      turn,
      stateful: this.stateful,
      messageLength: nextMessage.length,
    });

    let finalTargetPrompt = targetPrompt;
    let lastTransformResult: TransformResult | undefined;
    const transformResult = await this.applyHydraPerTurnTransforms(nextMessage, context, test);
    if (transformResult !== null) {
      if (transformResult.transformResult.error) {
        logger.warn('[Hydra] Transform failed, skipping turn', {
          turn,
          error: transformResult.transformResult.error,
        });
        this.conversationHistory.pop();
        return { skip: true, exit: false };
      }
      finalTargetPrompt = transformResult.finalTargetPrompt;
      lastTransformResult = transformResult.transformResult;
      logger.debug('[Hydra] Per-turn transforms applied', {
        turn,
        originalLength: nextMessage.length,
        transformedLength: finalTargetPrompt.length,
        hasAudio: !!lastTransformResult.audio,
        hasImage: !!lastTransformResult.image,
      });
    }

    const newLastTransformDisplayVars =
      lastTransformResult?.displayVars ?? lastTransformDisplayVars;
    const lastFinalAttackPrompt = finalTargetPrompt;

    const iterationStart = Date.now();
    let targetResponse = await getTargetResponse(
      targetProvider,
      finalTargetPrompt,
      context,
      options,
    );
    accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

    let traceContext: TraceContextData | null = null;
    let computedTraceSummary: string | undefined;
    if (shouldFetchTrace) {
      const traceResult = await this.fetchHydraTrace(
        iterationStart,
        context,
        tracingOptions,
        traceSnapshots,
      );
      traceContext = traceResult.traceContext;
      computedTraceSummary = traceResult.computedTraceSummary;
    }

    logger.debug('[Hydra] Received target response', {
      turn,
      responseLength: targetResponse.output?.length,
      hasTrace: !!traceContext,
    });

    const validatedResponse = this.validateHydraTargetResponse(targetResponse, turn);
    if (validatedResponse === null) {
      return { skip: true, exit: false };
    }
    targetResponse = validatedResponse;

    if (this.stateful && targetResponse.sessionId) {
      this.sessionId = targetResponse.sessionId;
    }

    targetResponse = await this.externalizeHydraBlobs(targetResponse, turn, context);

    const historyOutput =
      isBlobStorageEnabled() || shouldAttemptRemoteBlobUpload()
        ? scrubOutputForHistory(targetResponse.output)
        : targetResponse.output;

    this.conversationHistory.push({ role: 'assistant', content: historyOutput });

    const isRefusal = isBasicRefusal(targetResponse.output);
    if (!this.stateful && this.maxBacktracks > 0 && isRefusal) {
      const backtrackState = this.handleHydraBacktrack(turn, backtrackCount, this.maxBacktracks);
      if (backtrackState.shouldExit) {
        return {
          skip: false,
          exit: true,
          stopReason: 'Max backtracks reached',
          newBacktrackCount: backtrackState.newBacktrackCount,
        };
      }
      return {
        skip: true,
        exit: false,
        newBacktrackCount: backtrackState.newBacktrackCount,
        newTurn: backtrackState.newTurn,
      };
    }

    const attackTraceSummary = tracingOptions.includeInAttack ? computedTraceSummary : undefined;
    const gradingTraceSummary = tracingOptions.includeInGrading ? computedTraceSummary : undefined;
    const newPreviousTraceSummary = attackTraceSummary;

    const { graderResult, newStoredGraderResult } = await this.runHydraGrader({
      test,
      assertToUse,
      getGraderById,
      nextMessage,
      targetResponse,
      targetProvider,
      lastTransformResult,
      traceContext,
      tracingOptions,
      gradingTraceSummary,
      context,
      storedGraderResult,
    });

    logger.debug('[Hydra] Grader result', { turn, passed: graderResult?.pass });

    redteamHistory.push({
      prompt: nextMessage,
      promptAudio: lastTransformResult?.audio,
      promptImage: lastTransformResult?.image,
      output: historyOutput,
      outputAudio: targetResponse.audio
        ? { data: targetResponse.audio.data || '', format: targetResponse.audio.format || 'wav' }
        : undefined,
      graderPassed: graderResult?.pass,
      trace: traceContext ? formatTraceForMetadata(traceContext) : undefined,
      traceSummary: computedTraceSummary,
      inputVars: currentInputVars,
    });

    return {
      skip: false,
      exit: false,
      targetResponse,
      lastTransformResult,
      lastFinalAttackPrompt,
      nextMessage,
      graderResult,
      storedGraderResult: newStoredGraderResult,
      newPreviousTraceSummary,
      newLastTransformDisplayVars,
      currentInputVars,
      historyOutput,
      traceContext,
      computedTraceSummary,
    };
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
    vars: Record<string, VarValue>;
    goal: string;
    targetProvider: ApiProvider;
    context?: CallApiContextParams;
    options?: CallApiOptionsParams;
    test?: AtomicTestCase;
  }): Promise<HydraResponse> {
    if (!this.scanId) {
      this.scanId = context?.evaluationId || crypto.randomUUID();
    }
    const scanId = context?.evaluationId || this.scanId;

    const tracingOptions = resolveTracingOptions({
      strategyId: 'hydra',
      test,
      config: this.config as unknown as Record<string, unknown>,
    });
    const shouldFetchTrace =
      tracingOptions.enabled && (tracingOptions.includeInAttack || tracingOptions.includeInGrading);
    const traceSnapshots: TraceContextData[] = [];

    logger.debug('[Hydra] Starting attack', {
      goal,
      scanId,
      maxTurns: this.maxTurns,
      stateful: this.stateful,
      tracingEnabled: tracingOptions.enabled,
    });

    this.conversationHistory = [];
    this.sessionId = undefined;
    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();
    const testRunId = `${context?.evaluationId || 'local'}-tc${context?.testCaseId || crypto.randomUUID().slice(0, 8)}`;

    const redteamHistory: Array<{
      prompt: string;
      promptAudio?: MediaData;
      promptImage?: MediaData;
      output: string;
      outputAudio?: MediaData;
      outputImage?: MediaData;
      graderPassed: boolean | undefined;
      trace?: Record<string, unknown>;
      traceSummary?: string;
      inputVars?: Record<string, string>;
    }> = [];

    const { getGraderById } = await import('../../graders');
    const assertToUse = (test?.assert?.find(
      (a: { type: string }) => a.type && a.type.includes(test.metadata?.pluginId),
    ) || test?.assert?.find((a: { type: string }) => a.type)) as
      | { type: string; value?: unknown }
      | undefined;

    const loopResult = await this.runHydraAttackLoop({
      prompt,
      filters,
      vars,
      goal,
      targetProvider,
      context,
      options,
      test,
      scanId,
      testRunId,
      tracingOptions,
      shouldFetchTrace,
      traceSnapshots,
      totalTokenUsage,
      redteamHistory,
      assertToUse,
      getGraderById,
    });

    const {
      vulnerabilityAchieved,
      stopReason,
      storedGraderResult,
      lastTargetResponse,
      backtrackCount,
      sessionIds,
      successfulAttacks,
      lastTransformDisplayVars,
      lastFinalAttackPrompt,
    } = loopResult;

    if (scanId) {
      await this.updateHydraScanLearnings(
        scanId,
        testRunId,
        vulnerabilityAchieved,
        totalTokenUsage,
        options,
      );
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
        traceSnapshots:
          traceSnapshots.length > 0
            ? traceSnapshots.map((t) => formatTraceForMetadata(t))
            : undefined,
        ...(lastTransformDisplayVars && { transformDisplayVars: lastTransformDisplayVars }),
        redteamFinalPrompt: lastFinalAttackPrompt || successfulAttacks[0]?.message,
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}

export default HydraProvider;
