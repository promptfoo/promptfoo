import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import { getSessionId } from '../util';
import { getGoalRubric } from './prompts';
import { getLastMessageContent } from './shared';

import type { Assertion, AssertionSet, AtomicTestCase, GradingResult } from '../../types/index';
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
  [key: string]: unknown;
}

export default class RedteamOdcvProvider implements ApiProvider {
  readonly config: OdcvConfig;
  private readonly nunjucks: any;

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
    };
    this.nunjucks = getNunjucksEngine();
    logger.debug('[ODCV] Constructor options', {
      injectVar: options.injectVar,
      maxTurns: options.maxTurns,
      variant: this.config.variant,
      stateful: options.stateful,
    });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<OdcvResponse> {
    let response: Response | undefined = undefined;
    logger.debug('[ODCV] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

    const messages: Message[] = [];
    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();

    const redteamHistory: Array<{
      prompt: string;
      output: string;
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
      if (!assertToUse) {
        assertToUse = test?.assert?.find((a: { type: string }) => a.type);
      }
    }

    const userGoal = context?.test?.metadata?.goal || context?.vars[this.config.injectVar];
    const additionalRubric = getGoalRubric(userGoal);

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        const body = JSON.stringify({
          goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
          i: turn,
          messages,
          task: 'odcv',
          version: VERSION,
          email: getUserEmail(),
          purpose: context?.test?.metadata?.purpose,
          variant: this.config.variant,
          inputs: this.config.inputs,
        });

        logger.debug(`[ODCV] Sending request to ${getRemoteGenerationUrl()}: ${body}`);
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
          logger.info('[ODCV] Invalid message from ODCV, skipping turn', { data });
          continue;
        }
        const attackerMessage = data.message;

        const renderedAttackerPrompt = await renderPrompt(
          context.prompt,
          {
            ...context.vars,
            [this.config.injectVar]: attackerMessage.content,
          },
          context.filters,
          targetProvider,
          [this.config.injectVar],
        );

        messages.push({
          role: attackerMessage.role,
          content: renderedAttackerPrompt,
        });

        logger.debug(
          dedent`
          ${chalk.bold.green(`ODCV turn ${turn} history:`)}
          ${chalk.cyan(JSON.stringify(messages, null, 2))}
        `,
        );

        const targetPrompt = this.config.stateful
          ? messages[messages.length - 1].content
          : JSON.stringify(messages);

        const targetResponse = await targetProvider.callApi(targetPrompt, context, options);

        if (!targetResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
          logger.debug(`Sleeping for ${targetProvider.delay}ms`);
          await sleep(targetProvider.delay);
        }
        accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

        logger.debug(`ODCV turn ${turn} target response`, { response: targetResponse });

        if (targetResponse.sessionId) {
          context = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
          context.vars.sessionId = targetResponse.sessionId;
        }
        if (targetResponse.error) {
          throw new Error(`[ODCV] Target returned an error: ${targetResponse.error}`);
        }
        invariant(
          targetResponse.output,
          `[ODCV] Expected target response output to be set, but got: ${safeJsonStringify(targetResponse)}`,
        );

        const stringifiedOutput =
          typeof targetResponse.output === 'string'
            ? targetResponse.output
            : safeJsonStringify(targetResponse.output);
        const finalOutput = stringifiedOutput;

        if (!stringifiedOutput) {
          logger.debug('[ODCV] Target response output is not a string or JSON', {
            response: targetResponse,
          });
          continue;
        }

        messages.push({
          role: 'assistant',
          content: stringifiedOutput,
        });

        redteamHistory.push({
          prompt: attackerMessage.content,
          output: stringifiedOutput,
        });

        lastTargetResponse = targetResponse;

        const grader = assertToUse ? getGraderById(assertToUse.type) : undefined;
        if (test && grader && finalOutput) {
          const { grade, rubric } = await grader.getResult(
            attackerMessage.content,
            finalOutput,
            test,
            targetProvider,
            assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
            additionalRubric,
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
          break;
        }
      } catch (error) {
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
    }

    const finalPrompt = getLastMessageContent(messages, 'user') || '';
    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      prompt: finalPrompt,
      metadata: {
        redteamFinalPrompt: finalPrompt,
        messages: messages as Record<string, any>[],
        stopReason: graderPassed === false ? 'Grader failed' : 'Max turns reached',
        redteamHistory,
        storedGraderResult,
        sessionId: getSessionId(lastTargetResponse, context),
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
