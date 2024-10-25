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
    this.httpProvider = new HttpProvider(REMOTE_GENERATION_URL, {
      ...options,
      config: {
        ...options.config,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        transformPayload: (input: string) => ({
          task: 'goat',
          input,
        }),
        transformResponse: (response: {
          result: { reason: string; score: number; pass: boolean; tokensUsed?: number };
        }) => ({
          output: response.result.reason,
          score: response.result.score,
          pass: response.result.pass,
          tokensUsed: response.result.tokensUsed,
        }),
      },
    });
  }

  id() {
    return 'promptfoo:redteam:goat';
  }

  async callApi(prompt: string, context?: any, options?: any) {
    return this.httpProvider.callApi(prompt, context);
  }
}
