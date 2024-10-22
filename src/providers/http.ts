import httpZ from 'http-z';
import path from 'path';
import invariant from 'tiny-invariant';
import { fetchWithCache } from '../cache';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { maybeLoadFromExternalFile } from '../util';
import { isJavascriptFile } from '../util/file';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

const nunjucks = getNunjucksEngine();

interface HttpProviderConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, any> | string | any[];
  queryParams?: Record<string, string>;
  responseParser?: string | Function;
  request?: string;
}

function contentTypeIsJson(headers: Record<string, string> | undefined) {
  if (!headers) {
    return false;
  }
  return Object.keys(headers).some((key) => {
    if (key.toLowerCase().startsWith('content-type')) {
      return headers?.[key].includes('application/json');
    }
    return false;
  });
}

export async function createResponseParser(
  parser: string | Function | undefined,
): Promise<(data: any, text: string) => ProviderResponse> {
  if (!parser) {
    return (data, text) => ({ output: data || text });
  }
  if (typeof parser === 'function') {
    return (data, text) => ({ output: parser(data, text) });
  }
  if (typeof parser === 'string' && parser.startsWith('file://')) {
    let filename = parser.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return requiredModule;
    }
    throw new Error(
      `Response parser malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof parser === 'string') {
    return (data, text) => ({
      output: new Function('json', 'text', `return ${parser}`)(data, text),
    });
  }
  throw new Error(
    `Unsupported response parser type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export function processBody(
  body: Record<string, any> | string | any[] | undefined,
  vars: Record<string, any>,
): Record<string, any> | string | any[] | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (typeof body === 'string') {
    return nunjucks.renderString(body, vars);
  }

  // Handle JSON content type (objects and arrays)
  if (Array.isArray(body)) {
    return body.map((item) => processBody(item, vars));
  }

  if (typeof body === 'object' && body !== null) {
    const processedBody: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      processedBody[key] = processBody(value, vars);
    }
    return processedBody;
  }

  // For any other types, return as is
  return body;
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
  private responseParser: Promise<(data: any, text: string) => ProviderResponse>;

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

  private getDefaultHeaders(body: any): Record<string, string> {
    if (this.config.method === 'GET') {
      return {};
    }
    if (typeof body === 'object' && body !== null) {
      return { 'content-type': 'application/json' };
    }
    return {};
  }

  private validateContentTypeAndBody(headers: Record<string, string>, body: any): void {
    const contentType = this.getContentType(headers);
    if (
      contentType &&
      !contentType.includes('application/json') &&
      typeof body === 'object' &&
      body !== null
    ) {
      throw new Error(
        'Content-Type is not application/json, but body is an object or array. The body must be a string if the Content-Type is not application/json.',
      );
    }
  }

  private getContentType(headers: Record<string, string>): string | undefined {
    const contentTypeHeader = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'content-type',
    );
    return contentTypeHeader ? headers[contentTypeHeader] : undefined;
  }

  private getHeaders(
    defaultHeaders: Record<string, string>,
    vars: Record<string, any>,
  ): Record<string, string> {
    const configHeaders = this.config.headers || {};
    // Convert all keys in configHeaders to lowercase
    const headers = Object.fromEntries(
      Object.entries(configHeaders).map(([key, value]) => [key.toLowerCase(), value]),
    );
    return Object.fromEntries(
      Object.entries({ ...defaultHeaders, ...headers }).map(([key, value]) => [
        key,
        nunjucks.renderString(value, vars),
      ]),
    );
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    };

    if (this.config.request) {
      return this.callApiWithRawRequest(vars);
    }

    const defaultHeaders = this.getDefaultHeaders(this.config.body);
    const headers = this.getHeaders(defaultHeaders, vars);
    this.validateContentTypeAndBody(headers, this.config.body);

    const renderedConfig: Partial<HttpProviderConfig> = {
      url: this.url,
      method: nunjucks.renderString(this.config.method || 'GET', vars),
      headers,
      body: processBody(this.config.body, vars),
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
          ...(method !== 'GET' && {
            body: contentTypeIsJson(headers)
              ? JSON.stringify(renderedConfig.body)
              : String(renderedConfig.body)?.trim(),
          }),
        },
        REQUEST_TIMEOUT_MS,
        'text',
        context?.debug,
      );
    } catch (err) {
      return {
        error: `HTTP call error: ${String(err)}`,
      };
    }
    logger.debug(`\tHTTP response: ${response.data}`);
    const ret: ProviderResponse = {};
    if (context?.debug) {
      ret.raw = response.data;
    }

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }
    try {
      const parsedOutput = (await this.responseParser)(parsedData, rawText);
      ret.output = parsedOutput.output || parsedOutput;
      return ret;
    } catch (err) {
      ret.error = `Error parsing response: ${String(err)}`;
      return ret;
    }
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
    logger.debug(`Calling HTTP provider with raw request: ${parsedRequest}`);
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

    const parsedOutput = (await this.responseParser)(parsedData, rawText);
    return {
      output: parsedOutput.output || parsedOutput,
    };
  }
}
