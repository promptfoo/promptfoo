import { isBlobStorageEnabled } from '../../../blobs/extractor';
import { shouldAttemptRemoteBlobUpload } from '../../../blobs/remoteUpload';
import { renderPrompt } from '../../../evaluatorHelpers';
import { isLoggedIntoCloud } from '../../../globalConfig/accounts';
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
import { materializeInputVariablesWithMetadata } from '../../inputVariables';
import {
  getRemoteGenerationDisabledError,
  getRemoteGenerationExplicitlyDisabledError,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../../remoteGeneration';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
} from '../../remoteMaterialization';
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
  getGraderAssertionValue,
  getTargetResponse,
  isConversationEndedResponse,
  type Message,
  type TargetResponse,
  type TurnBacktrackingStopReason,
} from '../shared';
import { formatTraceForMetadata, formatTraceSummary } from '../traceFormatting';
import { resolveTracingOptions } from '../tracingOptions';

import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  GradingResult,
  Inputs,
  NunjucksFilterMap,
  Prompt,
  ProviderResponse,
  TokenUsage,
  VarValue,
} from '../../../types/index';
import type { RedteamGradingContext } from '../../grading/types';
import type { BaseRedteamMetadata } from '../../types';

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_BACKTRACKS = 10;

interface HydraMetadata extends BaseRedteamMetadata {
  hydraRoundsCompleted: number;
  hydraBacktrackCount: number;
  hydraResult: boolean;
  stopReason: TurnBacktrackingStopReason;
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
    inputVars?: Record<string, string>;
  }>;
  sessionIds: string[];
  traceSnapshots?: Record<string, unknown>[];
}

interface HydraResponse extends ProviderResponse {
  metadata: HydraMetadata;
}

interface HydraRunState {
  sessionIds: string[];
  successfulAttacks: Array<{
    turn: number;
    message: string;
    response: string;
    traceSummary?: string;
  }>;
  totalTokenUsage: TokenUsage;
  vulnerabilityAchieved: boolean;
  stopReason: TurnBacktrackingStopReason;
  storedGraderResult?: GradingResult;
  lastTargetResponse?: TargetResponse;
  backtrackCount: number;
  agentFailureError?: string;
  redteamHistory: HydraMetadata['redteamHistory'];
  lastTransformResult?: TransformResult;
  lastTransformDisplayVars?: Record<string, string>;
  lastFinalAttackPrompt?: string;
  previousTraceSummary?: string;
  traceSnapshots: TraceContextData[];
}

interface HydraMessageResult {
  nextMessage: string;
  processedMessage: string;
  currentRenderInputVars?: Record<string, string>;
}

interface HydraTargetPromptResult {
  finalTargetPrompt: string;
  transformResult?: TransformResult;
}

interface HydraTraceResult {
  traceContext: TraceContextData | null;
  computedTraceSummary?: string;
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
   * Keys are variable names, values are Inputs definitions: plain descriptions
   * or structured typed configs with fields like description, type, and config.
   */
  inputs?: Inputs;
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
    const configuredMaxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.maxTurns = isLoggedIntoCloud() ? configuredMaxTurns : Math.min(configuredMaxTurns, 10);
    this.maxBacktracks = config.maxBacktracks ?? DEFAULT_MAX_BACKTRACKS;

    this.stateful = config.stateful ?? false;
    this.excludeTargetOutputFromAgenticAttackGeneration =
      config.excludeTargetOutputFromAgenticAttackGeneration ?? false;
    this.perTurnLayers = config._perTurnLayers ?? [];

    if (this.stateful && this.maxBacktracks > 0) {
      logger.debug('[Hydra] Backtracking disabled in stateful mode');
    }

    // Hydra strategy requires remote generation
    if (!shouldGenerateRemote()) {
      throw new Error(
        neverGenerateRemote()
          ? getRemoteGenerationExplicitlyDisabledError('jailbreak:hydra strategy')
          : getRemoteGenerationDisabledError('jailbreak:hydra strategy'),
      );
    }

    this.agentProvider = new PromptfooChatCompletionProvider({
      task: 'hydra-decision',
      jsonOnly: true,
      preferSmallModel: false,
      // Pass inputs schema for multi-input mode
      inputs: this.config.inputs,
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

  private buildCloudRequest({
    goal,
    testRunId,
    scanId,
    turn,
    test,
    state,
    tracingOptions,
  }: {
    goal: string;
    testRunId: string;
    scanId: string;
    turn: number;
    test?: AtomicTestCase;
    state: HydraRunState;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
  }) {
    const conversationHistory = this.excludeTargetOutputFromAgenticAttackGeneration
      ? this.conversationHistory.map((message) =>
          message.role === 'assistant'
            ? { ...message, content: '[Response hidden for privacy - grader feedback provided]' }
            : message,
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
      conversationHistory,
      ...(this.config.inputs && { inputs: this.config.inputs }),
      lastGraderResult:
        turn > 1 && state.storedGraderResult
          ? {
              pass: state.storedGraderResult.pass,
              score: state.storedGraderResult.score,
            }
          : undefined,
      stateful: this.stateful,
      maxTurns: this.maxTurns,
      excludeTargetOutputFromAgenticAttackGeneration:
        this.excludeTargetOutputFromAgenticAttackGeneration,
      ...(tracingOptions.includeInAttack && state.previousTraceSummary
        ? { traceSummary: state.previousTraceSummary }
        : {}),
    };
  }

  private async getNextHydraMessage({
    goal,
    testRunId,
    scanId,
    turn,
    test,
    options,
    state,
    tracingOptions,
  }: {
    goal: string;
    testRunId: string;
    scanId: string;
    turn: number;
    test?: AtomicTestCase;
    options?: CallApiOptionsParams;
    state: HydraRunState;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
  }): Promise<HydraMessageResult | null> {
    const cloudRequest = this.buildCloudRequest({
      goal,
      testRunId,
      scanId,
      turn,
      test,
      state,
      tracingOptions,
    });
    const serializedRequest = JSON.stringify(cloudRequest);
    const agentResp = await this.agentProvider.callApi(
      serializedRequest,
      {
        prompt: {
          raw: serializedRequest,
          label: 'hydra-agent',
        },
        vars: {},
      },
      options,
    );
    accumulateResponseTokenUsage(state.totalTokenUsage, agentResp, { countAsRequest: false });

    if (this.agentProvider.delay) {
      await sleep(this.agentProvider.delay);
    }
    if (agentResp.error) {
      logger.debug('[Hydra] Agent provider error', { turn, testRunId, error: agentResp.error });
      state.agentFailureError = agentResp.error;
      return null;
    }

    const cloudResponse = agentResp.output as any;
    const nextMessage = typeof agentResp.output === 'string'
      ? agentResp.output
      : cloudResponse?.result || cloudResponse?.message;
    if (!nextMessage) {
      logger.info('[Hydra] Missing message from agent', { turn });
      state.agentFailureError = 'Hydra agent did not return an attack message';
      return null;
    }

    let processedMessage = nextMessage;
    const extractedPrompt = extractPromptFromTags(nextMessage);
    if (extractedPrompt) {
      processedMessage = extractedPrompt;
    }
    if (this.config.inputs && shouldGenerateRemote()) {
      assertRemoteMaterializationHandled(agentResp, 'Hydra multi-input generation');
    }

    const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);
    if (
      this.config.inputs &&
      shouldGenerateRemote() &&
      !currentInputVars &&
      !agentResp.materializedVars
    ) {
      logger.warn('[Hydra] Remote multi-input generation returned an invalid prompt format', {
        turn,
        messagePreview: processedMessage.slice(0, 200),
      });
      state.agentFailureError = 'Hydra remote multi-input generation returned an invalid prompt format';
      return null;
    }

    let materializedInputVars:
      | Awaited<ReturnType<typeof materializeInputVariablesWithMetadata>>
      | undefined;
    if ((currentInputVars || agentResp.materializedVars) && this.config.inputs) {
      materializedInputVars = shouldGenerateRemote()
        ? buildRemoteMaterializedInputVariables(agentResp, currentInputVars ?? {}, this.config.inputs)
        : await materializeInputVariablesWithMetadata(currentInputVars!, this.config.inputs, {
            materializationIndex: turn,
            pluginId: 'hydra',
            provider: this.agentProvider,
            purpose: test?.metadata?.purpose as string | undefined,
          });
    }

    return {
      nextMessage,
      processedMessage,
      currentRenderInputVars: materializedInputVars?.vars ?? currentInputVars,
    };
  }

  private async buildHydraTargetPrompt({
    prompt,
    filters,
    vars,
    targetProvider,
    message,
    turn,
    context,
    test,
  }: {
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, VarValue>;
    targetProvider: ApiProvider;
    message: HydraMessageResult;
    turn: number;
    context?: CallApiContextParams;
    test?: AtomicTestCase;
  }): Promise<HydraTargetPromptResult | null> {
    this.conversationHistory.push({ role: 'user', content: message.processedMessage });

    let targetPrompt: string;
    if (this.stateful) {
      const escapedMessage = message.processedMessage
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
          ...(message.currentRenderInputVars || {}),
        },
        filters,
        targetProvider,
        [this.injectVar],
      );
    } else {
      await renderPrompt(
        prompt,
        { ...vars, [this.injectVar]: 'test' },
        filters,
        targetProvider,
        [this.injectVar],
      );
      targetPrompt = JSON.stringify(this.conversationHistory);
    }

    logger.debug('[Hydra] Sending to target', {
      turn,
      stateful: this.stateful,
      messageLength: message.nextMessage.length,
    });

    if (this.perTurnLayers.length === 0) {
      return { finalTargetPrompt: targetPrompt };
    }

    logger.debug('[Hydra] Applying per-turn transforms', {
      turn,
      layers: this.perTurnLayers.map((layer) => (typeof layer === 'string' ? layer : layer.id)),
    });
    const transformResult = await applyRuntimeTransforms(
      message.nextMessage,
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
      logger.warn('[Hydra] Transform failed, skipping turn', { turn, error: transformResult.error });
      this.conversationHistory.pop();
      return null;
    }

    let finalTargetPrompt = transformResult.prompt;
    if (transformResult.audio || transformResult.image) {
      const historyWithoutCurrentTurn = this.conversationHistory.slice(0, -1);
      finalTargetPrompt = JSON.stringify({
        _promptfoo_audio_hybrid: true,
        history: historyWithoutCurrentTurn,
        currentTurn: {
          role: 'user' as const,
          transcript: message.nextMessage,
          ...(transformResult.audio && { audio: transformResult.audio }),
          ...(transformResult.image && { image: transformResult.image }),
        },
      });
      logger.debug('[Hydra] Using hybrid format (history + audio/image current turn)', {
        turn,
        historyLength: historyWithoutCurrentTurn.length,
        hasAudio: !!transformResult.audio,
        hasImage: !!transformResult.image,
      });
    }
    logger.debug('[Hydra] Per-turn transforms applied', {
      turn,
      originalLength: message.nextMessage.length,
      transformedLength: finalTargetPrompt.length,
      hasAudio: !!transformResult.audio,
      hasImage: !!transformResult.image,
    });

    return { finalTargetPrompt, transformResult };
  }

  private async captureTrace({
    context,
    iterationStart,
    tracingOptions,
    shouldFetchTrace,
    state,
  }: {
    context?: CallApiContextParams;
    iterationStart: number;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    state: HydraRunState;
  }): Promise<HydraTraceResult> {
    if (!shouldFetchTrace) {
      return { traceContext: null };
    }
    const traceparent = context?.traceparent ?? undefined;
    const traceId = traceparent ? extractTraceIdFromTraceparent(traceparent) : null;
    if (!traceId) {
      return { traceContext: null };
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
    if (!traceContext) {
      return { traceContext: null };
    }
    state.traceSnapshots.push(traceContext);
    return {
      traceContext,
      computedTraceSummary:
        tracingOptions.includeInAttack || tracingOptions.includeInGrading
          ? formatTraceSummary(traceContext)
          : undefined,
    };
  }

  private async normalizeHydraResponse({
    targetResponse,
    context,
    vars,
    state,
    turn,
  }: {
    targetResponse: TargetResponse;
    context?: CallApiContextParams;
    vars: Record<string, VarValue>;
    state: HydraRunState;
    turn: number;
  }): Promise<{ targetResponse: TargetResponse; historyOutput: string } | null> {
    if (isConversationEndedResponse(targetResponse)) {
      logger.info('[Hydra] Target ended conversation', {
        turn,
        reason: targetResponse.conversationEndReason,
      });
      state.stopReason = 'Target ended conversation';
      return null;
    }
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
      targetResponse.output = '[Target provided empty response - likely refused]';
    }

    if (this.stateful && targetResponse.sessionId) {
      this.sessionId = targetResponse.sessionId;
      state.sessionIds.push(targetResponse.sessionId);
      vars.sessionId = targetResponse.sessionId;
      if (context) {
        context.vars.sessionId = targetResponse.sessionId;
      }
    }

    if (isBlobStorageEnabled() || shouldAttemptRemoteBlobUpload()) {
      targetResponse = await externalizeResponseForRedteamHistory(targetResponse, {
        evalId: context?.evaluationId,
        testIdx: context?.testIdx,
        promptIdx: context?.promptIdx,
      });
    }
    const historyOutput =
      isBlobStorageEnabled() || shouldAttemptRemoteBlobUpload()
        ? scrubOutputForHistory(targetResponse.output)
        : targetResponse.output;
    this.conversationHistory.push({ role: 'assistant', content: historyOutput });
    return { targetResponse, historyOutput };
  }

  private maybeBacktrackHydra({
    targetResponse,
    turn,
    state,
  }: {
    targetResponse: TargetResponse;
    turn: number;
    state: HydraRunState;
  }) {
    if (this.stateful || this.maxBacktracks <= 0 || !isBasicRefusal(targetResponse.output)) {
      return { shouldContinue: false, shouldBreak: false, retryTurn: false };
    }
    state.backtrackCount += 1;
    if (this.conversationHistory.length >= 2) {
      this.conversationHistory.pop();
      this.conversationHistory.pop();
    }
    if (state.backtrackCount >= this.maxBacktracks) {
      state.stopReason = 'Max backtracks reached';
      return { shouldContinue: false, shouldBreak: true, retryTurn: false };
    }
    return { shouldContinue: true, shouldBreak: false, retryTurn: turn > 1 };
  }

  private async gradeHydraTurn({
    nextMessage,
    targetResponse,
    targetProvider,
    test,
    assertToUse,
    getGraderById,
    tracingOptions,
    traceContext,
    gradingTraceSummary,
    transformResult,
    context,
    turn,
    state,
  }: {
    nextMessage: string;
    targetResponse: TargetResponse;
    targetProvider: ApiProvider;
    test?: AtomicTestCase;
    assertToUse?: NonNullable<AtomicTestCase['assert']>[number];
    getGraderById: (id: string) => any;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    traceContext: TraceContextData | null;
    gradingTraceSummary?: string;
    transformResult?: TransformResult;
    context?: CallApiContextParams;
    turn: number;
    state: HydraRunState;
  }) {
    if (!test || !assertToUse) {
      return undefined;
    }
    const grader = getGraderById(assertToUse.type);
    if (!grader) {
      return undefined;
    }

    const gradingContext: RedteamGradingContext = {
      providerResponse: targetResponse,
      ...(tracingOptions.includeInGrading
        ? { traceContext, traceSummary: gradingTraceSummary }
        : {}),
    };
    const webPageUuid = transformResult?.metadata?.webPageUuid as string | undefined;
    if (webPageUuid) {
      const webPageUrl = transformResult?.metadata?.webPageUrl as string | undefined;
      const evalId =
        context?.evaluationId ??
        (webPageUrl?.match(/\/dynamic-pages\/([^/]+)\//)?.[1] as string | undefined);
      try {
        const exfilData = await checkExfilTracking(webPageUuid, evalId);
        if (exfilData) {
          Object.assign(gradingContext, {
            wasExfiltrated: exfilData.wasExfiltrated,
            exfilCount: exfilData.exfilCount,
            exfilRecords: exfilData.exfilRecords,
          });
        }
      } catch (error) {
        logger.warn('[Hydra] Failed to fetch exfil tracking from server', { error, webPageUuid });
      }
    }
    if (
      gradingContext.wasExfiltrated === undefined &&
      targetResponse.metadata?.wasExfiltrated !== undefined
    ) {
      Object.assign(gradingContext, {
        wasExfiltrated: Boolean(targetResponse.metadata.wasExfiltrated),
        exfilCount: Number(targetResponse.metadata.exfilCount) || 0,
        exfilRecords: [],
      });
    }

    const { grade, rubric } = await grader.getResult(
      nextMessage,
      targetResponse.output,
      test,
      targetProvider,
      getGraderAssertionValue(assertToUse),
      undefined,
      undefined,
      gradingContext,
    );
    state.storedGraderResult = {
      ...grade,
      assertion: buildGraderResultAssertion(grade.assertion, assertToUse, rubric),
    };
    logger.debug('[Hydra] Grader result', { turn, passed: grade.pass });
    return grade;
  }

  private async updateHydraLearnings({
    scanId,
    testRunId,
    state,
    options,
  }: {
    scanId: string;
    testRunId: string;
    state: HydraRunState;
    options?: CallApiOptionsParams;
  }) {
    try {
      const turnsCompleted = this.conversationHistory.filter((message) => message.role === 'user').length;
      const learningRequest = {
        task: 'hydra-decision',
        testRunId,
        scanId,
        testComplete: true,
        finalResult: {
          success: state.vulnerabilityAchieved,
          totalTurns: turnsCompleted,
        },
      };
      const serializedRequest = JSON.stringify(learningRequest);
      const learningResponse = await this.agentProvider.callApi(
        serializedRequest,
        {
          prompt: {
            raw: serializedRequest,
            label: 'hydra-learning-update',
          },
          vars: {},
        },
        options,
      );
      accumulateResponseTokenUsage(state.totalTokenUsage, learningResponse, { countAsRequest: false });
      logger.debug('[Hydra] Scan learnings updated', { scanId, testRunId });
    } catch (error) {
      logger.warn('[Hydra] Failed to update scan learnings', { error });
    }
  }

  private buildHydraResponse({
    state,
    context,
  }: {
    state: HydraRunState;
    context?: CallApiContextParams;
  }): HydraResponse {
    const messages = this.conversationHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })) as Record<string, any>[];
    const hydraRoundsCompleted = this.conversationHistory.filter((message) => message.role === 'user').length;
    const failClosedError =
      (state.totalTokenUsage.numRequests ?? 0) === 0
        ? state.agentFailureError || 'Hydra did not execute any target probes'
        : undefined;

    return {
      output: state.lastTargetResponse?.output || '',
      ...(failClosedError
        ? { error: failClosedError }
        : state.lastTargetResponse?.error
          ? { error: state.lastTargetResponse.error }
          : {}),
      metadata: {
        sessionId: this.sessionId || getSessionId(state.lastTargetResponse, context),
        messages,
        hydraRoundsCompleted,
        hydraBacktrackCount: state.backtrackCount,
        hydraResult: state.vulnerabilityAchieved,
        stopReason: state.stopReason,
        successfulAttacks: state.successfulAttacks,
        totalSuccessfulAttacks: state.successfulAttacks.length,
        storedGraderResult: state.storedGraderResult,
        redteamHistory: state.redteamHistory,
        sessionIds: state.sessionIds,
        traceSnapshots:
          state.traceSnapshots.length > 0
            ? state.traceSnapshots.map((trace) => formatTraceForMetadata(trace))
            : undefined,
        ...(state.lastTransformDisplayVars && { transformDisplayVars: state.lastTransformDisplayVars }),
        redteamFinalPrompt: state.lastFinalAttackPrompt || state.successfulAttacks[0]?.message,
      },
      tokenUsage: state.totalTokenUsage,
      guardrails: state.lastTargetResponse?.guardrails,
    };
  }

  private async executeHydraTurn({
    goal,
    testRunId,
    scanId,
    turn,
    test,
    options,
    state,
    tracingOptions,
    shouldFetchTrace,
    prompt,
    filters,
    vars,
    targetProvider,
    context,
    assertToUse,
    getGraderById,
  }: {
    goal: string;
    testRunId: string;
    scanId: string;
    turn: number;
    test?: AtomicTestCase;
    options?: CallApiOptionsParams;
    state: HydraRunState;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, VarValue>;
    targetProvider: ApiProvider;
    context?: CallApiContextParams;
    assertToUse?: NonNullable<AtomicTestCase['assert']>[number];
    getGraderById: (id: string) => any;
  }) {
    const message = await this.getNextHydraMessage({
      goal,
      testRunId,
      scanId,
      turn,
      test,
      options,
      state,
      tracingOptions,
    });
    if (!message) {
      return { action: 'continue' as const };
    }

    const promptResult = await this.buildHydraTargetPrompt({
      prompt,
      filters,
      vars,
      targetProvider,
      message,
      turn,
      context,
      test,
    });
    if (!promptResult) {
      return { action: 'continue' as const };
    }
    state.lastTransformResult = promptResult.transformResult;
    state.lastTransformDisplayVars =
      promptResult.transformResult?.displayVars ?? state.lastTransformDisplayVars;
    state.lastFinalAttackPrompt = promptResult.finalTargetPrompt;

    const iterationStart = Date.now();
    const targetVars: Record<string, VarValue> = {
      ...vars,
      ...(message.currentRenderInputVars || {}),
      [this.injectVar]: promptResult.finalTargetPrompt,
    };
    if (this.sessionId) {
      targetVars.sessionId = this.sessionId;
    }
    const targetContext = context ? { ...context, vars: targetVars } : context;
    let targetResponse = await getTargetResponse(
      targetProvider,
      promptResult.finalTargetPrompt,
      targetContext,
      options,
    );
    state.lastTargetResponse = targetResponse;
    accumulateResponseTokenUsage(state.totalTokenUsage, targetResponse);
    const { traceContext, computedTraceSummary } = await this.captureTrace({
      context,
      iterationStart,
      tracingOptions,
      shouldFetchTrace,
      state,
    });
    const normalizedResponse = await this.normalizeHydraResponse({
      targetResponse,
      context,
      vars,
      state,
      turn,
    });
    if (!normalizedResponse) {
      return {
        action: state.stopReason === 'Target ended conversation' ? ('break' as const) : ('continue' as const),
      };
    }

    targetResponse = normalizedResponse.targetResponse;
    const backtrackResult = this.maybeBacktrackHydra({ targetResponse, turn, state });
    if (backtrackResult.shouldBreak) {
      return { action: 'break' as const };
    }
    if (backtrackResult.shouldContinue) {
      return { action: 'continue' as const, retryTurn: backtrackResult.retryTurn };
    }

    state.previousTraceSummary = tracingOptions.includeInAttack ? computedTraceSummary : undefined;
    const graderResult = await this.gradeHydraTurn({
      nextMessage: message.nextMessage,
      targetResponse,
      targetProvider,
      test,
      assertToUse,
      getGraderById,
      tracingOptions,
      traceContext,
      gradingTraceSummary: tracingOptions.includeInGrading ? computedTraceSummary : undefined,
      transformResult: state.lastTransformResult,
      context,
      turn,
      state,
    });
    state.redteamHistory.push({
      prompt: message.nextMessage,
      promptAudio: state.lastTransformResult?.audio,
      promptImage: state.lastTransformResult?.image,
      output: normalizedResponse.historyOutput,
      outputAudio: targetResponse.audio
        ? { data: targetResponse.audio.data || '', format: targetResponse.audio.format || 'wav' }
        : undefined,
      graderPassed: graderResult?.pass,
      trace: traceContext ? formatTraceForMetadata(traceContext) : undefined,
      traceSummary: computedTraceSummary,
      inputVars: message.currentRenderInputVars,
    });
    if (graderResult?.pass !== false) {
      return { action: 'continue' as const };
    }

    state.vulnerabilityAchieved = true;
    state.successfulAttacks.push({
      turn,
      message: message.nextMessage,
      response: targetResponse.output,
      traceSummary: computedTraceSummary,
    });
    state.stopReason = 'Grader failed';
    return { action: 'break' as const };
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
    logger.debug('[Hydra] Starting attack', {
      goal,
      scanId,
      maxTurns: this.maxTurns,
      stateful: this.stateful,
      tracingEnabled: tracingOptions.enabled,
    });

    this.conversationHistory = [];
    this.sessionId = undefined;
    const state: HydraRunState = {
      sessionIds: [],
      successfulAttacks: [],
      totalTokenUsage: createEmptyTokenUsage(),
      vulnerabilityAchieved: false,
      stopReason: 'Max turns reached',
      storedGraderResult: undefined,
      lastTargetResponse: undefined,
      backtrackCount: 0,
      agentFailureError: undefined,
      redteamHistory: [],
      lastTransformResult: undefined,
      lastTransformDisplayVars: undefined,
      lastFinalAttackPrompt: undefined,
      previousTraceSummary: undefined,
      traceSnapshots: [],
    };
    const testRunId = `${context?.evaluationId || 'local'}-tc${context?.testCaseId || crypto.randomUUID().slice(0, 8)}`;
    const { getGraderById } = await import('../../graders');
    const assertToUse =
      test?.assert?.find((assertion: { type: string }) =>
        assertion.type && assertion.type.includes(test.metadata?.pluginId),
      ) ?? test?.assert?.find((assertion: { type: string }) => assertion.type);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      logger.debug(`[Hydra] Turn ${turn}/${this.maxTurns}`);
      const turnResult = await this.executeHydraTurn({
        goal,
        testRunId,
        scanId,
        turn,
        test,
        options,
        state,
        tracingOptions,
        shouldFetchTrace,
        prompt,
        filters,
        vars,
        targetProvider,
        context,
        assertToUse,
        getGraderById,
      });
      if (turnResult.retryTurn) {
        turn--;
      }
      if (turnResult.action === 'break') {
        break;
      }
    }

    await this.updateHydraLearnings({ scanId, testRunId, state, options });
    return this.buildHydraResponse({ state, context });
  }
}

export default HydraProvider;
