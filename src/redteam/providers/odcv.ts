import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
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
import { getSessionId } from '../util';
import { getGoalRubric } from './prompts';
import { getLastMessageContent } from './shared';

import type {
  Assertion,
  AssertionSet,
  AssertionValue,
  AtomicTestCase,
  GradingResult,
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

interface OdcvMetadata extends BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  stopReason: 'Grader failed' | 'Max turns reached';
  storedGraderResult?: GradingResult;
}

interface OdcvResponse extends ProviderResponse {
  metadata: OdcvMetadata;
}

interface OdcvConfig {
  injectVar: string;
  maxTurns: number;
  variant: 'incentivized' | 'mandated';
  stateful: boolean;
  inputs?: Record<string, string>;
  _perTurnLayers?: LayerConfig[];
  [key: string]: unknown;
}

interface OdcvHistoryItem {
  prompt: string;
  promptAudio?: MediaData;
  promptImage?: MediaData;
  output: string;
  outputAudio?: MediaData;
  outputImage?: MediaData;
}

interface OdcvAttackerMessage {
  role: Message['role'];
  content: string;
}

interface OdcvState {
  targetProvider: ApiProvider;
  targetContext: CallApiContextParams;
  messages: Message[];
  totalTokenUsage: TokenUsage;
  redteamHistory: OdcvHistoryItem[];
  test?: AtomicTestCase;
  assertToUse?: Assertion | AssertionSet;
  additionalRubric: string;
}

interface TargetPromptResult {
  prompt: string;
  transformResult?: TransformResult;
  skip?: boolean;
}

interface TargetCallResult {
  response: ProviderResponse;
  output: string;
}

interface TurnResult {
  lastTargetResponse?: ProviderResponse;
  graderPassed?: boolean;
  storedGraderResult?: GradingResult;
}

export default class RedteamOdcvProvider implements ApiProvider {
  readonly config: OdcvConfig;
  private readonly perTurnLayers: LayerConfig[];

  id() {
    return 'promptfoo:redteam:odcv';
  }

  constructor(
    options: ProviderOptions & {
      maxTurns?: number;
      injectVar?: string;
      variant?: 'incentivized' | 'mandated';
      stateful?: boolean;
      inputs?: Record<string, string>;
      _perTurnLayers?: LayerConfig[];
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`ODCV strategy requires remote grading to be enabled`);
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      maxTurns: options.maxTurns || 5,
      injectVar: options.injectVar,
      variant: options.variant || 'incentivized',
      stateful: options.stateful ?? false,
      inputs: options.inputs,
      _perTurnLayers: options._perTurnLayers,
    };
    this.perTurnLayers = options._perTurnLayers ?? [];
    const perTurnLayerIds = this.perTurnLayers.map((layer) =>
      typeof layer === 'string' ? layer : layer.id,
    );
    logger.debug('[ODCV] Constructor options', {
      injectVar: options.injectVar,
      maxTurns: options.maxTurns,
      variant: this.config.variant,
      stateful: options.stateful,
      perTurnLayers: perTurnLayerIds,
    });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<OdcvResponse> {
    logger.debug('[ODCV] callApi context', { context });
    const state = this.createState(context);
    let lastTargetResponse: ProviderResponse | undefined = undefined;
    let graderPassed: boolean | undefined;
    let storedGraderResult: GradingResult | undefined;

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        const result = await this.runTurn(turn, state, options);
        lastTargetResponse = result.lastTargetResponse ?? lastTargetResponse;
        graderPassed = result.graderPassed ?? graderPassed;
        storedGraderResult = result.storedGraderResult ?? storedGraderResult;

        if (graderPassed === false) {
          break;
        }
      } catch (error) {
        this.handleTurnError(error, turn);
      }
    }

    return this.createResponse(state, lastTargetResponse, graderPassed, storedGraderResult);
  }

  private createState(context?: CallApiContextParams): OdcvState {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetContext: CallApiContextParams = {
      ...context,
      vars: { ...context.vars },
    };
    const test = targetContext.test;
    const assertToUse = this.getAssertionForTest(test);
    const userGoal =
      targetContext.test?.metadata?.goal || targetContext.vars[this.config.injectVar];

    return {
      targetProvider: context.originalProvider,
      targetContext,
      messages: [],
      totalTokenUsage: createEmptyTokenUsage(),
      redteamHistory: [],
      test,
      assertToUse,
      additionalRubric: getGoalRubric(userGoal),
    };
  }

  private getAssertionForTest(test?: AtomicTestCase): Assertion | AssertionSet | undefined {
    return (
      test?.assert?.find(
        (assertion) => assertion.type && assertion.type.includes(test.metadata?.pluginId),
      ) ?? test?.assert?.find((assertion) => assertion.type)
    );
  }

  private async runTurn(
    turn: number,
    state: OdcvState,
    options?: CallApiOptionsParams,
  ): Promise<TurnResult> {
    const attackerMessage = await this.fetchAttackerMessage(turn, state, options);
    if (!attackerMessage) {
      return {};
    }

    await this.addRenderedAttackerMessage(attackerMessage, state);
    this.logHistory(turn, state.messages);

    const latestMessageContent = state.messages[state.messages.length - 1].content;
    const targetPrompt = await this.getTargetPrompt(turn, latestMessageContent, state);
    if (targetPrompt.skip) {
      return {};
    }

    const targetCall = await this.callTarget(targetPrompt.prompt, state, options);
    if (!targetCall) {
      return {};
    }

    state.messages.push({
      role: 'assistant',
      content: targetCall.output,
    });
    this.addHistoryItem(attackerMessage, targetPrompt.transformResult, targetCall, state);

    const grading = await this.gradeTurn(attackerMessage.content, targetCall.output, state);
    return {
      lastTargetResponse: targetCall.response,
      ...grading,
    };
  }

  private async fetchAttackerMessage(
    turn: number,
    state: OdcvState,
    options?: CallApiOptionsParams,
  ): Promise<OdcvAttackerMessage | undefined> {
    const body = this.buildTaskBody(turn, state);
    logger.debug(`[ODCV] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
    const response = await fetchWithProxy(
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
    if (!response.ok) {
      throw new Error(`ODCV task failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (!this.isAttackerMessage(data?.message)) {
      logger.info('[ODCV] Invalid message from ODCV, skipping turn', { data });
      return undefined;
    }
    return data.message;
  }

  private buildTaskBody(turn: number, state: OdcvState): string {
    const goal =
      state.targetContext.test?.metadata?.goal || state.targetContext.vars?.[this.config.injectVar];
    return JSON.stringify({
      goal,
      i: turn,
      messages: state.messages,
      task: 'odcv',
      version: VERSION,
      email: getUserEmail(),
      purpose: state.targetContext.test?.metadata?.purpose,
      variant: this.config.variant,
      inputs: this.config.inputs,
    });
  }

  private isAttackerMessage(message: unknown): message is OdcvAttackerMessage {
    const role = (message as OdcvAttackerMessage | undefined)?.role;
    return (
      typeof message === 'object' &&
      message !== null &&
      typeof (message as OdcvAttackerMessage).content === 'string' &&
      ['assistant', 'developer', 'system', 'user'].includes(String(role))
    );
  }

  private async addRenderedAttackerMessage(
    attackerMessage: OdcvAttackerMessage,
    state: OdcvState,
  ): Promise<void> {
    const renderedAttackerPrompt = await renderPrompt(
      state.targetContext.prompt,
      {
        ...state.targetContext.vars,
        [this.config.injectVar]: attackerMessage.content,
      },
      state.targetContext.filters,
      state.targetProvider,
      [this.config.injectVar],
    );

    state.messages.push({
      role: attackerMessage.role,
      content: renderedAttackerPrompt,
    });
  }

  private logHistory(turn: number, messages: Message[]): void {
    logger.debug(
      dedent`
      ${chalk.bold.green(`ODCV turn ${turn} history:`)}
      ${chalk.cyan(JSON.stringify(messages, null, 2))}
    `,
    );
  }

  private async getTargetPrompt(
    turn: number,
    latestMessageContent: string,
    state: OdcvState,
  ): Promise<TargetPromptResult> {
    const prompt = this.config.stateful ? latestMessageContent : JSON.stringify(state.messages);
    if (this.perTurnLayers.length === 0) {
      return { prompt };
    }

    const transformResult = await this.applyPerTurnTransforms(latestMessageContent, state);
    if (transformResult.error) {
      logger.warn('[ODCV] Transform failed, skipping turn', {
        turn,
        error: transformResult.error,
      });
      return { prompt, transformResult, skip: true };
    }

    if (transformResult.audio || transformResult.image) {
      return {
        prompt: this.buildHybridPrompt(state.messages, latestMessageContent, transformResult),
        transformResult,
      };
    }

    return { prompt: transformResult.prompt, transformResult };
  }

  private async applyPerTurnTransforms(
    latestMessageContent: string,
    state: OdcvState,
  ): Promise<TransformResult> {
    return applyRuntimeTransforms(
      latestMessageContent,
      this.config.injectVar,
      this.perTurnLayers,
      Strategies,
      {
        evaluationId: state.targetContext.evaluationId,
        testCaseId: state.targetContext.test?.metadata?.testCaseId as string | undefined,
        purpose: state.targetContext.test?.metadata?.purpose as string | undefined,
        goal: state.targetContext.test?.metadata?.goal as string | undefined,
      },
    );
  }

  private buildHybridPrompt(
    messages: Message[],
    latestMessageContent: string,
    transformResult: TransformResult,
  ): string {
    return JSON.stringify({
      _promptfoo_audio_hybrid: true,
      history: messages.slice(0, -1),
      currentTurn: {
        role: 'user' as const,
        transcript: latestMessageContent,
        ...(transformResult.audio && {
          audio: transformResult.audio,
        }),
        ...(transformResult.image && {
          image: transformResult.image,
        }),
      },
    });
  }

  private async callTarget(
    targetPrompt: string,
    state: OdcvState,
    options?: CallApiOptionsParams,
  ): Promise<TargetCallResult | undefined> {
    const response = await state.targetProvider.callApi(targetPrompt, state.targetContext, options);
    await this.applyTargetDelay(response, state.targetProvider);
    accumulateResponseTokenUsage(state.totalTokenUsage, response);

    logger.debug('ODCV turn target response', { response });
    this.updateSession(response, state.targetContext);

    if (response.error) {
      throw new Error(`[ODCV] Target returned an error: ${response.error}`);
    }
    invariant(
      response.output,
      `[ODCV] Expected target response output to be set, but got: ${safeJsonStringify(response)}`,
    );

    const output =
      typeof response.output === 'string' ? response.output : safeJsonStringify(response.output);
    if (!output) {
      logger.debug('[ODCV] Target response output is not a string or JSON', { response });
      return undefined;
    }

    return { response, output };
  }

  private async applyTargetDelay(response: ProviderResponse, targetProvider: ApiProvider) {
    if (!response.cached && targetProvider.delay && targetProvider.delay > 0) {
      logger.debug(`Sleeping for ${targetProvider.delay}ms`);
      await sleep(targetProvider.delay);
    }
  }

  private updateSession(response: ProviderResponse, targetContext: CallApiContextParams): void {
    if (response.sessionId && targetContext.vars) {
      targetContext.vars.sessionId = response.sessionId;
    }
  }

  private addHistoryItem(
    attackerMessage: OdcvAttackerMessage,
    transformResult: TransformResult | undefined,
    targetCall: TargetCallResult,
    state: OdcvState,
  ): void {
    state.redteamHistory.push({
      prompt: attackerMessage.content,
      promptAudio: transformResult?.audio,
      promptImage: transformResult?.image,
      output: targetCall.output,
      outputAudio:
        targetCall.response.audio?.data && targetCall.response.audio?.format
          ? {
              data: targetCall.response.audio.data,
              format: targetCall.response.audio.format,
            }
          : undefined,
    });
  }

  private async gradeTurn(
    attackerContent: string,
    output: string,
    state: OdcvState,
  ): Promise<Pick<TurnResult, 'graderPassed' | 'storedGraderResult'>> {
    const { getGraderById } = await import('../graders');
    const grader = state.assertToUse ? getGraderById(state.assertToUse.type) : undefined;
    if (!state.test || !grader) {
      return {};
    }

    const { grade, rubric } = await grader.getResult(
      attackerContent,
      output,
      state.test,
      state.targetProvider,
      state.assertToUse && 'value' in state.assertToUse ? state.assertToUse.value : undefined,
      state.additionalRubric,
    );

    return {
      graderPassed: grade.pass,
      storedGraderResult: {
        ...grade,
        assertion: this.getStoredAssertion(grade, rubric, state.assertToUse),
      },
    };
  }

  private getStoredAssertion(
    grade: GradingResult,
    rubric: AssertionValue | undefined,
    assertToUse?: Assertion | AssertionSet,
  ): GradingResult['assertion'] {
    if (grade.assertion) {
      return { ...grade.assertion, value: rubric };
    }
    if (assertToUse && 'type' in assertToUse && assertToUse.type !== 'assert-set') {
      return { ...assertToUse, value: rubric };
    }
    return undefined;
  }

  private handleTurnError(error: unknown, turn: number): void {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug('[ODCV] Operation aborted');
      throw error;
    }
    logger.error(
      `[ODCV] An error occurred in ODCV turn ${turn}. The test will continue to the next turn.`,
      {
        error: (error as Error).message || error,
      },
    );
  }

  private createResponse(
    state: OdcvState,
    lastTargetResponse?: ProviderResponse,
    graderPassed?: boolean,
    storedGraderResult?: GradingResult,
  ): OdcvResponse {
    const finalPrompt = getLastMessageContent(state.messages, 'user') || '';
    return {
      output: getLastMessageContent(state.messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        redteamFinalPrompt: finalPrompt,
        messages: state.messages as Record<string, any>[],
        stopReason: graderPassed === false ? 'Grader failed' : 'Max turns reached',
        redteamHistory: state.redteamHistory,
        storedGraderResult,
        sessionId: getSessionId(lastTargetResponse, state.targetContext),
      },
      tokenUsage: state.totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
