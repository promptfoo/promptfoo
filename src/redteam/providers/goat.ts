import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import logger from '../../logger';
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

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const getLastMessageContent = (messages: Message[], role: Message['role']): string | undefined =>
  messages.filter((m) => m?.role === role).slice(-1)[0]?.content;

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
        messages.push(data.message);
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

        const targetVars = {
          ...context.vars,
          [this.injectVar]: messages[messages.length - 1].content,
        };

        const targetPrompt = this.stateless
          ? JSON.stringify(messages)
          : await renderPrompt(context.prompt, targetVars, context.filters, targetProvider);

        logger.debug(`GOAT turn ${turn} target prompt: ${targetPrompt}`);
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
      },
      tokenUsage: totalTokenUsage,
    };
  }
}
