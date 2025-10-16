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
import { getGoalRubric } from './prompts';
import { getLastMessageContent, messagesToRedteamHistory } from './shared';

import type { Assertion, AssertionSet, AtomicTestCase, GradingResult } from '../../types';
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
 * Represents metadata for the Authoritative Markup Injection conversation process.
 */
interface AuthoritativeMarkupInjectionMetadata extends BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  stopReason: 'Grader failed' | 'Max turns reached';
  successfulAttacks?: Array<{
    turn: number;
    prompt: string;
    response: string;
  }>;
  totalSuccessfulAttacks?: number;
  storedGraderResult?: GradingResult;
}

/**
 * Represents the complete response from an Authoritative Markup Injection conversation.
 */
interface AuthoritativeMarkupInjectionResponse extends ProviderResponse {
  metadata: AuthoritativeMarkupInjectionMetadata;
}

interface AuthoritativeMarkupInjectionConfig {
  injectVar: string;
  maxTurns: number;
  stateful: boolean;
  continueAfterSuccess: boolean;
}

export default class AuthoritativeMarkupInjectionProvider implements ApiProvider {
  readonly config: AuthoritativeMarkupInjectionConfig;
  private readonly nunjucks: any;
  private successfulAttacks: Array<{
    turn: number;
    prompt: string;
    response: string;
  }> = [];

  id() {
    return 'promptfoo:redteam:authoritative-markup-injection';
  }

  constructor(
    options: ProviderOptions & {
      maxTurns?: number;
      injectVar?: string;
      stateful?: boolean;
      continueAfterSuccess?: boolean;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(
        `Authoritative Markup Injection strategy requires remote grading to be enabled`,
      );
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      maxTurns: options.maxTurns || 5,
      injectVar: options.injectVar,
      stateful: options.stateful ?? false,
      continueAfterSuccess: options.continueAfterSuccess ?? false,
    };
    this.nunjucks = getNunjucksEngine();
    logger.debug('[AuthoritativeMarkupInjection] Constructor options', {
      injectVar: options.injectVar,
      maxTurns: options.maxTurns,
      stateful: options.stateful,
      continueAfterSuccess: options.continueAfterSuccess,
    });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<AuthoritativeMarkupInjectionResponse> {
    // Reset successful attacks array for each new call
    this.successfulAttacks = [];

    let response: Response | undefined = undefined;
    logger.debug('[AuthoritativeMarkupInjection] callApi context', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

    const messages: Message[] = [];
    const totalTokenUsage: TokenUsage = createEmptyTokenUsage();

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

    // Generate goal-specific evaluation rubric
    const userGoal = context?.test?.metadata?.goal || context?.vars[this.config.injectVar];
    const additionalRubric = getGoalRubric(userGoal);

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      try {
        // Generate attack with authoritative markup injection
        let failureReason: string | undefined;
        if (turn > 0 && storedGraderResult && storedGraderResult.reason) {
          failureReason = storedGraderResult.reason;
        }

        const body = JSON.stringify({
          goal: context?.test?.metadata?.goal || context?.vars[this.config.injectVar],
          i: turn,
          messages,
          prompt: context?.prompt?.raw,
          task: 'authoritative-markup-injection',
          version: VERSION,
          email: getUserEmail(),
          failureReason,
          purpose: context?.test?.metadata?.purpose,
        });

        logger.debug(
          `[AuthoritativeMarkupInjection] Sending request to ${getRemoteGenerationUrl()}: ${body}`,
        );
        response = await fetchWithProxy(getRemoteGenerationUrl(), {
          body,
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        const data = await response.json();
        if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
          logger.info('[AuthoritativeMarkupInjection] Invalid message, skipping turn', { data });
          continue;
        }
        const attackerMessage = data.message;

        previousAttackerMessage = attackerMessage?.content;

        const targetVars = {
          ...context.vars,
          [this.config.injectVar]: attackerMessage.content,
        };

        const renderedAttackerPrompt = await renderPrompt(
          context.prompt,
          targetVars,
          context.filters,
          targetProvider,
        );

        messages.push({
          role: attackerMessage.role,
          content: renderedAttackerPrompt,
        });

        logger.debug(
          dedent`
          ${chalk.bold.green(`Authoritative Markup Injection turn ${turn} history:`)}
          ${chalk.cyan(JSON.stringify(messages, null, 2))}
        `,
        );

        const targetPrompt = this.config.stateful
          ? messages[messages.length - 1].content
          : JSON.stringify(messages);
        logger.debug(
          `Authoritative Markup Injection turn ${turn} target prompt: ${renderedAttackerPrompt}`,
        );
        const targetResponse = await targetProvider.callApi(targetPrompt, context, options);

        if (!targetResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
          logger.debug(`Sleeping for ${targetProvider.delay}ms`);
          await sleep(targetProvider.delay);
        }
        accumulateResponseTokenUsage(totalTokenUsage, targetResponse);

        logger.debug(`Authoritative Markup Injection turn ${turn} target response`, {
          response: targetResponse,
        });

        if (targetResponse.sessionId) {
          context = context ?? { vars: {}, prompt: { raw: '', label: 'target' } };
          context.vars.sessionId = targetResponse.sessionId;
        }
        if (targetResponse.error) {
          throw new Error(
            `[AuthoritativeMarkupInjection] Target returned an error: ${targetResponse.error}`,
          );
        }
        invariant(
          targetResponse.output,
          `[AuthoritativeMarkupInjection] Expected target response output to be set, but got: ${safeJsonStringify(targetResponse)}`,
        );

        const stringifiedOutput =
          typeof targetResponse.output === 'string'
            ? targetResponse.output
            : safeJsonStringify(targetResponse.output);
        const finalOutput = stringifiedOutput;
        const finalResponse = targetResponse;

        if (!stringifiedOutput) {
          logger.debug('[AuthoritativeMarkupInjection] Target response output is not a string', {
            response: targetResponse,
          });
          continue;
        }

        messages.push({
          role: 'assistant',
          content: stringifiedOutput,
        });

        lastTargetResponse = finalResponse;

        const grader = assertToUse ? getGraderById(assertToUse.type) : undefined;
        if (test && grader && finalOutput) {
          const { grade } = await grader.getResult(
            attackerMessage.content,
            finalOutput,
            test,
            targetProvider,
            assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
            additionalRubric,
          );
          graderPassed = grade.pass;
          storedGraderResult = grade;
        }

        if (graderPassed === false) {
          // Record successful attack
          this.successfulAttacks.push({
            turn,
            prompt: attackerMessage.content,
            response: stringifiedOutput,
          });

          // Only break early if continueAfterSuccess is false
          if (this.config.continueAfterSuccess) {
            // Continue to next turn
          } else {
            break;
          }
        }
      } catch (err) {
        logger.error(`Error in Authoritative Markup Injection turn ${turn}: ${err}`);
      }
    }

    return {
      output: getLastMessageContent(messages, 'assistant') || '',
      metadata: {
        redteamFinalPrompt: getLastMessageContent(messages, 'user') || '',
        messages: messages as Record<string, any>[],
        stopReason:
          this.successfulAttacks.length > 0 && !this.config.continueAfterSuccess
            ? 'Grader failed'
            : 'Max turns reached',
        redteamHistory: messagesToRedteamHistory(messages),
        successfulAttacks: this.successfulAttacks,
        totalSuccessfulAttacks: this.successfulAttacks.length,
        storedGraderResult,
      },
      tokenUsage: totalTokenUsage,
      guardrails: lastTargetResponse?.guardrails,
    };
  }
}
