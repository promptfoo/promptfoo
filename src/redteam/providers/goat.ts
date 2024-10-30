import chalk from 'chalk';
import invariant from 'tiny-invariant';
import logger from '../../logger';
import { HttpProvider } from '../../providers/http';
import type { Assertion } from '../../types';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import { REMOTE_GENERATION_URL } from '../constants';
import { neverGenerateRemote } from '../util';

export default class GoatProvider implements ApiProvider {
  private redteamProvider: HttpProvider;
  private targetProvider: ApiProvider | undefined;
  private maxTurns: number;
  private readonly injectVar: string;

  id() {
    return 'promptfoo:redteam:goat';
  }

  constructor(options: ProviderOptions & { maxTurns?: number; injectVar?: string } = {}) {
    if (neverGenerateRemote()) {
      throw new Error(`GOAT strategy requires remote grading to be enabled`);
    }
    logger.warn(`REMOTE_GENERATION_URL: ${REMOTE_GENERATION_URL}`);
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.injectVar = options.injectVar;
    logger.warn(`injectVar: ${this.injectVar}`);
    this.maxTurns = options.maxTurns || 2;
    this.redteamProvider = new HttpProvider(REMOTE_GENERATION_URL, {
      ...options,
      config: {
        ...options.config,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{{ body }}',
      },
    });
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let response: ProviderResponse | undefined = undefined;

    this.targetProvider = context?.originalProvider;
    invariant(this.targetProvider, 'Expected originalProvider to be set');

    logger.warn(`Starting GOAT attack with goal:\n${prompt}`);
    logger.warn(chalk.blue(`raw prompt:\n${context?.prompt?.raw}`));
    logger.warn(`vars:\n${JSON.stringify(context?.vars, null, 2)}`);

    for (let turn = 0; turn < this.maxTurns; turn++) {
      response = await this.redteamProvider.callApi(prompt, {
        ...context,
        prompt: context?.prompt || { raw: prompt, label: 'prompt' },
        vars: {
          ...context?.vars,
          prompt,
          goal: 'goal',
          history: 'history',
          instructions: 'instructions',
        },
      });
    }
    invariant(response, 'No response from the original provider');
    return response;
  }
}
