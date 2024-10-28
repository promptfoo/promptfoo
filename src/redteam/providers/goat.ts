import logger from '../../logger';
import { HttpProvider } from '../../providers/http';
import type { ApiProvider, ProviderOptions } from '../../types/providers';
import { REMOTE_GENERATION_URL } from '../constants';
import { neverGenerateRemote } from '../util';

export default class GoatProvider implements ApiProvider {
  private httpProvider: HttpProvider;

  constructor(options: ProviderOptions = {}) {
    if (neverGenerateRemote()) {
      throw new Error(`GOAT strategy requires remote grading to be enabled`);
    }
    logger.warn(`REMOTE_GENERATION_URL: ${REMOTE_GENERATION_URL}`);
    this.httpProvider = new HttpProvider(REMOTE_GENERATION_URL, {
      ...options,
      config: {
        ...options.config,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          task: 'goat',
          prompt: '{{ prompt }}',
          goal: '{{ goal }}',
          history: '{{ history }}',
          instructions: '{{ instructions }}',
        },
      },
    });
  }

  id() {
    return 'promptfoo:redteam:goat';
  }

  async callApi(prompt: string, context?: any, options?: any) {
    return this.httpProvider.callApi(prompt, {
      ...context,
      vars: {
        ...context?.vars,
        prompt,
        goal: 'goal',
        history: 'history',
        instructions: 'instructions',
      },
    });
  }
}
