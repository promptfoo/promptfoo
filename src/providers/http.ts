import httpZ from 'http-z';
import path from 'path';
import { z } from 'zod';
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
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

const nunjucks = getNunjucksEngine();

export const HttpProviderConfigSchema = z.object({
  body: z.union([z.record(z.any()), z.string(), z.array(z.any())]).optional(),
  headers: z.record(z.string()).optional(),
  method: z.string().optional(),
  queryParams: z.record(z.string()).optional(),
  request: z.string().optional(),
  sessionParser: z.union([z.string(), z.function()]).optional(),
  transformRequest: z.union([z.string(), z.function()]).optional(),
  transformResponse: z.union([z.string(), z.function()]).optional(),
  url: z.string().optional(),
  /**
   * @deprecated
   */
  responseParser: z.union([z.string(), z.function()]).optional(),
});

export type HttpProviderConfig = z.infer<typeof HttpProviderConfigSchema>;

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

export async function createSessionParser(
  parser: string | Function | undefined,
): Promise<({ headers }: { headers: Record<string, string> }) => string> {
  if (!parser) {
    return () => '';
  }

  if (typeof parser === 'function') {
    return (response) => parser(response);
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
    return ({ headers }) => {
      return new Function('headers', `return headers[${JSON.stringify(parser)}]`)(headers);
    };
  }
  throw new Error(
    `Unsupported response parser type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export async function createTransformResponse(
  parser: string | Function | undefined,
): Promise<(data: any, text: string) => ProviderResponse> {
  if (!parser) {
    return (data, text) => ({ output: data || text });
  }
  if (typeof parser === 'function') {
    return (data, text) => {
      try {
        const result = parser(data, text);
        return { output: result };
      } catch (err) {
        logger.error(`Error in response parser function: ${String(err)}`);
        throw err;
      }
    };
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

function processValue(value: any, vars: Record<string, any>): any {
  if (typeof value === 'string') {
    const renderedValue = nunjucks.renderString(value, vars || {});
    try {
      return JSON.parse(renderedValue);
    } catch {
      return renderedValue;
    }
  }
  return value;
}

function processObjects(
  body: Record<string, any> | any[],
  vars: Record<string, any>,
): Record<string, any> | any[] {
  if (Array.isArray(body)) {
    return body.map((item) =>
      typeof item === 'object' && item !== null
        ? processObjects(item, vars)
        : processValue(item, vars),
    );
  }

  const processedBody: Record<string, any> = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'object' && value !== null) {
      processedBody[key] = processObjects(value, vars);
    } else {
      processedBody[key] = processValue(value, vars);
    }
  }
  return processedBody;
}

export function processJsonBody(
  body: Record<string, any> | any[],
  vars: Record<string, any>,
): Record<string, any> | any[] {
  // attempting to process a string as a stringifiedJSON object
  if (typeof body === 'string') {
    body = processValue(body, vars);
    if (typeof body == 'string') {
      return body;
    }
    return processObjects(body, vars);
  }
  return processObjects(body, vars);
}

export function processTextBody(body: string, vars: Record<string, any>): string {
  if (body == null) {
    return body;
  }
  invariant(
    typeof body !== 'object',
    'Expected body to be a string when content type is not application/json',
  );
  return nunjucks.renderString(body, vars);
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

export async function createTransformRequest(
  transform: string | Function | undefined,
): Promise<(prompt: string) => any> {
  if (!transform) {
    return (prompt) => prompt;
  }

  if (typeof transform === 'function') {
    return (prompt) => transform(prompt);
  }

  if (typeof transform === 'string') {
    if (transform.startsWith('file://')) {
      let filename = transform.slice('file://'.length);
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
        `Request transform malformed: ${filename} must export a function or have a default export as a function`,
      );
    }
    // Handle string template
    return (prompt) => {
      const rendered = nunjucks.renderString(transform, { prompt });
      return new Function('prompt', `${rendered}`)(prompt);
    };
  }

  throw new Error(
    `Unsupported request transform type: ${typeof transform}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export function determineRequestBody(
  contentType: boolean,
  parsedPrompt: any,
  configBody: Record<string, any> | any[] | string | undefined,
  vars: Record<string, any>,
): Record<string, any> | any[] | string {
  if (contentType) {
    // For JSON content type
    if (typeof parsedPrompt === 'object' && parsedPrompt !== null) {
      // If parser returned an object, merge it with config body
      return Object.assign({}, configBody || {}, parsedPrompt);
    }
    // Otherwise process the config body with parsed prompt
    return processJsonBody(configBody as Record<string, any> | any[], {
      ...vars,
      prompt: parsedPrompt,
    });
  }
  // For non-JSON content type, process as text
  return processTextBody(configBody as string, {
    ...vars,
    prompt: parsedPrompt,
  });
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: HttpProviderConfig;
  private transformResponse: Promise<(data: any, text: string) => ProviderResponse>;
  private sessionParser: Promise<({ headers }: { headers: Record<string, string> }) => string>;
  private transformRequest: Promise<(prompt: string) => any>;
  constructor(url: string, options: ProviderOptions) {
    this.config = HttpProviderConfigSchema.parse(options.config);
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.sessionParser = createSessionParser(this.config.sessionParser);
    this.transformRequest = createTransformRequest(this.config.transformRequest);

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
    } else if (typeof body === 'string') {
      return { 'content-type': 'application/x-www-form-urlencoded' };
    }
    return {};
  }

  private validateContentTypeAndBody(headers: Record<string, string>, body: any): void {
    if (body != null) {
      if (typeof body == 'object' && !contentTypeIsJson(headers)) {
        throw new Error(
          'Content-Type is not application/json, but body is an object or array. The body must be a string if the Content-Type is not application/json.',
        );
      }
      if (typeof body === 'string' && contentTypeIsJson(headers)) {
        logger.warn(
          'Content-Type is application/json, but body is a string. This is likely to cause unexpected results. It should be an object or array.',
        );
      }
    }
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

    // Transform prompt using request transform
    const transformedPrompt = await (await this.transformRequest)(prompt);

    const renderedConfig: Partial<HttpProviderConfig> = {
      url: this.url,
      method: nunjucks.renderString(this.config.method || 'GET', vars),
      headers,
      body: determineRequestBody(
        contentTypeIsJson(headers),
        transformedPrompt,
        this.config.body,
        vars,
      ),
      queryParams: this.config.queryParams
        ? Object.fromEntries(
            Object.entries(this.config.queryParams).map(([key, value]) => [
              key,
              nunjucks.renderString(value, vars),
            ]),
          )
        : undefined,
      transformResponse: this.config.transformResponse || this.config.responseParser,
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
      ret.metadata = {
        headers: response.headers,
      };
    }

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }
    try {
      const parsedOutput = (await this.transformResponse)(parsedData, rawText);
      ret.output = parsedOutput.output || parsedOutput;
      try {
        const sessionId =
          response.headers && this.sessionParser !== null
            ? (await this.sessionParser)({ headers: response.headers })
            : undefined;
        if (sessionId) {
          ret.sessionId = sessionId;
        }
      } catch (err) {
        logger.error(
          `Error parsing session ID: ${String(err)}. Got headers: ${safeJsonStringify(response.headers)}`,
        );
      }
      return ret;
    } catch (err) {
      logger.error(`Error parsing response: ${String(err)}. Got response: ${rawText}`);
      ret.error = `Error parsing response: ${String(err)}. Got response: ${rawText}`;
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

    try {
      const parsedOutput = (await this.transformResponse)(parsedData, rawText);
      return {
        output: parsedOutput.output || parsedOutput,
      };
    } catch (err) {
      logger.error(`Error parsing response: ${String(err)}. Got response: ${rawText}`);
      return {
        error: `Error parsing response: ${String(err)}. Got response: ${rawText}`,
      };
    }
  }
}
