import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail, isLoggedIntoCloud } from '../../globalConfig/accounts';
import logger, { markLogContextSafe, runWithRedactedLogging } from '../../logger';
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
import { materializeInputVariablesWithMetadata } from '../inputVariables';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../remoteGeneration';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
  createRemoteMaterializationUpgradeError,
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
import type { RedteamGradingContext } from '../grading/types';
import type { BaseRedteamMetadata } from '../types';
import type { Message } from './shared';

const ATTACHED_IMAGE_OUTPUT_PLACEHOLDER =
  '[Image output attached. Inspect the attached image directly for visual grading.]';

/**
 * Represents metadata for the GOAT conversation process.
 */
interface GoatMetadata extends BaseRedteamMetadata {
  goatRunId: string;
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
  targetId?: string;
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

const GOAT_MATERIALIZATION_OPERATION = 'GOAT multi-input generation';

function getStringLength(value: unknown): number | undefined {
  return typeof value === 'string' ? value.length : undefined;
}

function safeGet(value: unknown, key: PropertyKey): unknown {
  try {
    return value !== null && (typeof value === 'object' || typeof value === 'function')
      ? Reflect.get(value, key)
      : undefined;
  } catch {
    return undefined;
  }
}

function safeGetOwnDataProperty(value: unknown, key: PropertyKey): unknown {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function getLogValueType(value: unknown): string | undefined {
  try {
    return Array.isArray(value) ? 'array' : typeof value;
  } catch {
    return undefined;
  }
}

function getObjectKeyCount(value: unknown): number | undefined {
  try {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).length
      : undefined;
  } catch {
    return undefined;
  }
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getRemoteGenerationHost(): string | undefined {
  try {
    return new URL(getRemoteGenerationUrl()).host;
  } catch {
    return undefined;
  }
}

function getRemoteResponseLogMetadata(data: unknown, response?: Response) {
  const message = safeGet(data, 'message');
  const messageRole = safeGet(message, 'role');
  return {
    httpOk: getBoolean(safeGet(response, 'ok')),
    httpStatus: getFiniteNumber(safeGet(response, 'status')),
    responseKeyCount: getObjectKeyCount(data),
    hasError: Boolean(safeGet(data, 'error')),
    hasMessage: Boolean(message),
    messageType: typeof message,
    messageContentLength: getStringLength(safeGet(message, 'content')),
    hasMessageRole: messageRole !== undefined && messageRole !== null,
    messageRoleType: typeof messageRole,
  };
}

const TOKEN_USAGE_KEYS = ['total', 'prompt', 'completion', 'cached', 'numRequests'] as const;
const COMPLETION_DETAIL_KEYS = [
  'reasoning',
  'acceptedPrediction',
  'rejectedPrediction',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
] as const;

function getFiniteNumberFields(value: unknown, keys: readonly string[]) {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const number = getFiniteNumber(safeGetOwnDataProperty(value, key));
    if (number !== undefined) {
      result[key] = number;
    }
  }
  return result;
}

function getTokenUsageLogMetadata(value: unknown, includeAssertions = true) {
  const result = getFiniteNumberFields(value, TOKEN_USAGE_KEYS);
  const completionDetails = getFiniteNumberFields(
    safeGetOwnDataProperty(value, 'completionDetails'),
    COMPLETION_DETAIL_KEYS,
  );
  if (Object.keys(completionDetails).length > 0) {
    result.completionDetails = completionDetails;
  }
  const assertions = includeAssertions
    ? getTokenUsageLogMetadata(safeGetOwnDataProperty(value, 'assertions'), false)
    : undefined;
  if (assertions) {
    result.assertions = assertions;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function getProviderResponseLogMetadata(response?: ProviderResponse) {
  const output = safeGetOwnDataProperty(response, 'output');
  const error = safeGetOwnDataProperty(response, 'error');

  return {
    cached: getBoolean(safeGetOwnDataProperty(response, 'cached')),
    hasError: Boolean(error),
    errorLength: getStringLength(error),
    hasOutput: output !== undefined && output !== null,
    outputType: getLogValueType(output),
    outputLength: getStringLength(output),
    tokenUsage: getTokenUsageLogMetadata(safeGetOwnDataProperty(response, 'tokenUsage')),
    conversationEnded: getBoolean(safeGetOwnDataProperty(response, 'conversationEnded')),
    hasAudio: Boolean(safeGetOwnDataProperty(safeGetOwnDataProperty(response, 'audio'), 'data')),
    hasTraceContext: Boolean(safeGetOwnDataProperty(response, 'traceContext')),
    hasSessionId: Boolean(safeGetOwnDataProperty(response, 'sessionId')),
  };
}

function getRemoteGenerationLogHeaders() {
  return { ...getRemoteGenerationHeaders(), 'x-promptfoo-silent': 'true' };
}

function isErrorInstance(value: unknown): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function isAbortError(value: unknown): boolean {
  return isErrorInstance(value) && safeGet(value, 'name') === 'AbortError';
}

function getErrorLogMetadata(value: unknown) {
  const isError = isErrorInstance(value);
  return {
    errorType: isError ? 'Error' : typeof value,
    errorMessageLength: getStringLength(isError ? safeGet(value, 'message') : value),
  };
}

function createGoatLogger(goatRunId: string) {
  const withRunId = (context: Record<string, unknown> = {}) =>
    markLogContextSafe({ ...context, goatRunId });
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      logger.debug(message, withRunId(context)),
    error: (message: string, context?: Record<string, unknown>) =>
      logger.error(message, withRunId(context)),
    info: (message: string, context?: Record<string, unknown>) =>
      logger.info(message, withRunId(context)),
    warn: (message: string, context?: Record<string, unknown>) =>
      logger.warn(message, withRunId(context)),
  };
}

export default class GoatProvider implements ApiProvider {
  readonly config: GoatConfig;
  private readonly nunjucks: any;
  private readonly perTurnLayers: LayerConfig[];

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
      targetId?: string;
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
      targetId: options.targetId,
    };
    this.perTurnLayers = options._perTurnLayers ?? [];
    this.nunjucks = getNunjucksEngine();
    logger.debug('[GOAT] Constructor options', {
      hasInjectVar: Boolean(options.injectVar),
      injectVarLength: getStringLength(options.injectVar),
      maxTurns: getFiniteNumber(options.maxTurns),
      maxCharsPerMessage: getFiniteNumber(options.maxCharsPerMessage),
      stateful: getBoolean(options.stateful),
      continueAfterSuccess: getBoolean(options.continueAfterSuccess),
      perTurnLayerCount: getFiniteNumber(safeGetOwnDataProperty(this.perTurnLayers, 'length')),
      inputKeyCount: getObjectKeyCount(options.inputs),
    });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<GoatResponse> {
    const goatRunId = crypto.randomUUID();
    return runWithRedactedLogging(goatRunId, async () => {
      const log = createGoatLogger(goatRunId);
      try {
        return await this.callApiInLogScope(goatRunId, context, options);
      } catch (error) {
        if (options?.abortSignal?.aborted === true || isAbortError(error)) {
          const abortError = new Error('Operation aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }
        if (isRemoteMaterializationUpgradeError(error)) {
          throw createRemoteMaterializationUpgradeError(GOAT_MATERIALIZATION_OPERATION);
        }
        log.error('[GOAT] Evaluation failed', getErrorLogMetadata(error));
        throw new Error('GOAT evaluation failed');
      }
    });
  }

  private async callApiInLogScope(
    goatRunId: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<GoatResponse> {
    const log = createGoatLogger(goatRunId);
    const successfulAttacks: NonNullable<GoatMetadata['successfulAttacks']> = [];
    const perTurnLayerCount =
      getFiniteNumber(safeGetOwnDataProperty(this.perTurnLayers, 'length')) ?? 0;

    const tracingOptions = resolveTracingOptions({
      strategyId: 'goat',
      test: context?.test,
      config: this.config,
    });
    const shouldFetchTrace =
      tracingOptions.enabled && (tracingOptions.includeInAttack || tracingOptions.includeInGrading);
    const traceSnapshots: TraceContextData[] = [];

    let response: Response | undefined = undefined;
    log.debug('[GOAT] callApi context', {
      hasContext: Boolean(context),
      varsKeyCount: getObjectKeyCount(safeGetOwnDataProperty(context, 'vars')),
    });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');
    const maxCharsPerMessage =
      this.config.maxCharsPerMessage ??
      (context?.test?.metadata?.strategyConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage ??
      (context?.test?.metadata?.pluginConfig as { maxCharsPerMessage?: number } | undefined)
        ?.maxCharsPerMessage;

    const messages: Message[] = [];
    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();

    // Track redteamHistory entries with audio/image data for UI rendering
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
    let lastTargetSessionId: ProviderResponse['sessionId'];

    // Track display vars from per-turn layer transforms (e.g., fetchPrompt, embeddedInjection)
    let lastTransformDisplayVars: Record<string, string> | undefined;

    // Track the last transformed prompt (e.g., fetchPrompt for indirect-web-pwn) for UI display
    let lastFinalAttackPrompt: string | undefined;

    let assertToUse: Assertion | AssertionSet | undefined;
    let graderPassed: boolean | undefined;
    let storedGraderResult: GradingResult | undefined;
    const { getGraderById } = await import('../graders');
    let test: AtomicTestCase | undefined;

    if (context?.test) {
      test = context?.test;
      assertToUse = test?.assert?.find(
        (a: { type: string }) => a.type && a.type.includes(test?.metadata?.pluginId),
      );

      // Fallback: if no assertion matches the pluginId, use the first assertion with a type
      if (!assertToUse) {
        assertToUse = test?.assert?.find((a: { type: string }) => a.type);
      }
    }

    let previousAttackerMessage = '';
    let previousTargetOutput = '';
    let previousTraceSummary: string | undefined;

    // Generate goal-specific evaluation rubric
    const userGoal = context?.test?.metadata?.goal || context?.vars[this.config.injectVar];
    const additionalRubric = getGoalRubric(userGoal);
    let stopReason: GoatMetadata['stopReason'] = 'Max turns reached';

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      let errorStage = 'unblocking';
      try {
        // Handle unblocking logic BEFORE attack (skip on first turn)
        if (turn > 0 && previousTargetOutput) {
          const unblockingResult = await tryUnblocking({
            messages,
            lastResponse: previousTargetOutput,
            goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
            purpose: context?.test?.metadata?.purpose,
            targetId: this.config.targetId,
          });

          if (unblockingResult.diagnostic) {
            log.warn('[GOAT] Child operation degraded', { ...unblockingResult.diagnostic });
          }

          if (unblockingResult.success && unblockingResult.unblockingPrompt) {
            log.debug('[GOAT] Sending unblocking response', {
              turn,
              promptLength: unblockingResult.unblockingPrompt.length,
            });

            messages.push({ role: 'user', content: unblockingResult.unblockingPrompt });

            let unblockingTargetPrompt = this.config.stateful
              ? unblockingResult.unblockingPrompt
              : JSON.stringify(messages);

            // Apply per-turn transforms to unblocking prompt as well
            if (perTurnLayerCount > 0) {
              // Transform just the unblocking prompt content, not the full JSON
              const transformResult = await applyRuntimeTransforms(
                unblockingResult.unblockingPrompt,
                this.config.injectVar,
                this.perTurnLayers,
                Strategies,
                {
                  targetId: this.config.targetId,
                  evaluationId: context?.evaluationId,
                  testCaseId: context?.test?.metadata?.testCaseId as string | undefined,
                  purpose: context?.test?.metadata?.purpose as string | undefined,
                  goal: context?.test?.metadata?.goal as string | undefined,
                },
              );
              if (transformResult.error) {
                log.warn('[GOAT] Transform failed for unblocking prompt', {
                  errorLength: getStringLength(transformResult.error),
                });
                continue; // Skip unblocking attempt
              }
              for (const diagnostic of transformResult.diagnostics ?? []) {
                log.warn('[GOAT] Child operation degraded', {
                  ...diagnostic,
                  operation: 'unblocking-transform',
                });
              }
              // For audio/image transforms, send the transformed content directly
              unblockingTargetPrompt = transformResult.prompt;
            }

            throwIfTargetPromptExceedsMaxChars(unblockingTargetPrompt, maxCharsPerMessage);
            const unblockingResponse = await targetProvider.callApi(
              unblockingTargetPrompt,
              context,
              options,
            );

            const unblockingDelayMs = getFiniteNumber(safeGet(targetProvider, 'delay'));
            if (
              getBoolean(safeGet(unblockingResponse, 'cached')) !== true &&
              unblockingDelayMs !== undefined &&
              unblockingDelayMs > 0
            ) {
              log.debug('[GOAT] Applying post-request delay', { delayMs: unblockingDelayMs });
              await sleep(unblockingDelayMs);
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
              log.error('[GOAT] Target returned an error', {
                turn,
                errorLength: getStringLength(unblockingResponse.error),
              });
            }
          }
        }

        // Generate and send attack
        let body: string;
        let failureReason: string | undefined;
        if (this.config.excludeTargetOutputFromAgenticAttackGeneration && turn > 0) {
          errorStage = 'failure-extraction';
          const failureRequest = {
            goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
            targetOutput: previousTargetOutput,
            attackAttempt: previousAttackerMessage,
            task: 'extract-goat-failure',
            ...remoteGenerationContextPayload(this.config.targetId),
            modifiers: context?.test?.metadata?.modifiers,
            traceSummary: previousTraceSummary,
          };
          body = JSON.stringify(failureRequest);
          log.debug('[GOAT] Sending failure extraction request', {
            turn,
            task: 'extract-goat-failure',
            bodyLength: body.length,
            remoteGenerationHost: getRemoteGenerationHost(),
          });
          response = await fetchWithProxy(
            getRemoteGenerationUrl(),
            {
              body,
              headers: getRemoteGenerationLogHeaders(),
              method: 'POST',
            },
            options?.abortSignal,
          );
          const data = (await response.json()) as ExtractAttackFailureResponse;

          if (!data.message) {
            log.info(
              '[GOAT] Invalid message from GOAT, skipping turn',
              getRemoteResponseLogMetadata(data, response),
            );
            continue;
          }
          failureReason = data.message;
        }

        errorStage = 'attack-generation';
        const goatRequest = {
          goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
          i: turn,
          messages: this.config.excludeTargetOutputFromAgenticAttackGeneration
            ? messages.filter((m) => m.role !== 'assistant')
            : messages,
          prompt: context?.prompt?.raw,
          task: 'goat',
          ...remoteGenerationContextPayload(this.config.targetId),
          version: VERSION,
          email: getUserEmail(),
          excludeTargetOutputFromAgenticAttackGeneration:
            this.config.excludeTargetOutputFromAgenticAttackGeneration,
          failureReason,
          purpose: context?.test?.metadata?.purpose,
          modifiers: context?.test?.metadata?.modifiers,
          traceSummary: previousTraceSummary,
          // Pass inputs schema for multi-input mode
          inputs: this.config.inputs,
        };
        body = JSON.stringify(goatRequest);

        log.debug('[GOAT] Sending generation request', {
          turn,
          task: 'goat',
          bodyLength: body.length,
          messageCount: goatRequest.messages.length,
          remoteGenerationHost: getRemoteGenerationHost(),
        });
        response = await fetchWithProxy(
          getRemoteGenerationUrl(),
          {
            body,
            headers: getRemoteGenerationLogHeaders(),
            method: 'POST',
          },
          options?.abortSignal,
        );
        const data = await response.json();
        if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
          log.info(
            '[GOAT] Invalid message from GOAT, skipping turn',
            getRemoteResponseLogMetadata(data, response),
          );
          continue;
        }
        const attackerMessage = data.message;
        errorStage = 'target-prompt';

        previousAttackerMessage = attackerMessage?.content;

        // Extract JSON from <Prompt> tags if present (multi-input mode)
        let processedMessage = attackerMessage.content;
        const extractedPrompt = extractPromptFromTags(attackerMessage.content);
        if (extractedPrompt) {
          processedMessage = extractedPrompt;
        }

        // Extract input vars from the attack message for multi-input mode
        if (this.config.inputs) {
          assertRemoteMaterializationHandled(data, GOAT_MATERIALIZATION_OPERATION);
        }
        const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);
        let materializedInputVars:
          | Awaited<ReturnType<typeof materializeInputVariablesWithMetadata>>
          | undefined;
        if (currentInputVars && this.config.inputs) {
          materializedInputVars = buildRemoteMaterializedInputVariables(
            data,
            currentInputVars,
            this.config.inputs,
          );
        }
        const currentRenderInputVars = materializedInputVars?.vars ?? currentInputVars;

        // For multi-input mode, extract the 'prompt' field from JSON for the inject var
        // Cloud returns JSON like: {"prompt": "attack text", "message": "val1", "email": "val2"}
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

        const attackerVars = {
          [this.config.injectVar]: processedMessage,
          ...(currentRenderInputVars || {}),
        };
        const targetVars: Record<string, VarValue> = {
          ...context.vars,
          ...attackerVars,
        };

        const renderedAttackerPrompt = await renderPrompt(
          context.prompt,
          targetVars,
          context.filters,
          targetProvider,
          Object.keys(attackerVars),
        );

        messages.push({
          role: attackerMessage.role,
          content: renderedAttackerPrompt,
        });

        // Get the latest message content for transforms
        const latestMessageContent = messages[messages.length - 1].content;
        let targetPrompt = this.config.stateful ? latestMessageContent : JSON.stringify(messages);

        // ═══════════════════════════════════════════════════════════════════════
        // Apply per-turn layer transforms if configured (e.g., audio, base64)
        // This enables: layer: { steps: [goat, audio] }
        // ═══════════════════════════════════════════════════════════════════════
        let lastTransformResult: TransformResult | undefined;
        if (perTurnLayerCount > 0) {
          // Transform the actual message content, not the full targetPrompt (which may be JSON)
          // This ensures we convert just the text to audio, not the JSON structure
          lastTransformResult = await applyRuntimeTransforms(
            latestMessageContent,
            this.config.injectVar,
            this.perTurnLayers,
            Strategies,
            {
              targetId: this.config.targetId,
              evaluationId: context?.evaluationId,
              testCaseId: context?.test?.metadata?.testCaseId as string | undefined,
              purpose: context?.test?.metadata?.purpose as string | undefined,
              goal: context?.test?.metadata?.goal as string | undefined,
            },
          );

          // Skip turn if transform failed
          if (lastTransformResult.error) {
            log.warn('[GOAT] Transform failed, skipping turn', {
              turn,
              errorLength: getStringLength(lastTransformResult.error),
            });
            continue;
          }

          for (const diagnostic of lastTransformResult.diagnostics ?? []) {
            log.warn('[GOAT] Child operation degraded', { ...diagnostic });
          }

          // For audio/image transforms, send a hybrid format:
          // - Previous turns as text (for context)
          // - Current turn as audio/image (the actual attack)
          if (lastTransformResult.audio || lastTransformResult.image) {
            // Build hybrid payload with conversation history + current transformed turn
            const historyWithoutCurrentTurn = messages.slice(0, -1);
            const hybridPayload = {
              _promptfoo_audio_hybrid: true,
              history: historyWithoutCurrentTurn,
              currentTurn: {
                role: 'user' as const,
                transcript: latestMessageContent, // Original text for reference
                ...(lastTransformResult.audio && {
                  audio: lastTransformResult.audio,
                }),
                ...(lastTransformResult.image && {
                  image: lastTransformResult.image,
                }),
              },
            };
            targetPrompt = JSON.stringify(hybridPayload);
            log.debug('[GOAT] Using hybrid format (history + audio/image current turn)', {
              turn,
              historyLength: historyWithoutCurrentTurn.length,
              hasAudio: !!lastTransformResult.audio,
              hasImage: !!lastTransformResult.image,
            });
          } else {
            // No audio/image, just use the transformed text
            targetPrompt = lastTransformResult.prompt;
          }

          log.debug('[GOAT] Per-turn transforms applied', {
            turn,
            perTurnLayerCount,
            hasAudio: !!lastTransformResult.audio,
            hasImage: !!lastTransformResult.image,
          });

          // Capture display vars from transform (e.g., fetchPrompt, webPageUrl, embeddedInjection)
          if (lastTransformResult.displayVars) {
            lastTransformDisplayVars = lastTransformResult.displayVars;
          }

          // Track the final prompt sent to target for UI display (e.g., fetchPrompt for indirect-web-pwn)
          lastFinalAttackPrompt = lastTransformResult.prompt;
        }

        log.debug('[GOAT] GOAT turn target prompt', {
          turn,
          messageCount: messages.length,
          stateful: getBoolean(this.config.stateful),
          targetPromptLength: targetPrompt.length,
          renderedPromptLength: renderedAttackerPrompt.length,
        });

        const iterationStart = Date.now();
        throwIfTargetPromptExceedsMaxChars(targetPrompt, maxCharsPerMessage);
        const targetContext = context
          ? {
              ...context,
              vars: {
                ...targetVars,
                [this.config.injectVar]: targetPrompt,
              },
            }
          : context;
        errorStage = 'target-provider';
        const targetResponse = (await targetProvider.callApi(
          targetPrompt,
          targetContext,
          options,
        )) as GoatProviderResponse;

        const targetDelayMs = getFiniteNumber(safeGet(targetProvider, 'delay'));
        if (
          getBoolean(safeGet(targetResponse, 'cached')) !== true &&
          targetDelayMs !== undefined &&
          targetDelayMs > 0
        ) {
          log.debug('[GOAT] Applying post-request delay', { delayMs: targetDelayMs });
          await sleep(targetDelayMs);
        }
        accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

        log.debug('[GOAT] GOAT turn target response', {
          turn,
          ...getProviderResponseLogMetadata(targetResponse),
        });

        let traceContext: TraceContextData | null = null;
        let computedTraceSummary: string | undefined;
        if (shouldFetchTrace) {
          errorStage = 'trace';
          const traceparent = context?.traceparent ?? undefined;
          const traceId = traceparent ? extractTraceIdFromTraceparent(traceparent) : null;

          if (traceId) {
            traceContext = await fetchTraceContext(traceId, {
              earliestStartTime: iterationStart,
              includeInternalSpans: tracingOptions.includeInternalSpans,
              maxSpans: tracingOptions.maxSpans,
              maxDepth: tracingOptions.maxDepth,
              maxRetries: tracingOptions.maxRetries,
              retryDelayMs: tracingOptions.retryDelayMs,
              spanFilter: tracingOptions.spanFilter,
              sanitizeAttributes: tracingOptions.sanitizeAttributes,
            });
            log.debug('[GOAT] Child operation outcome', {
              component: 'trace-context',
              stage: 'fetch',
              outcome: traceContext ? 'success' : 'unavailable',
              attemptLimit: Math.min((getFiniteNumber(tracingOptions.maxRetries) ?? 3) + 1, 101),
            });

            if (traceContext) {
              targetResponse.traceContext = traceContext;
              traceSnapshots.push(traceContext);
              if (tracingOptions.includeInAttack || tracingOptions.includeInGrading) {
                computedTraceSummary = formatTraceSummary(traceContext);
                targetResponse.traceSummary = computedTraceSummary;
              }
            }
          }
        }

        const targetSessionId = targetResponse.sessionId;
        lastTargetSessionId = targetSessionId;
        if (targetSessionId) {
          context = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
          context.vars.sessionId = targetSessionId;
        }
        if (targetResponse.conversationEnded) {
          const conversationEndReason = targetResponse.conversationEndReason;
          log.info('[GOAT] Target ended conversation', {
            turn,
            hasReason: Boolean(conversationEndReason),
            reasonLength: getStringLength(conversationEndReason),
          });
          const endedOutput =
            typeof targetResponse.output === 'string'
              ? targetResponse.output
              : safeJsonStringify(targetResponse.output);

          if (endedOutput) {
            messages.push({
              role: 'assistant',
              content: endedOutput,
            });
            redteamHistory.push({
              prompt: attackerMessage.content,
              promptAudio: lastTransformResult?.audio,
              promptImage: lastTransformResult?.image,
              output: endedOutput,
              outputAudio:
                targetResponse.audio?.data && targetResponse.audio?.format
                  ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
                  : undefined,
              inputVars: currentRenderInputVars,
            });
          }

          lastTargetResponse = targetResponse;
          stopReason = 'Target ended conversation';
          break;
        }
        if (targetResponse.error) {
          throw new Error(`[GOAT] Target returned an error: ${targetResponse.error}`);
        }
        const hasTargetImages = Boolean(targetResponse.images?.length);
        invariant(
          targetResponse.output || hasTargetImages,
          '[GOAT] Expected target response output or images to be set',
        );

        const stringifiedOutput =
          typeof targetResponse.output === 'string'
            ? targetResponse.output
            : safeJsonStringify(targetResponse.output);
        const finalOutput =
          stringifiedOutput || (hasTargetImages ? ATTACHED_IMAGE_OUTPUT_PLACEHOLDER : '');
        const finalResponse = targetResponse;

        if (!stringifiedOutput && !hasTargetImages) {
          log.debug('[GOAT] Target response output is not a string or JSON', {
            turn,
            ...getProviderResponseLogMetadata(targetResponse),
          });
          continue;
        }

        messages.push({
          role: 'assistant',
          content: finalOutput,
        });

        // Store this turn in redteamHistory with audio/image data if present
        redteamHistory.push({
          prompt: attackerMessage.content,
          promptAudio: lastTransformResult?.audio,
          promptImage: lastTransformResult?.image,
          output: finalOutput,
          outputAudio:
            targetResponse.audio?.data && targetResponse.audio?.format
              ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
              : undefined,
          // Note: outputImage not tracked as ProviderResponse doesn't include image yet
          // Include input vars for multi-input mode (extracted from current prompt)
          inputVars: currentRenderInputVars,
        });

        // Store the attack response for potential unblocking in next turn
        const attackTraceSummary = tracingOptions.includeInAttack
          ? computedTraceSummary
          : undefined;
        const gradingTraceSummary = tracingOptions.includeInGrading
          ? computedTraceSummary
          : undefined;

        previousTraceSummary = attackTraceSummary;
        previousTargetOutput = finalOutput;

        lastTargetResponse = finalResponse;

        const grader = assertToUse ? getGraderById(assertToUse.type) : undefined;
        if (test && assertToUse && grader && finalOutput) {
          errorStage = 'grading';
          // Build grading context with image outputs, tracing, and exfil tracking data.
          let gradingContext: RedteamGradingContext | undefined = {
            providerResponse: finalResponse,
            ...(finalResponse.images?.length ? { imageOutputs: finalResponse.images } : {}),
          };

          // First try to get exfil data from provider response metadata (Playwright provider)
          if (finalResponse.metadata?.wasExfiltrated === undefined) {
            // Try to fetch exfil tracking from server API via webPageUuid
            const webPageUuid = test.metadata?.webPageUuid as string | undefined;
            if (webPageUuid) {
              const evalId =
                context?.evaluationId ?? (test.metadata?.evaluationId as string | undefined);
              log.debug('[GOAT] Fetching exfil tracking from server API', {
                hasWebPageUuid: true,
                hasEvalId: Boolean(evalId),
              });
              const exfilData = await checkExfilTracking(webPageUuid, evalId);
              log.debug('[GOAT] Child operation outcome', {
                component: 'indirect-web-pwn',
                stage: 'exfil-tracking',
                outcome: exfilData ? 'success' : 'unavailable',
              });
              if (exfilData) {
                gradingContext = {
                  ...(gradingContext ?? {}),
                  ...(tracingOptions.includeInGrading
                    ? {
                        traceContext: targetResponse.traceContext,
                        traceSummary: gradingTraceSummary,
                      }
                    : {}),
                  wasExfiltrated: exfilData.wasExfiltrated,
                  exfilCount: exfilData.exfilCount,
                  exfilRecords: exfilData.exfilRecords,
                };
              }
            }
          } else {
            log.debug('[GOAT] Using exfil data from provider response metadata');
            gradingContext = {
              ...(gradingContext ?? {}),
              ...(tracingOptions.includeInGrading
                ? { traceContext: targetResponse.traceContext, traceSummary: gradingTraceSummary }
                : {}),
              wasExfiltrated: Boolean(finalResponse.metadata.wasExfiltrated),
              exfilCount: Number(finalResponse.metadata.exfilCount) || 0,
              exfilRecords: [],
            };
          }

          // Fallback to just tracing context if no exfil data found
          if (tracingOptions.includeInGrading && !gradingContext?.traceContext) {
            gradingContext = {
              ...(gradingContext ?? {}),
              traceContext: targetResponse.traceContext,
              traceSummary: gradingTraceSummary,
            };
          }

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
          graderPassed = grade.pass;
          storedGraderResult = {
            ...grade,
            assertion: buildGraderResultAssertion(grade.assertion, assertToUse, rubric),
          };
        }

        if (graderPassed === false) {
          // Record successful attack
          successfulAttacks.push({
            turn,
            prompt: attackerMessage.content,
            response: finalOutput,
            traceSummary: attackTraceSummary,
          });

          // Only break early if continueAfterSuccess is false
          if (this.config.continueAfterSuccess) {
            // Continue to next turn
          } else {
            stopReason = 'Grader failed';
            break;
          }
        }
      } catch (error) {
        // Re-throw abort errors to properly cancel the operation
        if (options?.abortSignal?.aborted === true || isAbortError(error)) {
          log.debug('[GOAT] Operation aborted', { errorStage });
          throw error;
        }
        if (isRemoteMaterializationUpgradeError(error)) {
          throw error;
        }
        log.error(
          `[GOAT] An error occurred in GOAT turn ${turn}.  The test will continue to the next turn in the conversation.`,
          {
            errorStage,
            ...getErrorLogMetadata(error),
          },
        );
      }
    }

    const finalPrompt = getLastMessageContent(messages, 'user') || '';
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        goatRunId,
        // Use the last prompt sent to target (e.g., fetchPrompt for indirect-web-pwn layer)
        redteamFinalPrompt: lastFinalAttackPrompt || finalPrompt,
        messages: messages as Record<string, any>[],
        stopReason,
        redteamHistory,
        successfulAttacks,
        totalSuccessfulAttacks: successfulAttacks.length,
        storedGraderResult,
        traceSnapshots:
          traceSnapshots.length > 0
            ? traceSnapshots.map((snapshot) => formatTraceForMetadata(snapshot))
            : undefined,
        sessionId: getSessionId({ sessionId: lastTargetSessionId }, context),
        ...(lastTransformDisplayVars && { transformDisplayVars: lastTransformDisplayVars }),
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
