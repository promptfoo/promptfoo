import { getBearerTokenProvider, type TokenCredential } from '@azure/identity';
import { createRestError, getClient } from '@azure-rest/core-client';
import OpenAI from 'openai';
import { z } from 'zod';
import type { PathUncheckedResponse } from '@azure-rest/core-client';

const scope = 'https://ai.azure.com/.default';

const nonblankString = z.string().regex(/\S/);
const FoundryAgentSchema = z.looseObject({ id: nonblankString, name: nonblankString });
export type FoundryAgent = z.infer<typeof FoundryAgentSchema>;

function readBody<T>(response: PathUncheckedResponse): T {
  if (response.status !== '200') {
    const error = createRestError(response);
    error.details = response.body;
    throw error;
  }
  return response.body;
}

/** Project agent discovery and the project-scoped OpenAI Responses endpoint. */
export class FoundryProjectClient {
  private readonly rest;

  constructor(
    private readonly endpoint: string,
    private readonly credential: TokenCredential,
  ) {
    this.rest = getClient(endpoint, credential, { credentials: { scopes: [scope] } });
  }

  async getAgent(name: string): Promise<FoundryAgent> {
    if (name === '.' || name === '..') {
      throw new Error('Invalid Foundry agent name');
    }
    const response = await this.rest.path('/agents/{name}', name).get({
      queryParameters: { 'api-version': 'v1' },
    });
    return FoundryAgentSchema.parse(readBody(response));
  }

  async *listAgents(): AsyncGenerator<FoundryAgent> {
    let after: string | undefined;
    do {
      const response = await this.rest.path('/agents').get({
        queryParameters: { 'api-version': 'v1', after },
      });
      const page = readBody<{ data: unknown[]; last_id?: string; has_more?: boolean }>(response);
      for (const agent of page.data) {
        yield FoundryAgentSchema.parse(agent);
      }
      after = page.has_more ? page.last_id : undefined;
    } while (after);
  }

  getOpenAIClient(): OpenAI {
    return new OpenAI({
      baseURL: `${this.endpoint.replace(/\/$/, '')}/openai/v1`,
      apiKey: getBearerTokenProvider(this.credential, scope),
      defaultHeaders: { 'User-Agent': 'AIProjectClient OpenAI/JS' },
    });
  }
}
