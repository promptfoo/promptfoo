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

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<GoatResponse> {
    // Reset successful attacks array for each new call
    this.successfulAttacks = [];

    const tracingOptions = resolveTracingOptions({
      strategyId: 'goat',
      test: context?.test,
      config: this.config,
    });
    const shouldFetchTrace =
      tracingOptions.enabled && (tracingOptions.includeInAttack || tracingOptions.includeInGrading);
    const traceSnapshots: TraceContextData[] = [];

    let response: Response | undefined = undefined;
    logger.debug('[GOAT] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

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

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        // Handle unblocking logic BEFORE attack (skip on first turn)
        if (turn > 0 && previousTargetOutput) {
          const unblockingResult = await tryUnblocking({
            messages,
            lastResponse: previousTargetOutput,
            goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
            purpose: context?.test?.metadata?.purpose,
          });

          if (unblockingResult.success && unblockingResult.unblockingPrompt) {
            logger.debug(
              `[GOAT] Sending unblocking response: ${unblockingResult.unblockingPrompt}`,
            );

            messages.push({ role: 'user', content: unblockingResult.unblockingPrompt });

            let unblockingTargetPrompt = this.config.stateful
              ? unblockingResult.unblockingPrompt
              : JSON.stringify(messages);

            // Apply per-turn transforms to unblocking prompt as well
            if (this.perTurnLayers.length > 0) {
              // Transform just the unblocking prompt content, not the full JSON
              const transformResult = await applyRuntimeTransforms(
                unblockingResult.unblockingPrompt,
                this.config.injectVar,
                this.perTurnLayers,
                Strategies,
              );
              if (transformResult.error) {
                logger.warn('[GOAT] Transform failed for unblocking prompt', {
                  error: transformResult.error,
                });
                continue; // Skip unblocking attempt
              }
              // For audio/image transforms, send the transformed content directly
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
          }
        }

        // Generate and send attack
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
            pluginId: context?.test?.metadata?.pluginId,
            strategyId: context?.test?.metadata?.strategyId,
            ...(context?.evaluationId && { evaluationId: context.evaluationId }),
            ...(context?.evaluationId &&
              context?.testCaseId && {
                testRunId: `${context.evaluationId}-${context.testCaseId}`,
              }),
          });
          logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
          response = await fetchWithProxy(
            getRemoteGenerationUrl(),
            {
              body,
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            },
            options?.abortSignal,
          );
          const data = (await response.json()) as ExtractAttackFailureResponse;

          if (!data.message) {
            logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data });
            continue;
          }
          failureReason = data.message;
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
          // Pass inputs schema for multi-input mode
          inputs: this.config.inputs,
          pluginId: context?.test?.metadata?.pluginId,
          strategyId: context?.test?.metadata?.strategyId,
          ...(context?.evaluationId && { evaluationId: context.evaluationId }),
          ...(context?.evaluationId &&
            context?.testCaseId && {
              testRunId: `${context.evaluationId}-${context.testCaseId}`,
            }),
        });

        logger.debug(`[GOAT] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
        response = await fetchWithProxy(
          getRemoteGenerationUrl(),
          {
            body,
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          },
          options?.abortSignal,
        );
        const data = await response.json();
        if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
          logger.info('[GOAT] Invalid message from GOAT, skipping turn', { data });
          continue;
        }
        const attackerMessage = data.message;

        previousAttackerMessage = attackerMessage?.content;

        // Extract JSON from <Prompt> tags if present (multi-input mode)
        let processedMessage = attackerMessage.content;
        const extractedPrompt = extractPromptFromTags(attackerMessage.content);
        if (extractedPrompt) {
          processedMessage = extractedPrompt;
        }

        // Extract input vars from the attack message for multi-input mode
        const currentInputVars = extractInputVarsFromPrompt(processedMessage, this.config.inputs);

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

        // Build target vars - handle multi-input mode
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
          [this.config.injectVar], // Skip template rendering for injection variable to prevent double-evaluation
        );

        messages.push({
          role: attackerMessage.role,
          content: renderedAttackerPrompt,
        });

        logger.debug(
          dedent`
          ${chalk.bold.green(`GOAT turn ${turn} history:`)}
          ${chalk.cyan(JSON.stringify(messages, null, 2))}
        `,
        );

        // Get the latest message content for transforms
        const latestMessageContent = messages[messages.length - 1].content;
        let targetPrompt = this.config.stateful ? latestMessageContent : JSON.stringify(messages);
        logger.debug(`GOAT turn ${turn} target prompt: ${renderedAttackerPrompt}`);

        // ═══════════════════════════════════════════════════════════════════════
        // Apply per-turn layer transforms if configured (e.g., audio, base64)
        // This enables: layer: { steps: [goat, audio] }
        // ═══════════════════════════════════════════════════════════════════════
        let lastTransformResult: TransformResult | undefined;
        if (this.perTurnLayers.length > 0) {
          logger.debug('[GOAT] Applying per-turn transforms', {
            turn,
            layers: this.perTurnLayers.map((l) => (typeof l === 'string' ? l : l.id)),
          });
          // Transform the actual message content, not the full targetPrompt (which may be JSON)
          // This ensures we convert just the text to audio, not the JSON structure
          lastTransformResult = await applyRuntimeTransforms(
            latestMessageContent,
            this.config.injectVar,
            this.perTurnLayers,
            Strategies,
          );

          // Skip turn if transform failed
          if (lastTransformResult.error) {
            logger.warn('[GOAT] Transform failed, skipping turn', {
              turn,
              error: lastTransformResult.error,
            });
            continue;
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
            logger.debug('[GOAT] Using hybrid format (history + audio/image current turn)', {
              turn,
              historyLength: historyWithoutCurrentTurn.length,
              hasAudio: !!lastTransformResult.audio,
              hasImage: !!lastTransformResult.image,
            });
          } else {
            // No audio/image, just use the transformed text
            targetPrompt = lastTransformResult.prompt;
          }

          logger.debug('[GOAT] Per-turn transforms applied', {
            turn,
            hasAudio: !!lastTransformResult.audio,
            hasImage: !!lastTransformResult.image,
          });
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

        let traceContext: TraceContextData | null = null;
        let computedTraceSummary: string | undefined;
        if (shouldFetchTrace) {
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

        if (targetResponse.sessionId) {
          context = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
          context.vars.sessionId = targetResponse.sessionId;
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
        const finalOutput = stringifiedOutput;
        const finalResponse = targetResponse;

        if (!stringifiedOutput) {
          logger.debug('[GOAT] Target response output is not a string or JSON', {
            response: targetResponse,
          });
          continue;
        }

        messages.push({
          role: 'assistant',
          content: stringifiedOutput,
        });

        // Store this turn in redteamHistory with audio/image data if present
        redteamHistory.push({
          prompt: attackerMessage.content,
          promptAudio: lastTransformResult?.audio,
          promptImage: lastTransformResult?.image,
          output: stringifiedOutput,
          outputAudio:
            targetResponse.audio?.data && targetResponse.audio?.format
              ? { data: targetResponse.audio.data, format: targetResponse.audio.format }
              : undefined,
          // Note: outputImage not tracked as ProviderResponse doesn't include image yet
          // Include input vars for multi-input mode (extracted from current prompt)
          inputVars: currentInputVars,
        });

        // Store the attack response for potential unblocking in next turn
        const attackTraceSummary = tracingOptions.includeInAttack
          ? computedTraceSummary
          : undefined;
        const gradingTraceSummary = tracingOptions.includeInGrading
          ? computedTraceSummary
          : undefined;

        previousTraceSummary = attackTraceSummary;
        previousTargetOutput = stringifiedOutput;

        lastTargetResponse = finalResponse;

        const grader = assertToUse ? getGraderById(assertToUse.type) : undefined;
        if (test && grader && finalOutput) {
          const { grade, rubric } = await grader.getResult(
            attackerMessage.content,
            finalOutput,
            test,
            targetProvider,
            assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
            additionalRubric,
            undefined,
            tracingOptions.includeInGrading
              ? {
                  traceContext: targetResponse.traceContext,
                  traceSummary: gradingTraceSummary,
                }
              : undefined,
          );
          graderPassed = grade.pass;
          storedGraderResult = {
            ...grade,
            assertion: grade.assertion
              ? { ...grade.assertion, value: rubric }
              : assertToUse && 'type' in assertToUse && assertToUse.type !== 'assert-set'
                ? { ...assertToUse, value: rubric }
                : undefined,
          };
        }

        if (graderPassed === false) {
          // Record successful attack
          this.successfulAttacks.push({
            turn,
            prompt: attackerMessage.content,
            response: stringifiedOutput,
            traceSummary: attackTraceSummary,
          });

          // Only break early if continueAfterSuccess is false
          if (this.config.continueAfterSuccess) {
            // Continue to next turn
          } else {
            break;
          }
        }
      } catch (error) {
        // Re-throw abort errors to properly cancel the operation
        if (error instanceof Error && error.name === 'AbortError') {
          logger.debug('[GOAT] Operation aborted');
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

    const finalPrompt = getLastMessageContent(messages, 'user') || '';
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        redteamFinalPrompt: finalPrompt,
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
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
