import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
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
  applyRuntimeTransforms,
  type LayerConfig,
  type MediaData,
  type TransformResult,
} from '../shared/runtimeTransform';
import { Strategies } from '../strategies';
import { checkExfilTracking } from '../strategies/indirectWebPwn';
import { extractInputVarsFromPrompt, extractPromptFromTags, getSessionId } from '../util';
import { getGoalRubric } from './prompts';
import { getLastMessageContent, tryUnblocking } from './shared';
import { formatTraceForMetadata, formatTraceSummary } from './traceFormatting';
import { type RawTracingConfig, resolveTracingOptions } from './tracingOptions';

import type {
  Assertion,
  AssertionSet,
  AtomicTestCase,
  GradingResult,
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
  stopReason: 'Grader failed' | 'Max turns reached';
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
   * Keys are variable names, values are descriptions.
   */
  inputs?: Record<string, string>;
  [key: string]: unknown;
}

interface GoatProviderResponse extends ProviderResponse {
  traceContext?: TraceContextData;
  traceSummary?: string;
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
      injectVar?: string;
      stateful?: boolean;
      excludeTargetOutputFromAgenticAttackGeneration?: boolean;
      continueAfterSuccess?: boolean;
      tracing?: RawTracingConfig;
      _perTurnLayers?: LayerConfig[];
      inputs?: Record<string, string>;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`GOAT strategy requires remote grading to be enabled`);
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      maxTurns: options.maxTurns || 5,
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
      stateful: options.stateful,
      continueAfterSuccess: options.continueAfterSuccess,
      perTurnLayers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
      inputs: options.inputs,
    });
  }

  private async applyGoatPerTurnTransforms(
    latestMessageContent: string,
    context: CallApiContextParams | undefined,
    messages: Message[],
  ): Promise<{
    targetPrompt: string;
    transformResult: TransformResult;
    displayVars?: Record<string, string>;
    finalAttackPrompt?: string;
  } | null> {
    if (this.perTurnLayers.length === 0) {
      return null;
    }

    logger.debug('[GOAT] Applying per-turn transforms', {
      layers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
    });

    const transformResult = await applyRuntimeTransforms(
      latestMessageContent,
      this.config.injectVar,
      this.perTurnLayers,
      Strategies,
      {
        evaluationId: context?.evaluationId,
        testCaseId: context?.test?.metadata?.testCaseId as string | undefined,
        purpose: context?.test?.metadata?.purpose as string | undefined,
        goal: context?.test?.metadata?.goal as string | undefined,
      },
    );

    if (transformResult.error) {
      return { targetPrompt: '', transformResult };
    }

    let targetPrompt: string;
    if (transformResult.audio || transformResult.image) {
      const historyWithoutCurrentTurn = messages.slice(0, -1);
      const hybridPayload = {
        _promptfoo_audio_hybrid: true,
        history: historyWithoutCurrentTurn,
        currentTurn: {
          role: 'user' as const,
          transcript: latestMessageContent,
          ...(transformResult.audio && { audio: transformResult.audio }),
          ...(transformResult.image && { image: transformResult.image }),
        },
      };
      targetPrompt = JSON.stringify(hybridPayload);
      logger.debug('[GOAT] Using hybrid format (history + audio/image current turn)', {
        historyLength: historyWithoutCurrentTurn.length,
        hasAudio: !!transformResult.audio,
        hasImage: !!transformResult.image,
      });
    } else {
      targetPrompt = transformResult.prompt;
    }

    logger.debug('[GOAT] Per-turn transforms applied', {
      hasAudio: !!transformResult.audio,
      hasImage: !!transformResult.image,
    });

    return {
      targetPrompt,
      transformResult,
      displayVars: transformResult.displayVars,
      finalAttackPrompt: transformResult.prompt,
    };
  }

  private async fetchGoatTrace(
    iterationStart: number,
    context: CallApiContextParams | undefined,
    tracingOptions: ReturnType<typeof resolveTracingOptions>,
    traceSnapshots: TraceContextData[],
    targetResponse: GoatProviderResponse,
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
      targetResponse.traceContext = traceContext;
      traceSnapshots.push(traceContext);
      if (tracingOptions.includeInAttack || tracingOptions.includeInGrading) {
        computedTraceSummary = formatTraceSummary(traceContext);
        targetResponse.traceSummary = computedTraceSummary;
      }
    }

    return { traceContext, computedTraceSummary };
  }

  private async buildGoatGradingContext(
    finalResponse: GoatProviderResponse,
    test: AtomicTestCase | undefined,
    context: CallApiContextParams | undefined,
    tracingOptions: ReturnType<typeof resolveTracingOptions>,
    gradingTraceSummary: string | undefined,
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
    if (finalResponse.metadata?.wasExfiltrated !== undefined) {
      logger.debug('[GOAT] Using exfil data from provider response metadata');
      return {
        ...(tracingOptions.includeInGrading
          ? { traceContext: finalResponse.traceContext, traceSummary: gradingTraceSummary }
          : {}),
        wasExfiltrated: Boolean(finalResponse.metadata.wasExfiltrated),
        exfilCount: Number(finalResponse.metadata.exfilCount) || 0,
        exfilRecords: [],
      };
    }

    const webPageUuid = test?.metadata?.webPageUuid as string | undefined;
    if (webPageUuid) {
      const evalId = context?.evaluationId ?? (test?.metadata?.evaluationId as string | undefined);
      logger.debug('[GOAT] Fetching exfil tracking from server API', { webPageUuid, evalId });
      const exfilData = await checkExfilTracking(webPageUuid, evalId);
      if (exfilData) {
        return {
          ...(tracingOptions.includeInGrading
            ? { traceContext: finalResponse.traceContext, traceSummary: gradingTraceSummary }
            : {}),
          wasExfiltrated: exfilData.wasExfiltrated,
          exfilCount: exfilData.exfilCount,
          exfilRecords: exfilData.exfilRecords,
        };
      }
    }

    if (tracingOptions.includeInGrading) {
      return { traceContext: finalResponse.traceContext, traceSummary: gradingTraceSummary };
    }

    return undefined;
  }

  private async runGoatGrader({
    test,
    assertToUse,
    getGraderById,
    attackerMessageContent,
    finalOutput,
    finalResponse,
    targetProvider,
    additionalRubric,
    context,
    tracingOptions,
    gradingTraceSummary,
  }: {
    test: AtomicTestCase | undefined;
    assertToUse:
      | import('../../types/index').Assertion
      | import('../../types/index').AssertionSet
      | undefined;
    getGraderById: (id: string) => unknown;
    attackerMessageContent: string;
    finalOutput: string;
    finalResponse: GoatProviderResponse;
    targetProvider: ApiProvider;
    additionalRubric: string;
    context: CallApiContextParams | undefined;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    gradingTraceSummary: string | undefined;
  }): Promise<{
    graderPassed: boolean | undefined;
    storedGraderResult: GradingResult | undefined;
  }> {
    if (!test || !assertToUse || !finalOutput) {
      return { graderPassed: undefined, storedGraderResult: undefined };
    }

    const grader = (
      getGraderById as (
        id: string,
      ) =>
        | { getResult: (...args: unknown[]) => Promise<{ grade: GradingResult; rubric: string }> }
        | undefined
    )('type' in assertToUse ? assertToUse.type : '');
    if (!grader) {
      return { graderPassed: undefined, storedGraderResult: undefined };
    }

    const gradingContext = await this.buildGoatGradingContext(
      finalResponse,
      test,
      context,
      tracingOptions,
      gradingTraceSummary,
    );

    const { grade, rubric } = await grader.getResult(
      attackerMessageContent,
      finalOutput,
      test,
      targetProvider,
      assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
      additionalRubric,
      undefined,
      gradingContext,
    );

    const storedGraderResult: GradingResult = {
      ...grade,
      assertion: grade.assertion
        ? { ...grade.assertion, value: rubric }
        : assertToUse && 'type' in assertToUse && assertToUse.type !== 'assert-set'
          ? { ...assertToUse, value: rubric }
          : undefined,
    };

    return { graderPassed: grade.pass, storedGraderResult };
  }

  private async handleGoatUnblocking(
    messages: Message[],
    previousTargetOutput: string,
    context: CallApiContextParams | undefined,
    options: CallApiOptionsParams | undefined,
    targetProvider: ApiProvider,
    totalTokenUsage: TokenUsage,
  ): Promise<boolean> {
    const unblockingResult = await tryUnblocking({
      messages,
      lastResponse: previousTargetOutput,
      goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
      purpose: context?.test?.metadata?.purpose,
    });

    if (!unblockingResult.success || !unblockingResult.unblockingPrompt) {
      return false;
    }

    logger.debug(`[GOAT] Sending unblocking response: ${unblockingResult.unblockingPrompt}`);
    messages.push({ role: 'user', content: unblockingResult.unblockingPrompt });

    let unblockingTargetPrompt = this.config.stateful
      ? unblockingResult.unblockingPrompt
      : JSON.stringify(messages);

    if (this.perTurnLayers.length > 0) {
      const transformResult = await applyRuntimeTransforms(
        unblockingResult.unblockingPrompt,
        this.config.injectVar,
        this.perTurnLayers,
        Strategies,
        {
          evaluationId: context?.evaluationId,
          testCaseId: context?.test?.metadata?.testCaseId as string | undefined,
          purpose: context?.test?.metadata?.purpose as string | undefined,
          goal: context?.test?.metadata?.goal as string | undefined,
        },
      );
      if (transformResult.error) {
        logger.warn('[GOAT] Transform failed for unblocking prompt', {
          error: transformResult.error,
        });
        return false;
      }
      unblockingTargetPrompt = transformResult.prompt;
    }

    const unblockingResponse = await targetProvider.callApi(
      unblockingTargetPrompt,
      context,
      options,
    );
    if (!unblockingResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
      logger.debug(`Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
    accumulateResponseTokenUsage(totalTokenUsage, unblockingResponse);

    const unblockingOutput =
      typeof unblockingResponse.output === 'string'
        ? unblockingResponse.output
        : safeJsonStringify(unblockingResponse.output);

    if (unblockingOutput) {
      messages.push({ role: 'assistant', content: unblockingOutput });
    }
    if (unblockingResponse.error) {
      logger.error(`[GOAT] Target returned an error: ${unblockingResponse.error}`);
    }
    return true;
  }

  private async fetchGoatAttackMessage(
    turn: number,
    context: CallApiContextParams | undefined,
    messages: Message[],
    previousTargetOutput: string,
    previousAttackerMessage: string,
    previousTraceSummary: string | undefined,
    options: CallApiOptionsParams | undefined,
  ): Promise<{ attackerMessage: { role: string; content: string }; skip: boolean }> {
    let body: string;
    let failureReason: string | undefined;

    if (this.config.excludeTargetOutputFromAgenticAttackGeneration && turn > 0) {
      body = JSON.stringify({
        goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
        targetOutput: previousTargetOutput,
        attackAttempt: previousAttackerMessage,
        task: 'extract-goat-failure',
        modifiers: context?.test?.metadata?.modifiers,
        traceSummary: previousTraceSummary,
      });
      logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
      const failResp = await fetchWithProxy(
        getRemoteGenerationUrl(),
        { body, headers: { 'Content-Type': 'application/json' }, method: 'POST' },
        options?.abortSignal,
      );
      const failData = (await failResp.json()) as ExtractAttackFailureResponse;
      if (!failData.message) {
        logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data: failData });
        return { attackerMessage: { role: 'user', content: '' }, skip: true };
      }
      failureReason = failData.message;
      logger.debug(`[GOAT] Previous attack attempt failure reason: ${failureReason}`);
    }

    body = JSON.stringify({
      goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
      i: turn,
      messages: this.config.excludeTargetOutputFromAgenticAttackGeneration
        ? messages.filter((m) => m.role !== 'assistant')
        : messages,
      prompt: context?.prompt?.raw,
      task: 'goat',
      version: VERSION,
      email: getUserEmail(),
      excludeTargetOutputFromAgenticAttackGeneration:
        this.config.excludeTargetOutputFromAgenticAttackGeneration,
      failureReason,
      purpose: context?.test?.metadata?.purpose,
      modifiers: context?.test?.metadata?.modifiers,
      traceSummary: previousTraceSummary,
      inputs: this.config.inputs,
    });

    logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
    const response = await fetchWithProxy(
      getRemoteGenerationUrl(),
      { body, headers: { 'Content-Type': 'application/json' }, method: 'POST' },
      options?.abortSignal,
    );
    const data = await response.json();
    if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
      logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data });
      return { attackerMessage: { role: 'user', content: '' }, skip: true };
    }

    return { attackerMessage: data.message, skip: false };
  }

  private async runGoatTurn({
    turn,
    context,
    options,
    targetProvider,
    messages,
    totalTokenUsage,
    redteamHistory,
    previousAttackerMessage,
    previousTargetOutput,
    previousTraceSummary,
    test,
    assertToUse,
    getGraderById,
    additionalRubric,
    tracingOptions,
    shouldFetchTrace,
    traceSnapshots,
  }: {
    turn: number;
    context: CallApiContextParams;
    options: CallApiOptionsParams | undefined;
    targetProvider: ApiProvider;
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
    previousAttackerMessage: string;
    previousTargetOutput: string;
    previousTraceSummary: string | undefined;
    test: AtomicTestCase | undefined;
    assertToUse: Assertion | AssertionSet | undefined;
    getGraderById: (id: string) => unknown;
    additionalRubric: string;
    tracingOptions: ReturnType<typeof resolveTracingOptions>;
    shouldFetchTrace: boolean;
    traceSnapshots: TraceContextData[];
  }): Promise<{
    skip: boolean;
    attackerMessageContent: string;
    stringifiedOutput: string;
    graderPassed: boolean | undefined;
    storedGraderResult: GradingResult | undefined;
    attackTraceSummary: string | undefined;
    lastTransformResult?: TransformResult;
    lastTransformDisplayVars?: Record<string, string>;
    lastFinalAttackPrompt?: string;
    lastTargetResponse: GoatProviderResponse | undefined;
    newContext: CallApiContextParams;
  }> {
    const noResult = {
      skip: true,
      attackerMessageContent: '',
      stringifiedOutput: '',
      graderPassed: undefined,
      storedGraderResult: undefined,
      attackTraceSummary: undefined,
      lastTargetResponse: undefined,
      newContext: context,
    };

    if (turn > 0 && previousTargetOutput) {
      const shouldContinue = await this.handleGoatUnblocking(
        messages,
        previousTargetOutput,
        context,
        options,
        targetProvider,
        totalTokenUsage,
      );
      if (!shouldContinue && this.perTurnLayers.length > 0) {
        // Transform failed in unblocking - skip
        return noResult;
      }
    }

    const { attackerMessage, skip } = await this.fetchGoatAttackMessage(
      turn,
      context,
      messages,
      previousTargetOutput,
      previousAttackerMessage,
      previousTraceSummary,
      options,
    );
    if (skip) {
      return noResult;
    }

    let processedMessage = attackerMessage.content;
    const extractedPrompt = extractPromptFromTags(attackerMessage.content);
    if (extractedPrompt) {
      processedMessage = extractedPrompt;
    }

    const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);
    if (currentInputVars && this.config.inputs) {
      try {
        const parsed = JSON.parse(processedMessage);
        if (typeof parsed.prompt === 'string') {
          processedMessage = parsed.prompt;
        }
      } catch {
        // Not valid JSON, use as-is
      }
    }

    const targetVars: Record<string, VarValue> = {
      ...context.vars,
      [this.config.injectVar]: processedMessage,
      ...(currentInputVars || {}),
    };

    const renderedAttackerPrompt = await renderPrompt(
      context.prompt,
      targetVars,
      context.filters,
      targetProvider,
      [this.config.injectVar],
    );

    messages.push({ role: attackerMessage.role, content: renderedAttackerPrompt });

    logger.debug(dedent`
      ${chalk.bold.green(`GOAT turn ${turn} history:`)}
      ${chalk.cyan(JSON.stringify(messages, null, 2))}
    `);

    const latestMessageContent = messages[messages.length - 1].content;
    let targetPrompt = this.config.stateful ? latestMessageContent : JSON.stringify(messages);
    logger.debug(`GOAT turn ${turn} target prompt: ${renderedAttackerPrompt}`);

    let lastTransformResult: TransformResult | undefined;
    let lastTransformDisplayVars: Record<string, string> | undefined;
    let lastFinalAttackPrompt: string | undefined;

    const transformOutput = await this.applyGoatPerTurnTransforms(
      latestMessageContent,
      context,
      messages,
    );
    if (transformOutput !== null) {
      if (transformOutput.transformResult.error) {
        logger.warn('[GOAT] Transform failed, skipping turn', {
          turn,
          error: transformOutput.transformResult.error,
        });
        return noResult;
      }
      targetPrompt = transformOutput.targetPrompt;
      lastTransformResult = transformOutput.transformResult;
      lastTransformDisplayVars = transformOutput.displayVars;
      lastFinalAttackPrompt = transformOutput.finalAttackPrompt;
    }

    const iterationStart = Date.now();
    const targetResponse = (await targetProvider.callApi(
      targetPrompt,
      context,
      options,
    )) as GoatProviderResponse;

    if (!targetResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
      logger.debug(`Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
    accumulateResponseTokenUsage(totalTokenUsage, targetResponse);
    logger.debug(`GOAT turn ${turn} target response`, { response: targetResponse });

    let computedTraceSummary: string | undefined;
    if (shouldFetchTrace) {
      const traceResult = await this.fetchGoatTrace(
        iterationStart,
        context,
        tracingOptions,
        traceSnapshots,
        targetResponse,
      );
      computedTraceSummary = traceResult.computedTraceSummary;
    }

    let newContext = context;
    if (targetResponse.sessionId) {
      newContext = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
      newContext.vars.sessionId = targetResponse.sessionId;
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
      logger.debug('[GOAT] Target response output is not a string or JSON', {
        response: targetResponse,
      });
      return noResult;
    }

    messages.push({ role: 'assistant', content: stringifiedOutput });

    redteamHistory.push({
      prompt: attackerMessage.content,
      promptAudio: lastTransformResult?.audio,
      promptImage: lastTransformResult?.image,
      output: stringifiedOutput,
      outputAudio:
        targetResponse.audio?.data && targetResponse.audio?.format
          ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
          : undefined,
      inputVars: currentInputVars,
    });

    const attackTraceSummary = tracingOptions.includeInAttack ? computedTraceSummary : undefined;
    const gradingTraceSummary = tracingOptions.includeInGrading ? computedTraceSummary : undefined;

    const { graderPassed, storedGraderResult } = await this.runGoatGrader({
      test,
      assertToUse,
      getGraderById,
      attackerMessageContent: attackerMessage.content,
      finalOutput: stringifiedOutput,
      finalResponse: targetResponse,
      targetProvider,
      additionalRubric,
      context,
      tracingOptions,
      gradingTraceSummary,
    });

    return {
      skip: false,
      attackerMessageContent: attackerMessage.content,
      stringifiedOutput,
      graderPassed,
      storedGraderResult,
      attackTraceSummary,
      lastTransformResult,
      lastTransformDisplayVars,
      lastFinalAttackPrompt,
      lastTargetResponse: targetResponse,
      newContext,
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
    const traceSnapshots: TraceContextData[] = [];

    logger.debug('[GOAT] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;
    const messages: Message[] = [];
    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();

    const redteamHistory: Array<{
      prompt: string;
      promptAudio?: MediaData;
      promptImage?: MediaData;
      output: string;
      outputAudio?: MediaData;
      outputImage?: MediaData;
      inputVars?: Record<string, string>;
    }> = [];

    let lastTargetResponse: ProviderResponse | undefined = undefined;
    let lastTransformDisplayVars: Record<string, string> | undefined;
    let lastFinalAttackPrompt: string | undefined;
    let graderPassed: boolean | undefined;
    let storedGraderResult: GradingResult | undefined;

    const { getGraderById } = await import('../graders');
    const test = context?.test;
    const assertToUse = test
      ? test.assert?.find(
          (a: { type: string }) => a.type && a.type.includes(test.metadata?.pluginId),
        ) || test.assert?.find((a: { type: string }) => a.type)
      : undefined;

    let previousAttackerMessage = '';
    let previousTargetOutput = '';
    let previousTraceSummary: string | undefined;

    const userGoal = context?.test?.metadata?.goal || context?.vars[this.config.injectVar];
    const additionalRubric = getGoalRubric(userGoal);

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        const turnResult = await this.runGoatTurn({
          turn,
          context,
          options,
          targetProvider,
          messages,
          totalTokenUsage,
          redteamHistory,
          previousAttackerMessage,
          previousTargetOutput,
          previousTraceSummary,
          test,
          assertToUse,
          getGraderById,
          additionalRubric,
          tracingOptions,
          shouldFetchTrace,
          traceSnapshots,
        });

        if (turnResult.skip) {
          continue;
        }

        context = turnResult.newContext;
        previousAttackerMessage = turnResult.attackerMessageContent;
        previousTargetOutput = turnResult.stringifiedOutput;
        previousTraceSummary = turnResult.attackTraceSummary;
        lastTargetResponse = turnResult.lastTargetResponse;
        graderPassed = turnResult.graderPassed;
        storedGraderResult = turnResult.storedGraderResult;
        lastTransformDisplayVars = turnResult.lastTransformDisplayVars ?? lastTransformDisplayVars;
        lastFinalAttackPrompt = turnResult.lastFinalAttackPrompt ?? lastFinalAttackPrompt;

        if (graderPassed === false) {
          this.successfulAttacks.push({
            turn,
            prompt: turnResult.attackerMessageContent,
            response: turnResult.stringifiedOutput,
            traceSummary: turnResult.attackTraceSummary,
          });
          if (!this.config.continueAfterSuccess) {
            break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.debug('[GOAT] Operation aborted');
          throw error;
        }
        logger.error(
          `[GOAT] An error occurred in GOAT turn ${turn}.  The test will continue to the next turn in the conversation.`,
          { error: (error as Error).message || error },
        );
      }
    }

    const finalPrompt = getLastMessageContent(messages, 'user') || '';
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        redteamFinalPrompt: lastFinalAttackPrompt || finalPrompt,
        messages: messages as Record<string, any>[],
        stopReason:
          this.successfulAttacks.length > 0 && !this.config.continueAfterSuccess
            ? 'Grader failed'
            : 'Max turns reached',
        redteamHistory,
        successfulAttacks: this.successfulAttacks,
        totalSuccessfulAttacks: this.successfulAttacks.length,
        storedGraderResult,
        traceSnapshots:
          traceSnapshots.length > 0
            ? traceSnapshots.map((snapshot) => formatTraceForMetadata(snapshot))
            : undefined,
        sessionId: getSessionId(lastTargetResponse, context),
        ...(lastTransformDisplayVars && { transformDisplayVars: lastTransformDisplayVars }),
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
