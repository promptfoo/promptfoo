import yaml from 'js-yaml';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types.js';
import { getNunjucksEngine, safeJsonStringify } from '../util';
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

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
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
    const renderedConfigString = nunjucks.renderString(stringifiedConfig, {
      // escape prompt if it's a JSON because nunjucks does not escape it
      prompt: isValidJson(prompt) ? prompt.replace(/"/g, '\\"') : prompt,
      ...context?.vars,
    });
    const renderedConfig = yaml.load(renderedConfigString) as {
      method: string;
      headers: Record<string, string>;
      body: Record<string, any>;
    };
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
