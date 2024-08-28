import { z } from 'zod';
import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from '../../types';
import { fetchWithCache } from '../../cache';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import logger from '../../logger';

const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

type RedTeamTask = 'purpose' | 'entities';

export class RedTeamGenerationProvider implements ApiProvider {
  private url: string;
  private task: RedTeamTask;

  constructor(options: ProviderOptions & { task: RedTeamTask }) {
    this.url = 'https://us-central1-promptfoo.cloudfunctions.net/generate';
    this.task = options.task;
  }

  id(): string {
    return `promptfoo:redteam:generation:${this.task}`;
  }

  toString(): string {
    return `[Red Team Generation Provider (${this.task}) ${this.url}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const prompts = context?.vars?.prompts as string[] | undefined;
    
    if (!prompts || !Array.isArray(prompts)) {
      return { error: 'Prompts array is required in the context vars' };
    }

    const body = {
      task: this.task,
      prompts: prompts,
    };

    logger.warn(`Calling Red Team Generation provider: ${this.url} with body: ${JSON.stringify(body)}`);

    try {
      const response = await fetchWithCache(
        this.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json'
      );
      logger.warn(`Red Team Generation response: ${JSON.stringify(response.data)}`);

      const parsedResponse = RedTeamGenerationResponse.parse(response.data);
      return { output: parsedResponse.result };
    } catch (err) {
      return { error: `Red Team Generation API call error: ${String(err)}` };
    }
  }
}

export function createRedTeamGenerationProvider(options: ProviderOptions & { task: RedTeamTask }): ApiProvider {
  return new RedTeamGenerationProvider(options);
}
