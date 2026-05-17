import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail, isLoggedIntoCloud } from '../../globalConfig/accounts';
import logger from '../../logger';
import {
  extractTraceIdFromTraceparent,
  fetchTraceContext,
  type TraceContextData,
} from '../../tracing/traceContext';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
  isRemoteMaterializationUpgradeError,
} from '../remoteMaterialization';
import { throwIfTargetPromptExceedsMaxChars } from '../shared/promptLength';
import {
  applyRuntimeTransforms,
  type LayerConfig,
  type MediaData,
  type TransformResult,
} from '../shared/runtimeTransform';
import { Strategies } from '../strategies';
import { checkExfilTracking } from '../strategies/indirectWebPwn';
import { extractInputVarsFromPrompt, extractPromptFromTags, getSessionId } from '../util';
import { getGoalRubric } from './prompts';
import {
  buildGraderResultAssertion,
  getGraderAssertionValue,
  getLastMessageContent,
  tryUnblocking,
} from './shared';
import { formatTraceForMetadata, formatTraceSummary } from './traceFormatting';
import { type RawTracingConfig, resolveTracingOptions } from './tracingOptions';

import type {
  Assertion,
  AssertionSet,
  AtomicTestCase,
  GradingResult,
  Inputs,
  VarValue,
} from '../../types/index';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../../types/providers';
import type { BaseRedteamMetadata } from '../types';
import type { Message } from './shared';

/**
 * Represents metadata for the GOAT conversation process.
 */
interface GoatMetadata extends BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  stopReason: 'Grader failed' | 'Max turns reached' | 'Target ended conversation';
  successfulAttacks?: Array<{
    turn: number;
    prompt: string;
    response: string;
    traceSummary?: string;
  }>;
  totalSuccessfulAttacks?: number;
  storedGraderResult?: GradingResult;
  traceSnapshots?: Record<string, unknown>[];
}

/**
 * Represents the complete response from a GOAT conversation.
 */
interface GoatResponse extends ProviderResponse {
  metadata: GoatMetadata;
}

export interface ExtractAttackFailureResponse {
  message: string;
  task: string;
}

interface GoatConfig {
  injectVar: string;
  maxCharsPerMessage?: number;
  maxTurns: number;
  excludeTargetOutputFromAgenticAttackGeneration: boolean;
  stateful: boolean;
  continueAfterSuccess: boolean;
  tracing?: RawTracingConfig;
  /**
   * Per-turn layer transforms to apply to each turn's prompt before sending to target.
   * Set by the layer strategy when used as: layer: { steps: [goat, audio] }
   */
  _perTurnLayers?: LayerConfig[];
  /**
   * Multi-input schema for generating multiple vars at each turn.
   * Keys are variable names, values are Inputs definitions: plain descriptions
   * or structured typed configs with fields like description, type, and config.
   */
  inputs?: Inputs;
  [key: string]: unknown;
}

interface GoatProviderResponse extends ProviderResponse {
  traceContext?: TraceContextData;
  traceSummary?: string;
}

interface GoatRunState {
  response?: Response;
  messages: Message[];
  totalTokenUsage: TokenUsage;
  redteamHistory: Array<{
    prompt: string;
    promptAudio?: MediaData;
    promptImage?: MediaData;
    output: string;
    outputAudio?: MediaData;
    outputImage?: MediaData;
    inputVars?: Record<string, string>;
  }>;
  lastTargetResponse?: GoatProviderResponse;
  lastTransformDisplayVars?: Record<string, string>;
  lastFinalAttackPrompt?: string;
  graderPassed?: boolean;
  storedGraderResult?: GradingResult;
  previousAttackerMessage: string;
  previousTargetOutput: string;
  previousTraceSummary?: string;
  traceSnapshots: TraceContextData[];
  stopReason: GoatMetadata['stopReason'];
}

interface GoatAttackMessageResult {
  attackerMessage: Message;
  renderedAttackerPrompt: string;
  currentRenderInputVars?: Record<string, string>;
  targetVars: Record<string, VarValue>;
}

interface GoatTransformResult {
  targetPrompt: string;
  transformResult?: TransformResult;
}

interface GoatTraceResult {
  traceContext: TraceContextData | null;
  computedTraceSummary?: string;
}

export default class GoatProvider implements ApiProvider {
  readonly config: GoatConfig;
  private readonly nunjucks: any;
  private readonly perTurnLayers: LayerConfig[];
  private successfulAttacks: Array<{
    turn: number;
    prompt: string;
    response: string;
    traceSummary?: string;
  }> = [];

  id() {
    return 'promptfoo:redteam:goat';
  }

  constructor(
    options: ProviderOptions & {
      maxTurns?: number;
      maxCharsPerMessage?: number;
      injectVar?: string;
      stateful?: boolean;
      excludeTargetOutputFromAgenticAttackGeneration?: boolean;
      continueAfterSuccess?: boolean;
      tracing?: RawTracingConfig;
      _perTurnLayers?: LayerConfig[];
      inputs?: Inputs;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`GOAT strategy requires remote grading to be enabled`);
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    let maxTurns = options.maxTurns ?? 5;
    // Cap turns for unauthenticated users
    if (!isLoggedIntoCloud()) {
      maxTurns = Math.min(maxTurns, 10);
    }
    this.config = {
      maxTurns,
      ...(options.maxCharsPerMessage ? { maxCharsPerMessage: options.maxCharsPerMessage } : {}),
      injectVar: options.injectVar,
      stateful: options.stateful ?? false,
      excludeTargetOutputFromAgenticAttackGeneration:
        options.excludeTargetOutputFromAgenticAttackGeneration ?? false,
      continueAfterSuccess: options.continueAfterSuccess ?? false,
      tracing: options.tracing,
      _perTurnLayers: options._perTurnLayers,
      inputs: options.inputs,
    };
    this.perTurnLayers = options._perTurnLayers ?? [];
    this.nunjucks = getNunjucksEngine();
    logger.debug('[GOAT] Constructor options', {
      injectVar: options.injectVar,
      maxTurns: options.maxTurns,
      maxCharsPerMessage: options.maxCharsPerMessage,
      stateful: options.stateful,
      continueAfterSuccess: options.continueAfterSuccess,
      perTurnLayers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
      inputs: options.inputs,
    });
  }

  private getAssertionToUse(test?: AtomicTestCase) {
    if (!test) {
      return undefined;
    }
    return (
      test.assert?.find((assertion: { type: string }) =>
        assertion.type && assertion.type.includes(test.metadata?.pluginId),
      ) ?? test.assert?.find((assertion: { type: string }) => assertion.type)
    );
  }

  private async maybeRunUnblocking({
    turn,
    state,
    context,
    options,
    targetProvider,
    maxCharsPerMessage,
  }: {
    turn: number;
    state: GoatRunState;
    context: CallApiContextParams;
    options?: CallApiOptionsParams;
    targetProvider: ApiProvider;
    maxCharsPerMessage?: number;
  }) {
    if (turn === 0 || !state.previousTargetOutput) {
      return;
    }
    const unblockingResult = await tryUnblocking({
      messages: state.messages,
      lastResponse: state.previousTargetOutput,
      goal: context.test?.metadata?.goal || context.vars[this.config.injectVar],
      purpose: context.test?.metadata?.purpose,
    });
    if (!unblockingResult.success || !unblockingResult.unblockingPrompt) {
      return;
    }

    logger.debug(`[GOAT] Sending unblocking response: ${unblockingResult.unblockingPrompt}`);
    state.messages.push({ role: 'user', content: unblockingResult.unblockingPrompt });
    let unblockingTargetPrompt = this.config.stateful
      ? unblockingResult.unblockingPrompt
      : JSON.stringify(state.messages);

    if (this.perTurnLayers.length > 0) {
      const transformResult = await applyRuntimeTransforms(
        unblockingResult.unblockingPrompt,
        this.config.injectVar,
        this.perTurnLayers,
        Strategies,
        {
          evaluationId: context.evaluationId,
          testCaseId: context.test?.metadata?.testCaseId as string | undefined,
          purpose: context.test?.metadata?.purpose as string | undefined,
          goal: context.test?.metadata?.goal as string | undefined,
        },
      );
      if (transformResult.error) {
        logger.warn('[GOAT] Transform failed for unblocking prompt', { error: transformResult.error });
        return;
      }
      unblockingTargetPrompt = transformResult.prompt;
    }

    throwIfTargetPromptExceedsMaxChars(unblockingTargetPrompt, maxCharsPerMessage);
    const unblockingResponse = await targetProvider.callApi(unblockingTargetPrompt, context, options);
    if (!unblockingResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
      logger.debug(`Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
    accumulateResponseTokenUsage(state.totalTokenUsage, unblockingResponse);
    const unblockingOutput =
      typeof unblockingResponse.output === 'string'
        ? unblockingResponse.output
        : safeJsonStringify(unblockingResponse.output);
    if (unblockingOutput) {
      state.messages.push({ role: 'assistant', content: unblockingOutput });
    }
    if (unblockingResponse.error) {
      logger.error(`[GOAT] Target returned an error: ${unblockingResponse.error}`);
    }
  }

  private async requestAttackMessage({
    turn,
    context,
    options,
    state,
    targetProvider,
  }: {
    turn: number;
    context: CallApiContextParams;
    options?: CallApiOptionsParams;
    state: GoatRunState;
    targetProvider: ApiProvider;
  }): Promise<GoatAttackMessageResult | null> {
    let failureReason: string | undefined;
    if (this.config.excludeTargetOutputFromAgenticAttackGeneration && turn > 0) {
      const body = JSON.stringify({
        goal: context.test?.metadata?.goal || context.vars[this.config.injectVar],
        targetOutput: state.previousTargetOutput,
        attackAttempt: state.previousAttackerMessage,
        task: 'extract-goat-failure',
        modifiers: context.test?.metadata?.modifiers,
        traceSummary: state.previousTraceSummary,
      });
      logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
      state.response = await fetchWithProxy(
        getRemoteGenerationUrl(),
        {
          body,
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        options?.abortSignal,
      );
      const data = (await state.response.json()) as ExtractAttackFailureResponse;
      if (!data.message) {
        logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data });
        return null;
      }
      failureReason = data.message;
    }

    const body = JSON.stringify({
      goal: context.test?.metadata?.goal || context.vars[this.config.injectVar],
      i: turn,
      messages: this.config.excludeTargetOutputFromAgenticAttackGeneration
        ? state.messages.filter((message) => message.role !== 'assistant')
        : state.messages,
      prompt: context.prompt?.raw,
      task: 'goat',
      version: VERSION,
      email: getUserEmail(),
      excludeTargetOutputFromAgenticAttackGeneration:
        this.config.excludeTargetOutputFromAgenticAttackGeneration,
      failureReason,
      purpose: context.test?.metadata?.purpose,
      modifiers: context.test?.metadata?.modifiers,
      traceSummary: state.previousTraceSummary,
      inputs: this.config.inputs,
    });
    logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
    state.response = await fetchWithProxy(
      getRemoteGenerationUrl(),
      {
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      options?.abortSignal,
    );
    const data = await state.response.json();
    if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
      logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data });
      return null;
    }

    const attackerMessage = data.message as Message;
    state.previousAttackerMessage = attackerMessage.content;
    let processedMessage = extractPromptFromTags(attackerMessage.content) || attackerMessage.content;
    if (this.config.inputs) {
      assertRemoteMaterializationHandled(data, 'GOAT multi-input generation');
    }
    const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);
    const materializedInputVars =
      currentInputVars && this.config.inputs
        ? buildRemoteMaterializedInputVariables(data, currentInputVars, this.config.inputs)
        : undefined;
    const currentRenderInputVars = materializedInputVars?.vars ?? currentInputVars;
    if (currentInputVars && this.config.inputs) {
      try {
        const parsed = JSON.parse(processedMessage);
        if (typeof parsed.prompt === 'string') {
          processedMessage = parsed.prompt;
        }
      } catch {
        // Not valid JSON, use as-is.
      }
    }

    const attackerVars = {
      [this.config.injectVar]: processedMessage,
      ...(currentRenderInputVars || {}),
    };
    const targetVars: Record<string, VarValue> = { ...context.vars, ...attackerVars };
    const renderedAttackerPrompt = await renderPrompt(
      context.prompt,
      targetVars,
      context.filters,
      targetProvider,
      Object.keys(attackerVars),
    );
    state.messages.push({ role: attackerMessage.role, content: renderedAttackerPrompt });
    return { attackerMessage, renderedAttackerPrompt, currentRenderInputVars, targetVars };
  }

  private async applyGoatTransforms({
    turn,
    context,
    latestMessageContent,
    messages,
    state,
  }: {
    turn: number;
    context: CallApiContextParams;
    latestMessageContent: string;
    messages: Message[];
    state: GoatRunState;
  }): Promise<GoatTransformResult | null> {
    let targetPrompt = this.config.stateful ? latestMessageContent : JSON.stringify(messages);
    if (this.perTurnLayers.length === 0) {
      return { targetPrompt };
    }

    logger.debug('[GOAT] Applying per-turn transforms', {
      turn,
      layers: this.perTurnLayers.map((layer) => (typeof layer === 'string' ? layer : layer.id)),
    });
    const transformResult = await applyRuntimeTransforms(
      latestMessageContent,
      this.config.injectVar,
      this.perTurnLayers,
      Strategies,
      {
        evaluationId: context.evaluationId,
        testCaseId: context.test?.metadata?.testCaseId as string | undefined,
        purpose: context.test?.metadata?.purpose as string | undefined,
        goal: context.test?.metadata?.goal as string | undefined,
      },
    );
    if (transformResult.error) {
      logger.warn('[GOAT] Transform failed, skipping turn', { turn, error: transformResult.error });
      return null;
    }
    if (transformResult.audio || transformResult.image) {
      const historyWithoutCurrentTurn = messages.slice(0, -1);
      targetPrompt = JSON.stringify({
        _promptfoo_audio_hybrid: true,
        history: historyWithoutCurrentTurn,
        currentTurn: {
          role: 'user' as const,
          transcript: latestMessageContent,
          ...(transformResult.audio && { audio: transformResult.audio }),
          ...(transformResult.image && { image: transformResult.image }),
        },
      });
    } else {
      targetPrompt = transformResult.prompt;
    }
    if (transformResult.displayVars) {
      state.lastTransformDisplayVars = transformResult.displayVars;
    }
    state.lastFinalAttackPrompt = transformResult.prompt;
    return { targetPrompt, transformResult };
  }

  private async captureGoatTrace({
    context,
    iterationStart,
    tracingOptions,
    shouldFetchTrace,
    targetResponse,
    state,
  }: {
    context: CallApiContextParams;
    iterationStart: number;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    targetResponse: GoatProviderResponse;
    state: GoatRunState;
  }): Promise<GoatTraceResult> {
    if (!shouldFetchTrace) {
      return { traceContext: null };
    }
    const traceparent = context.traceparent ?? undefined;
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
    targetResponse.traceContext = traceContext;
    state.traceSnapshots.push(traceContext);
    const computedTraceSummary =
      tracingOptions.includeInAttack || tracingOptions.includeInGrading
        ? formatTraceSummary(traceContext)
        : undefined;
    targetResponse.traceSummary = computedTraceSummary;
    return { traceContext, computedTraceSummary };
  }

  private async buildGoatGradingContext({
    finalResponse,
    targetResponse,
    test,
    context,
    tracingOptions,
    gradingTraceSummary,
  }: {
    finalResponse: GoatProviderResponse;
    targetResponse: GoatProviderResponse;
    test: AtomicTestCase;
    context: CallApiContextParams;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    gradingTraceSummary?: string;
  }) {
    let gradingContext:
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
      | undefined;

    if (finalResponse.metadata?.wasExfiltrated === undefined) {
      const webPageUuid = test.metadata?.webPageUuid as string | undefined;
      if (webPageUuid) {
        const evalId = context.evaluationId ?? (test.metadata?.evaluationId as string | undefined);
        const exfilData = await checkExfilTracking(webPageUuid, evalId);
        if (exfilData) {
          gradingContext = {
            ...(tracingOptions.includeInGrading
              ? { traceContext: targetResponse.traceContext, traceSummary: gradingTraceSummary }
              : {}),
            wasExfiltrated: exfilData.wasExfiltrated,
            exfilCount: exfilData.exfilCount,
            exfilRecords: exfilData.exfilRecords,
          };
        }
      }
    } else {
      gradingContext = {
        ...(tracingOptions.includeInGrading
          ? { traceContext: targetResponse.traceContext, traceSummary: gradingTraceSummary }
          : {}),
        wasExfiltrated: Boolean(finalResponse.metadata.wasExfiltrated),
        exfilCount: Number(finalResponse.metadata.exfilCount) || 0,
        exfilRecords: [],
      };
    }
    if (!gradingContext && tracingOptions.includeInGrading) {
      gradingContext = {
        traceContext: targetResponse.traceContext,
        traceSummary: gradingTraceSummary,
      };
    }
    return gradingContext;
  }

  private async gradeGoatTurn({
    attackerMessage,
    finalOutput,
    finalResponse,
    targetResponse,
    test,
    assertToUse,
    targetProvider,
    getGraderById,
    additionalRubric,
    tracingOptions,
    gradingTraceSummary,
    context,
    state,
  }: {
    attackerMessage: Message;
    finalOutput: string;
    finalResponse: GoatProviderResponse;
    targetResponse: GoatProviderResponse;
    test?: AtomicTestCase;
    assertToUse?: Assertion | AssertionSet;
    targetProvider: ApiProvider;
    getGraderById: (id: string) => any;
    additionalRubric: string;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    gradingTraceSummary?: string;
    context: CallApiContextParams;
    state: GoatRunState;
  }) {
    if (!test || !assertToUse) {
      return undefined;
    }
    const grader = getGraderById(assertToUse.type);
    if (!grader || !finalOutput) {
      return undefined;
    }
    const gradingContext = await this.buildGoatGradingContext({
      finalResponse,
      targetResponse,
      test,
      context,
      tracingOptions,
      gradingTraceSummary,
    });
    const { grade, rubric } = await grader.getResult(
      attackerMessage.content,
      finalOutput,
      test,
      targetProvider,
      getGraderAssertionValue(assertToUse),
      additionalRubric,
      undefined,
      gradingContext,
    );
    state.graderPassed = grade.pass;
    state.storedGraderResult = {
      ...grade,
      assertion: buildGraderResultAssertion(grade.assertion, assertToUse, rubric),
    };
    return grade;
  }

  private async executeGoatTurn({
    turn,
    context,
    options,
    targetProvider,
    maxCharsPerMessage,
    assertToUse,
    getGraderById,
    test,
    additionalRubric,
    tracingOptions,
    shouldFetchTrace,
    state,
  }: {
    turn: number;
    context: CallApiContextParams;
    options?: CallApiOptionsParams;
    targetProvider: ApiProvider;
    maxCharsPerMessage?: number;
    assertToUse?: Assertion | AssertionSet;
    getGraderById: (id: string) => any;
    test?: AtomicTestCase;
    additionalRubric: string;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    state: GoatRunState;
  }) {
    await this.maybeRunUnblocking({
      turn,
      state,
      context,
      options,
      targetProvider,
      maxCharsPerMessage,
    });
    const attack = await this.requestAttackMessage({
      turn,
      context,
      options,
      state,
      targetProvider,
    });
    if (!attack) {
      return { action: 'continue' as const };
    }

    const latestMessageContent = state.messages[state.messages.length - 1].content;
    const transform = await this.applyGoatTransforms({
      turn,
      context,
      latestMessageContent,
      messages: state.messages,
      state,
    });
    if (!transform) {
      return { action: 'continue' as const };
    }

    const iterationStart = Date.now();
    throwIfTargetPromptExceedsMaxChars(transform.targetPrompt, maxCharsPerMessage);
    const targetContext = {
      ...context,
      vars: {
        ...attack.targetVars,
        [this.config.injectVar]: transform.targetPrompt,
      },
    };
    const targetResponse = (await targetProvider.callApi(
      transform.targetPrompt,
      targetContext,
      options,
    )) as GoatProviderResponse;
    if (!targetResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
      logger.debug(`Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
    accumulateResponseTokenUsage(state.totalTokenUsage, targetResponse);
    const { computedTraceSummary } = await this.captureGoatTrace({
      context,
      iterationStart,
      tracingOptions,
      shouldFetchTrace,
      targetResponse,
      state,
    });
    if (targetResponse.sessionId) {
      context.vars.sessionId = targetResponse.sessionId;
    }
    if (targetResponse.conversationEnded) {
      const endedOutput =
        typeof targetResponse.output === 'string'
          ? targetResponse.output
          : safeJsonStringify(targetResponse.output);
      if (endedOutput) {
        state.messages.push({ role: 'assistant', content: endedOutput });
        state.redteamHistory.push({
          prompt: attack.attackerMessage.content,
          promptAudio: transform.transformResult?.audio,
          promptImage: transform.transformResult?.image,
          output: endedOutput,
          outputAudio:
            targetResponse.audio?.data && targetResponse.audio?.format
              ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
              : undefined,
          inputVars: attack.currentRenderInputVars,
        });
      }
      state.lastTargetResponse = targetResponse;
      state.stopReason = 'Target ended conversation';
      return { action: 'break' as const };
    }
    if (targetResponse.error) {
      throw new Error(`[GOAT] Target returned an error: ${targetResponse.error}`);
    }
    invariant(
      targetResponse.output,
      `[GOAT] Expected target response output to be set, but got: ${safeJsonStringify(targetResponse)}`,
    );
    const stringifiedOutput =
      typeof targetResponse.output === 'string'
        ? targetResponse.output
        : safeJsonStringify(targetResponse.output);
    if (!stringifiedOutput) {
      return { action: 'continue' as const };
    }

    state.messages.push({ role: 'assistant', content: stringifiedOutput });
    state.redteamHistory.push({
      prompt: attack.attackerMessage.content,
      promptAudio: transform.transformResult?.audio,
      promptImage: transform.transformResult?.image,
      output: stringifiedOutput,
      outputAudio:
        targetResponse.audio?.data && targetResponse.audio?.format
          ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
          : undefined,
      inputVars: attack.currentRenderInputVars,
    });

    const attackTraceSummary = tracingOptions.includeInAttack ? computedTraceSummary : undefined;
    const gradingTraceSummary = tracingOptions.includeInGrading ? computedTraceSummary : undefined;
    state.previousTraceSummary = attackTraceSummary;
    state.previousTargetOutput = stringifiedOutput;
    state.lastTargetResponse = targetResponse;
    const grade = await this.gradeGoatTurn({
      attackerMessage: attack.attackerMessage,
      finalOutput: stringifiedOutput,
      finalResponse: targetResponse,
      targetResponse,
      test,
      assertToUse,
      targetProvider,
      getGraderById,
      additionalRubric,
      tracingOptions,
      gradingTraceSummary,
      context,
      state,
    });
    if (grade?.pass !== false) {
      return { action: 'continue' as const };
    }

    this.successfulAttacks.push({
      turn,
      prompt: attack.attackerMessage.content,
      response: stringifiedOutput,
      traceSummary: attackTraceSummary,
    });
    if (this.config.continueAfterSuccess) {
      return { action: 'continue' as const };
    }
    state.stopReason = 'Grader failed';
    return { action: 'break' as const };
  }

  private buildGoatResponse({
    state,
    context,
  }: {
    state: GoatRunState;
    context: CallApiContextParams;
  }): GoatResponse {
    const finalPrompt = getLastMessageContent(state.messages, 'user') || '';
    return {
      output: getLastMessageContent(state.messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        redteamFinalPrompt: state.lastFinalAttackPrompt || finalPrompt,
        messages: state.messages as Record<string, any>[],
        stopReason: state.stopReason,
        redteamHistory: state.redteamHistory,
        successfulAttacks: this.successfulAttacks,
        totalSuccessfulAttacks: this.successfulAttacks.length,
        storedGraderResult: state.storedGraderResult,
        traceSnapshots:
          state.traceSnapshots.length > 0
            ? state.traceSnapshots.map((snapshot) => formatTraceForMetadata(snapshot))
            : undefined,
        sessionId: getSessionId(state.lastTargetResponse, context),
        ...(state.lastTransformDisplayVars && { transformDisplayVars: state.lastTransformDisplayVars }),
      },
      tokenUsage: state.totalTokenUsage,
      guardrails: state.lastTargetResponse?.guardrails,
    };
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<GoatResponse> {
    this.successfulAttacks = [];
    const tracingOptions = resolveTracingOptions({
      strategyId: 'goat',
      test: context?.test,
      config: this.config,
    });
    const shouldFetchTrace =
      tracingOptions.enabled && (tracingOptions.includeInAttack || tracingOptions.includeInGrading);
    logger.debug('[GOAT] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');
    const targetProvider = context.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');
    const maxCharsPerMessage =
      this.config.maxCharsPerMessage ??
      (context?.test?.metadata?.strategyConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage ??
      (context?.test?.metadata?.pluginConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage;
    const { getGraderById } = await import('../graders');
    const test = context.test;
    const assertToUse = this.getAssertionToUse(test);
    const userGoal = test?.metadata?.goal || context.vars[this.config.injectVar];
    const additionalRubric = getGoalRubric(userGoal);
    const state: GoatRunState = {
      response: undefined,
      messages: [],
      totalTokenUsage: createEmptyTokenUsage(),
      redteamHistory: [],
      lastTargetResponse: undefined,
      lastTransformDisplayVars: undefined,
      lastFinalAttackPrompt: undefined,
      graderPassed: undefined,
      storedGraderResult: undefined,
      previousAttackerMessage: '',
      previousTargetOutput: '',
      previousTraceSummary: undefined,
      traceSnapshots: [],
      stopReason: 'Max turns reached',
    };
    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        const turnResult = await this.executeGoatTurn({
          turn,
          context,
          options,
          targetProvider,
          maxCharsPerMessage,
          assertToUse,
          getGraderById,
          test,
          additionalRubric,
          tracingOptions,
          shouldFetchTrace,
          state,
        });
        if (turnResult.action === 'break') {
          break;
        }
      } catch (error) {
        // Re-throw abort errors to properly cancel the operation
        if (error instanceof Error && error.name === 'AbortError') {
          logger.debug('[GOAT] Operation aborted');
          throw error;
        }
        if (isRemoteMaterializationUpgradeError(error)) {
          throw error;
        }
        logger.error(
          `[GOAT] An error occurred in GOAT turn ${turn}.  The test will continue to the next turn in the conversation.`,
          {
            error: (error as Error).message || error,
          },
        );
      }
    }
    return this.buildGoatResponse({ state, context });
  }
}
