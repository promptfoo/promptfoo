import httpZ from 'http-z';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { maybeLoadFromExternalFile } from '../util';
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
  request?: string;
}

function createResponseParser(parser: any): (data: any, text: string) => ProviderResponse {
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser === 'string') {
    return new Function('json', 'text', `return ${parser}`) as (
      data: any,
      text: string,
    ) => ProviderResponse;
  }
  return (data, text) => ({ output: data || text });
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

function parseRawRequest(input: string) {
  const adjusted = input.trim().replace(/\n/g, '\r\n') + '\r\n\r\n';
  try {
    const messageModel = httpZ.parse(adjusted) as httpZ.HttpZRequestModel;
    return {
      method: messageModel.method,
      url: messageModel.target,
      headers: messageModel.headers.reduce(
        (acc, header) => {
          acc[header.name.toLowerCase()] = header.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      body: messageModel.body,
    };
  } catch (err) {
    throw new Error(`Error parsing raw HTTP request: ${String(err)}`);
  }
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: HttpProviderConfig;
  responseParser: (data: any, text: string) => ProviderResponse;

  constructor(url: string, options: ProviderOptions) {
    this.config = options.config;
    this.url = this.config.url || url;
    this.responseParser = createResponseParser(this.config.responseParser);

    if (this.config.request) {
      this.config.request = maybeLoadFromExternalFile(this.config.request) as string;
    } else {
      invariant(
        this.config.body || this.config.method === 'GET',
        `Expected HTTP provider ${this.url} to have a config containing {body}, but instead got ${safeJsonStringify(
          this.config,
        )}`,
      );
    }
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

    if (this.config.request) {
      return this.callApiWithRawRequest(vars);
    }

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
        'text',
      );
    } catch (err) {
      return {
        error: `HTTP call error: ${String(err)}`,
      };
    }
    logger.debug(`\tHTTP response: ${response.data}`);

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    return {
      output: this.responseParser(parsedData, rawText),
    };
  }

  private async callApiWithRawRequest(vars: Record<string, any>): Promise<ProviderResponse> {
    invariant(this.config.request, 'Expected request to be set in http provider config');
    const renderedRequest = nunjucks.renderString(this.config.request, vars);
    const parsedRequest = parseRawRequest(renderedRequest.trim());

    const protocol = this.url.startsWith('https') ? 'https' : 'http';
    const url = new URL(
      parsedRequest.url,
      `${protocol}://${parsedRequest.headers['host']}`,
    ).toString();

    logger.debug(`Calling HTTP provider with raw request: ${url}`);
    let response;
    try {
      response = await fetchWithCache(
        url,
        {
          method: parsedRequest.method,
          headers: parsedRequest.headers,
          ...(parsedRequest.body && { body: parsedRequest.body.text.trim() }),
        },
        REQUEST_TIMEOUT_MS,
        'text',
      );
    } catch (err) {
      return {
        error: `HTTP call error: ${String(err)}`,
      };
    }
    logger.debug(`\tHTTP response: ${response.data}`);

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    return {
      output: this.responseParser(parsedData, rawText),
    };
  }
}
