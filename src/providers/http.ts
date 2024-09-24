import invariant from 'tiny-invariant';
import { fetchWithCache } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

const nunjucks = getNunjucksEngine();

interface HttpProviderConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
  queryParams?: Record<string, string>;
  responseParser?: string | Function;
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

export function processBody(
  body: Record<string, any>,
  vars: Record<string, any>,
): Record<string, any> {
  const processedBody: Record<string, any> = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        processedBody[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? processBody(item, vars)
            : nunjucks.renderString(item, vars),
        );
      } else {
        processedBody[key] = processBody(value, vars);
      }
    } else if (typeof value === 'string') {
      const renderedValue = nunjucks.renderString(value, vars || {});
      try {
        processedBody[key] = JSON.parse(renderedValue);
      } catch {
        processedBody[key] = renderedValue;
      }
    } else {
      processedBody[key] = value;
    }
  }

  return processedBody;
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: HttpProviderConfig;
  responseParser: (data: any) => ProviderResponse;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config;
    this.url = this.config.url || url;
    this.responseParser = createResponseParser(this.config.responseParser);
    invariant(
      this.config.body || this.config.method === 'GET',
      `Expected HTTP provider ${this.url} to have a config containing {body}, but instead got ${safeJsonStringify(
        this.config,
      )}`,
    );
  }

  id(): string {
    return this.url;
  }

  toString(): string {
    return `[HTTP Provider ${this.url}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };
    const renderedConfig: Partial<HttpProviderConfig> = {
      url: this.url,
      method: nunjucks.renderString(this.config.method || 'GET', vars),
      headers: Object.fromEntries(
        Object.entries(
          this.config.headers ||
            (this.config.method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ).map(([key, value]) => [key, nunjucks.renderString(value, vars)]),
      ),
      body: processBody(this.config.body || {}, vars),
      queryParams: this.config.queryParams
        ? Object.fromEntries(
            Object.entries(this.config.queryParams).map(([key, value]) => [
              key,
              nunjucks.renderString(value, vars),
            ]),
          )
        : undefined,
      responseParser: this.config.responseParser,
    };

    const method = renderedConfig.method || 'POST';
    const headers = renderedConfig.headers || { 'Content-Type': 'application/json' };
    invariant(typeof method === 'string', 'Expected method to be a string');
    invariant(typeof headers === 'object', 'Expected headers to be an object');

    // Construct URL with query parameters for GET requests
    let url = this.url;
    if (renderedConfig.queryParams) {
      const queryString = new URLSearchParams(renderedConfig.queryParams).toString();
      url = `${url}?${queryString}`;
    }

    logger.debug(`Calling HTTP provider: ${url} with config: ${safeJsonStringify(renderedConfig)}`);
    let response;
    try {
      response = await fetchWithCache(
        url,
        {
          method: renderedConfig.method,
          headers: renderedConfig.headers,
          ...(method !== 'GET' && { body: JSON.stringify(renderedConfig.body) }),
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
