import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import httpZ from 'http-z';
import path from 'path';
import { z } from 'zod';
import { fetchWithCache, type FetchWithCacheResult } from '../cache';
import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../util';
import { isJavascriptFile } from '../util/file';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { REQUEST_TIMEOUT_MS } from './shared';

// This function is used to encode the URL in the first line of a raw request
export function urlEncodeRawRequestPath(rawRequest: string) {
  const firstLine = rawRequest.split('\n')[0];

  const firstSpace = firstLine.indexOf(' ');
  const method = firstLine.slice(0, firstSpace);
  if (!method || !http.METHODS.includes(method)) {
    logger.error(`[Http Provider] HTTP request method ${method} is not valid. From: ${firstLine}`);
    throw new Error(
      `[Http Provider] HTTP request method ${method} is not valid. From: ${firstLine}`,
    );
  }
  const lastSpace = firstLine.lastIndexOf(' ');
  if (lastSpace === -1) {
    logger.error(
      `[Http Provider] HTTP request URL is not valid. Protocol is missing. From: ${firstLine}`,
    );
    throw new Error(
      `[Http Provider] HTTP request URL is not valid. Protocol is missing. From: ${firstLine}`,
    );
  }
  const url = firstLine.slice(firstSpace + 1, lastSpace);

  if (url.length === 0) {
    logger.error(`[Http Provider] HTTP request URL is not valid. From: ${firstLine}`);
    throw new Error(`[Http Provider] HTTP request URL is not valid. From: ${firstLine}`);
  }

  const protocol = lastSpace < firstLine.length ? firstLine.slice(lastSpace + 1) : '';

  if (!protocol.toLowerCase().startsWith('http')) {
    logger.error(`[Http Provider] HTTP request protocol is not valid. From: ${firstLine}`);
    throw new Error(`[Http Provider] HTTP request protocol is not valid. From: ${firstLine}`);
  }

  logger.debug(`[Http Provider] Encoding URL: ${url} from first line of raw request: ${firstLine}`);

  try {
    // Use the built-in URL class to parse and encode the URL
    const parsedUrl = new URL(url, 'http://placeholder-base.com');

    // Replace the original URL in the first line
    rawRequest = rawRequest.replace(
      firstLine,
      `${method} ${parsedUrl.pathname}${parsedUrl.search}${protocol ? ' ' + protocol : ''}`,
    );
  } catch (err) {
    logger.error(`[Http Provider] Error parsing URL in HTTP request: ${String(err)}`);
    throw new Error(`[Http Provider] Error parsing URL in HTTP request: ${String(err)}`);
  }

  return rawRequest;
}

export async function generateSignature(
  privateKeyPathOrKey: string,
  signatureTimestamp: number,
  signatureDataTemplate: string,
  signatureAlgorithm: string = 'SHA256',
  isPath: boolean = true,
): Promise<string> {
  try {
    const privateKey = isPath ? fs.readFileSync(privateKeyPathOrKey, 'utf8') : privateKeyPathOrKey;
    const data = getNunjucksEngine()
      .renderString(signatureDataTemplate, {
        signatureTimestamp,
      })
      .replace(/\\n/g, '\n');
    const sign = crypto.createSign(signatureAlgorithm);
    sign.update(data);
    sign.end();
    const signature = sign.sign(privateKey);
    return signature.toString('base64');
  } catch (err) {
    logger.error(`Error generating signature: ${String(err)}`);
    throw new Error(`Failed to generate signature: ${String(err)}`);
  }
}

export function needsSignatureRefresh(
  timestamp: number,
  validityMs: number,
  bufferMs?: number,
): boolean {
  const now = Date.now();
  const timeElapsed = now - timestamp;
  const effectiveBufferMs = bufferMs ?? Math.floor(validityMs * 0.1); // Default to 10% of validity time
  return timeElapsed + effectiveBufferMs >= validityMs;
}

export const HttpProviderConfigSchema = z.object({
  body: z.union([z.record(z.any()), z.string(), z.array(z.any())]).optional(),
  headers: z.record(z.string()).optional(),
  maxRetries: z.number().min(0).optional(),
  method: z.string().optional(),
  queryParams: z.record(z.string()).optional(),
  request: z.string().optional(),
  useHttps: z
    .boolean()
    .optional()
    .describe('Use HTTPS for the request. This only works with the raw request option'),
  sessionParser: z.union([z.string(), z.function()]).optional(),
  transformRequest: z.union([z.string(), z.function()]).optional(),
  transformResponse: z.union([z.string(), z.function()]).optional(),
  url: z.string().optional(),
  validateStatus: z
    .union([z.string(), z.function().returns(z.boolean()).args(z.number())])
    .optional(),
  /**
   * @deprecated use transformResponse instead
   */
  responseParser: z.union([z.string(), z.function()]).optional(),
  // Digital Signature Authentication
  signatureAuth: z
    .object({
      privateKeyPath: z.string().optional(),
      privateKey: z.string().optional(),
      signatureValidityMs: z.number().default(300000), // 5 minutes
      // Template for generating the data to sign
      signatureDataTemplate: z.string().default('{{timestamp}}'),
      // Signature algorithm to use (defaults to SHA256)
      signatureAlgorithm: z.string().default('SHA256'),
      // Buffer time in ms before expiry to refresh (defaults to 10% of validity time)
      signatureRefreshBufferMs: z.number().optional(),
    })
    .refine((data) => data.privateKeyPath !== undefined || data.privateKey !== undefined, {
      message: 'Either privateKeyPath or privateKey must be provided',
    })
    .optional(),
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

interface SessionParserData {
  headers?: Record<string, string> | null;
  body?: Record<string, any> | string | null;
}

export async function createSessionParser(
  parser: string | Function | undefined,
): Promise<(data: SessionParserData) => string> {
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
      `Response transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof parser === 'string') {
    return (data: SessionParserData) => {
      const trimmedParser = parser.trim();

      return new Function('data', `return (${trimmedParser});`)(data);
    };
  }
  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

interface TransformResponseContext {
  response: FetchWithCacheResult<any>;
}

export async function createTransformResponse(
  parser: string | Function | undefined,
): Promise<(data: any, text: string, context?: TransformResponseContext) => ProviderResponse> {
  if (!parser) {
    return (data, text) => ({ output: data || text });
  }

  if (typeof parser === 'function') {
    return (data, text, context) => {
      try {
        const result = parser(data, text, context);
        if (typeof result === 'string') {
          return { output: result };
        }
        return { output: result };
      } catch (err) {
        logger.error(`Error in response transform function: ${String(err)}`);
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
      `Response transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof parser === 'string') {
    return (data, text, context) => {
      try {
        const trimmedParser = parser.trim();
        // Check if it's a function expression (either arrow or regular)
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedParser);
        const transformFn = new Function(
          'json',
          'text',
          'context',
          isFunctionExpression
            ? `try { return (${trimmedParser})(json, text, context); } catch(e) { throw new Error('Transform failed: ' + e.message); }`
            : `try { return (${trimmedParser}); } catch(e) { throw new Error('Transform failed: ' + e.message); }`,
        );
        let resp: ProviderResponse | string;
        if (context) {
          resp = transformFn(data || null, text, context);
        } else {
          resp = transformFn(data || null, text);
        }

        if (typeof resp === 'string') {
          return { output: resp };
        }
        return resp;
      } catch (err) {
        logger.error(`Error in response transform: ${String(err)}`);
        throw new Error(`Failed to transform response: ${String(err)}`);
      }
    };
  }
  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

/**
 * Substitutes template variables in a JSON object or array.
 *
 * This function walks through all properties of the provided JSON structure
 * and replaces template expressions (like {{varName}}) with their actual values.
 * If a substituted string is valid JSON, it will be parsed into an object or array.
 *
 * Example:
 * Input: {"greeting": "Hello {{name}}!", "data": {"id": "{{userId}}"}}
 * Vars: {name: "World", userId: 123}
 * Output: {"greeting": "Hello World!", "data": {"id": 123}}
 *
 * @param body The JSON object or array containing template expressions
 * @param vars Dictionary of variable names and their values for substitution
 * @returns A new object or array with all template expressions replaced
 */
export function processJsonBody(
  body: Record<string, any> | any[],
  vars: Record<string, any>,
): Record<string, any> | any[] {
  // First apply the standard variable rendering
  const rendered = renderVarsInObject(body, vars);

  // For objects and arrays, we need to check each string value to see if it can be parsed as JSON
  if (typeof rendered === 'object' && rendered !== null) {
    // Function to process nested values
    const processNestedValues = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(processNestedValues);
      } else if (typeof obj === 'object' && obj !== null) {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = processNestedValues(value);
        }
        return result;
      } else if (typeof obj === 'string') {
        try {
          return JSON.parse(obj);
        } catch {
          return obj;
        }
      }
      return obj;
    };

    return processNestedValues(rendered);
  }

  // If it's a string, attempt to parse as JSON
  if (typeof rendered === 'string') {
    try {
      return JSON.parse(rendered);
    } catch {
      return rendered;
    }
  }

  return rendered;
}

/**
 * Substitutes template variables in a text string.
 *
 * Replaces template expressions (like {{varName}}) in the string with their
 * actual values from the provided variables dictionary.
 *
 * Example:
 * Input: "Hello {{name}}! Your user ID is {{userId}}."
 * Vars: {name: "World", userId: 123}
 * Output: "Hello World! Your user ID is 123."
 *
 * @param body The string containing template expressions to substitute
 * @param vars Dictionary of variable names and their values for substitution
 * @returns A new string with all template expressions replaced
 * @throws Error if body is an object instead of a string
 */
export function processTextBody(body: string, vars: Record<string, any>): string {
  if (body == null) {
    return body;
  }
  invariant(
    typeof body !== 'object',
    'Expected body to be a string when content type is not application/json',
  );
  try {
    return renderVarsInObject(body, vars);
  } catch (err) {
    logger.warn(`Error rendering body template: ${err}`);
    return body;
  }
}

function parseRawRequest(input: string) {
  const adjusted = input.trim().replace(/\n/g, '\r\n') + '\r\n\r\n';
  // If the injectVar is in a query param, we need to encode the URL in the first line
  const encoded = urlEncodeRawRequestPath(adjusted);
  try {
    const messageModel = httpZ.parse(encoded) as httpZ.HttpZRequestModel;
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
    return async (prompt) => {
      try {
        return await transform(prompt);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(`Error in request transform function: ${errorMessage}`);
        logger.error(wrappedError.message);
        throw wrappedError;
      }
    };
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
        return async (prompt) => {
          try {
            return await requiredModule(prompt);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const wrappedError = new Error(
              `Error in request transform function from ${filename}: ${errorMessage}`,
            );
            logger.error(wrappedError.message);
            throw wrappedError;
          }
        };
      }
      throw new Error(
        `Request transform malformed: ${filename} must export a function or have a default export as a function`,
      );
    }
    // Handle string template
    return async (prompt) => {
      try {
        const rendered = getNunjucksEngine().renderString(transform, { prompt });
        return await new Function('prompt', `${rendered}`)(prompt);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(
          `Error in request transform string template: ${errorMessage}`,
        );
        logger.error(wrappedError.message);
        throw wrappedError;
      }
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

export async function createValidateStatus(
  validator: string | ((status: number) => boolean) | undefined,
): Promise<(status: number) => boolean> {
  if (!validator) {
    return (status: number) => true;
  }

  if (typeof validator === 'function') {
    return validator;
  }

  if (typeof validator === 'string') {
    if (validator.startsWith('file://')) {
      let filename = validator.slice('file://'.length);
      let functionName: string | undefined;
      if (filename.includes(':')) {
        const splits = filename.split(':');
        if (splits[0] && isJavascriptFile(splits[0])) {
          [filename, functionName] = splits;
        }
      }
      try {
        const requiredModule = await importModule(
          path.resolve(cliState.basePath || '', filename),
          functionName,
        );
        if (typeof requiredModule === 'function') {
          return requiredModule;
        }
        throw new Error('Exported value must be a function');
      } catch (err: any) {
        throw new Error(`Status validator malformed: ${filename} - ${err?.message || String(err)}`);
      }
    }
    // Handle string template - wrap in a function body
    try {
      const trimmedValidator = validator.trim();
      // Check if it's an arrow function or regular function
      if (trimmedValidator.includes('=>') || trimmedValidator.startsWith('function')) {
        // For arrow functions and regular functions, evaluate the whole function
        return new Function(`return ${trimmedValidator}`)() as (status: number) => boolean;
      }
      // For expressions, wrap in a function body
      return new Function('status', `return ${trimmedValidator}`) as (status: number) => boolean;
    } catch (err: any) {
      throw new Error(`Invalid status validator expression: ${err?.message || String(err)}`);
    }
  }

  throw new Error(
    `Unsupported status validator type: ${typeof validator}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: HttpProviderConfig;
  private transformResponse: Promise<
    (data: any, text: string, context?: TransformResponseContext) => ProviderResponse
  >;
  private sessionParser: Promise<(data: SessionParserData) => string>;
  private transformRequest: Promise<(prompt: string) => any>;
  private validateStatus: Promise<(status: number) => boolean>;
  private lastSignatureTimestamp?: number;
  private lastSignature?: string;

  constructor(url: string, options: ProviderOptions) {
    this.config = HttpProviderConfigSchema.parse(options.config);
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.sessionParser = createSessionParser(this.config.sessionParser);
    this.transformRequest = createTransformRequest(this.config.transformRequest);
    this.validateStatus = createValidateStatus(this.config.validateStatus);
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

  private async refreshSignatureIfNeeded(): Promise<void> {
    if (!this.config.signatureAuth) {
      logger.debug('[HTTP Provider Auth]: No signature auth configured');
      return;
    }

    const {
      privateKeyPath,
      privateKey,
      signatureValidityMs,
      signatureDataTemplate,
      signatureAlgorithm,
      signatureRefreshBufferMs,
    } = this.config.signatureAuth;

    if (
      !this.lastSignatureTimestamp ||
      !this.lastSignature ||
      needsSignatureRefresh(
        this.lastSignatureTimestamp,
        signatureValidityMs,
        signatureRefreshBufferMs,
      )
    ) {
      logger.debug('[HTTP Provider Auth]: Generating new signature');
      this.lastSignatureTimestamp = Date.now();
      this.lastSignature = await generateSignature(
        privateKeyPath || privateKey!,
        this.lastSignatureTimestamp,
        signatureDataTemplate,
        signatureAlgorithm,
        privateKeyPath !== undefined,
      );
      logger.debug('[HTTP Provider Auth]: Generated new signature successfully');
    } else {
      logger.debug('[HTTP Provider Auth]: Using cached signature');
    }

    invariant(this.lastSignature, 'Signature should be defined at this point');
    invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');
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

  async getHeaders(
    defaultHeaders: Record<string, string>,
    vars: Record<string, any>,
  ): Promise<Record<string, string>> {
    const configHeaders = this.config.headers || {};
    // Convert all keys in configHeaders to lowercase
    const headers = Object.fromEntries(
      Object.entries(configHeaders).map(([key, value]) => [key.toLowerCase(), value]),
    );

    const nunjucks = getNunjucksEngine();

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
    } as Record<string, any>;

    // Add signature values to vars if signature auth is enabled
    if (this.config.signatureAuth) {
      await this.refreshSignatureIfNeeded();
      invariant(this.lastSignature, 'Signature should be defined at this point');
      invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');

      if (vars.signature) {
        logger.warn(
          '[HTTP Provider Auth]: `signature` is already defined in vars and will be overwritten',
        );
      }
      if (vars.signatureTimestamp) {
        logger.warn(
          '[HTTP Provider Auth]: `signatureTimestamp` is already defined in vars and will be overwritten',
        );
      }

      vars.signature = this.lastSignature;
      vars.signatureTimestamp = this.lastSignatureTimestamp;
    }

    if (this.config.request) {
      return this.callApiWithRawRequest(vars, context);
    }

    const defaultHeaders = this.getDefaultHeaders(this.config.body);
    const headers = await this.getHeaders(defaultHeaders, vars);
    this.validateContentTypeAndBody(headers, this.config.body);

    // Transform prompt using request transform
    const transformedPrompt = await (await this.transformRequest)(prompt);
    logger.debug(
      `[HTTP Provider]: Transformed prompt: ${safeJsonStringify(transformedPrompt)}. Original prompt: ${safeJsonStringify(prompt)}`,
    );

    const renderedConfig: Partial<HttpProviderConfig> = {
      url: this.url,
      method: getNunjucksEngine().renderString(this.config.method || 'GET', vars),
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
              getNunjucksEngine().renderString(value, vars),
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

    logger.debug(
      `[HTTP Provider]: Calling ${url} with config: ${safeJsonStringify(renderedConfig)}`,
    );

    const response = await fetchWithCache(
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
      this.config.maxRetries,
    );

    logger.debug(`[HTTP Provider]: Response: ${safeJsonStringify(response.data)}`);
    if (!(await this.validateStatus)(response.status)) {
      throw new Error(
        `HTTP call failed with status ${response.status} ${response.statusText}: ${response.data}`,
      );
    }
    logger.debug(
      `[HTTP Provider]: Response (HTTP ${response.status}): ${safeJsonStringify(response.data)}`,
    );

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
      const sessionId =
        this.sessionParser == null
          ? undefined
          : (await this.sessionParser)({ headers: response.headers, body: parsedData ?? rawText });
      if (sessionId) {
        ret.sessionId = sessionId;
      }
    } catch (err) {
      logger.error(
        `Error parsing session ID: ${String(err)}. Got headers: ${safeJsonStringify(response.headers)} and parsed body: ${safeJsonStringify(parsedData)}`,
      );
      throw err;
    }
    const parsedOutput = (await this.transformResponse)(parsedData, rawText, { response });
    if (parsedOutput?.output) {
      return {
        ...ret,
        ...parsedOutput,
      };
    }
    return {
      ...ret,
      output: parsedOutput,
    };
  }

  private async callApiWithRawRequest(
    vars: Record<string, any>,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    invariant(this.config.request, 'Expected request to be set in http provider config');
    const renderedRequest = getNunjucksEngine().renderString(this.config.request, vars);
    const parsedRequest = parseRawRequest(renderedRequest.trim());

    const protocol = this.url.startsWith('https') || this.config.useHttps ? 'https' : 'http';
    const url = new URL(
      parsedRequest.url,
      `${protocol}://${parsedRequest.headers['host']}`,
    ).toString();

    // Remove content-length header from raw request if the user added it, it will be added by fetch with the correct value
    delete parsedRequest.headers['content-length'];

    logger.debug(
      `[HTTP Provider]: Calling ${url} with raw request: ${parsedRequest.method}  ${safeJsonStringify(parsedRequest.body)} \n headers: ${safeJsonStringify(parsedRequest.headers)}`,
    );
    const response = await fetchWithCache(
      url,
      {
        method: parsedRequest.method,
        headers: parsedRequest.headers,
        ...(parsedRequest.body && { body: parsedRequest.body.text.trim() }),
      },
      REQUEST_TIMEOUT_MS,
      'text',
      context?.debug,
      this.config.maxRetries,
    );

    logger.debug(`[HTTP Provider]: Response: ${safeJsonStringify(response.data)}`);

    if (!(await this.validateStatus)(response.status)) {
      throw new Error(
        `HTTP call failed with status ${response.status} ${response.statusText}: ${response.data}`,
      );
    }

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }
    const ret: ProviderResponse = {};
    if (context?.debug) {
      ret.raw = response.data;
      ret.metadata = {
        headers: response.headers,
      };
    }

    const parsedOutput = (await this.transformResponse)(parsedData, rawText, { response });
    if (parsedOutput?.output) {
      return {
        ...ret,
        ...parsedOutput,
      };
    }

    return {
      ...ret,
      output: parsedOutput,
    };
  }
}
