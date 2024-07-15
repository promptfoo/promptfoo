import invariant from 'tiny-invariant';
import { fetchWithCache } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types.js';
import { safeJsonStringify } from '../util';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

function createResponseParser(parser: any): (data: any) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('json', `return ${parser}`) as (data: any) => ProviderResponse;
  }
  return (data) => ({ output: data });
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: any;
  responseParser: (data: any) => ProviderResponse;

  constructor(url: string, options: ProviderOptions) {
    this.url = url;
    this.config = options.config;
    this.responseParser = createResponseParser(this.config.responseParser);
  }

  id(): string {
    return this.url;
  }

  toString(): string {
    return `[HTTP Provider ${this.url}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Render all nested strings
    const nunjucks = getNunjucksEngine();
    const stringifiedConfig = safeJsonStringify(this.config);
    const renderedConfig: { method: string; headers: Record<string, string>; body: any } =
      JSON.parse(
        nunjucks.renderString(stringifiedConfig, {
          prompt,
          ...context?.vars,
        }),
      );

    const method = renderedConfig.method || 'POST';
    const headers = renderedConfig.headers || { 'Content-Type': 'application/json' };
    invariant(typeof method === 'string', 'Expected method to be a string');
    invariant(typeof headers === 'object', 'Expected headers to be an object');

    logger.debug(`Calling HTTP provider: ${this.url} with config: ${stringifiedConfig}`);
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

    return { output: this.responseParser(response.data) };
  }
}
