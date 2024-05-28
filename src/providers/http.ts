import invariant from 'tiny-invariant';

import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS } from './shared';
import { getNunjucksEngine } from '../util';

import type { ApiProvider, ProviderResponse } from '../types.js';

export class HttpProvider implements ApiProvider {
  url: string;
  config: any;
  responseParser: (data: any) => ProviderResponse;

  constructor(url: string, config: any) {
    this.url = url;
    this.config = config;
    this.responseParser = createResponseParser(config.responseParser);
  }

  id(): string {
    return this.url;
  }

  toString(): string {
    return `[HTTP Provider ${this.url}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    // Render all nested strings
    const nunjucks = getNunjucksEngine();
    const renderedConfig: { method: string; headers: Record<string, string>; body: any } =
      JSON.parse(nunjucks.renderString(JSON.stringify(this.config), { prompt }));

    const method = renderedConfig.method || 'POST';
    const headers = renderedConfig.headers || { 'Content-Type': 'application/json' };
    invariant(typeof method === 'string', 'Expected method to be a string');
    invariant(typeof headers === 'object', 'Expected headers to be an object');

    logger.debug(
      `Calling HTTP provider: ${this.url} with config: ${JSON.stringify(renderedConfig)}`,
    );
    let response;
    try {
      response = await fetchWithCache(
        this.url,
        {
          method,
          headers,
          body: JSON.stringify(renderedConfig.body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );
    } catch (err) {
      return {
        error: `HTTP call error: ${String(err)}`,
      };
    }
    logger.debug(`\tHTTP response: ${JSON.stringify(response.data)}`);

    return this.responseParser(response.data);
  }
}

function createResponseParser(parser: any): (data: any) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('json', `return ${parser}`) as (data: any) => ProviderResponse;
  }
  return (data) => ({ output: data });
}
