import chalk from 'chalk';
import dedent from 'dedent';
import type { Assertion, AssertionSet, AtomicTestCase } from 'src/types';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { sleep } from '../../util/time';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import type { Message } from './shared';
import { getLastMessageContent } from './shared';

export default class GoatProvider implements ApiProvider {
  private maxTurns: number;
  private readonly injectVar: string;
  private readonly stateless: boolean;

  id() {
    return 'promptfoo:redteam:goat';
  }

  constructor(
    options: ProviderOptions & {
      maxTurns?: number;
      injectVar?: string;
      stateless?: boolean;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`GOAT strategy requires remote grading to be enabled`);
    }
    logger.debug(
      `[GOAT] Constructor options: ${JSON.stringify({
        injectVar: options.injectVar,
        maxTurns: options.maxTurns,
        stateless: options.stateless,
      })}`,
    );
    if (options.stateless !== undefined) {
      telemetry.recordOnce('feature_used', {
        feature: 'stateless',
        state: String(options.stateless),
      });
    }
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.injectVar = options.injectVar;
    this.maxTurns = options.maxTurns || 5;
    this.stateless = options.stateless ?? true;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let response: Response | undefined = undefined;
    logger.debug(`[GOAT] callApi context: ${safeJsonStringify(context)}`);
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider | undefined = context?.originalProvider;
    invariant(targetProvider, 'Expected originalProvider to be set');

    const messages: Message[] = [];
    const totalTokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
      cached: 0,
    };

    let assertToUse: Assertion | AssertionSet | undefined;
    let graderPassed: boolean | undefined;
    const { getGraderById } = await import('../graders');
    let test: AtomicTestCase | undefined;

    if (context?.test) {
      test = context?.test;
      assertToUse = test?.assert?.find((a: { type: string }) => a.type);
    }

    for (let turn = 0; turn < this.maxTurns; turn++) {
      try {
        response = await fetch(getRemoteGenerationUrl(), {
          body: JSON.stringify({
            goal: context?.vars[this.injectVar],
            i: turn,
            messages,
            prompt: context?.prompt?.raw,
            task: 'goat',
            version: VERSION,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        const data = await response.json();
        if (typeof data?.message !== 'object' || !data.message?.content || !data.message?.role) {
          logger.debug(`[GOAT] Invalid message from GOAT, skipping turn: ${JSON.stringify(data)}`);
          continue;
        }
        const attackerMessage = data.message;

        const targetVars = {
          ...context.vars,
          [this.injectVar]: attackerMessage.content,
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

        if (data.tokenUsage) {
          totalTokenUsage.total += data.tokenUsage.total || 0;
          totalTokenUsage.prompt += data.tokenUsage.prompt || 0;
          totalTokenUsage.completion += data.tokenUsage.completion || 0;
          totalTokenUsage.cached += data.tokenUsage.cached || 0;
          totalTokenUsage.numRequests += data.tokenUsage.numRequests ?? 1;
        }
        logger.debug(
          dedent`
          ${chalk.bold.green(`GOAT turn ${turn} history:`)}
          ${chalk.cyan(JSON.stringify(messages, null, 2))}
        `,
        );

        const targetPrompt = this.stateless
          ? JSON.stringify(messages)
          : messages[messages.length - 1].content;

        logger.debug(`GOAT turn ${turn} target prompt: ${renderedAttackerPrompt}`);
        const targetResponse = await targetProvider.callApi(targetPrompt, context, options);

        if (!targetResponse.cached && targetProvider.delay && targetProvider.delay > 0) {
          logger.debug(`Sleeping for ${targetProvider.delay}ms`);
          await sleep(targetProvider.delay);
        }

        logger.debug(`GOAT turn ${turn} target response: ${safeJsonStringify(targetResponse)}`);

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

        if (!stringifiedOutput) {
          logger.debug(
            `[GOAT] Target response output is not a string or JSON: ${safeJsonStringify(targetResponse)}`,
          );
          continue;
        }

        messages.push({
          role: 'assistant',
          content: stringifiedOutput,
        });

        if (targetResponse.tokenUsage) {
          totalTokenUsage.total += targetResponse.tokenUsage.total || 0;
          totalTokenUsage.prompt += targetResponse.tokenUsage.prompt || 0;
          totalTokenUsage.completion += targetResponse.tokenUsage.completion || 0;
          totalTokenUsage.numRequests += targetResponse.tokenUsage.numRequests ?? 1;
          totalTokenUsage.cached += targetResponse.tokenUsage.cached || 0;
        } else {
          totalTokenUsage.numRequests += 1;
        }

        const grader = assertToUse ? getGraderById(assertToUse.type) : undefined;
        if (test && grader) {
          const { grade } = await grader.getResult(
            attackerMessage.content,
            stringifiedOutput,
            test,
            targetProvider,
            assertToUse && 'value' in assertToUse ? assertToUse.value : undefined,
          );
          graderPassed = grade.pass;
          if (grade.tokensUsed) {
            totalTokenUsage.total += grade.tokensUsed.total || 0;
            totalTokenUsage.prompt += grade.tokensUsed.prompt || 0;
            totalTokenUsage.completion += grade.tokensUsed.completion || 0;
            totalTokenUsage.cached += grade.tokensUsed.cached || 0;
          } else {
            totalTokenUsage.numRequests = (totalTokenUsage.numRequests || 0) + 1;
          }
        }

        if (graderPassed === false) {
          break;
        }
      } catch (err) {
        logger.error(`Error in GOAT turn ${turn}: ${err}`);
      }
    }
    delete context?.vars?.sessionId;

    return {
      output: getLastMessageContent(messages, 'assistant'),
      metadata: {
        redteamFinalPrompt: getLastMessageContent(messages, 'user'),
        messages: JSON.stringify(messages, null, 2),
        stopReason: graderPassed === false ? 'Grader failed' : 'Max turns reached',
      },
      tokenUsage: totalTokenUsage,
    };
  }
}
