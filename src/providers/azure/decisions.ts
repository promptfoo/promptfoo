import { createHash, randomUUID } from 'node:crypto';

import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import { extractProviderResponseAttributes, withGenAISpan } from '../../tracing/genaiTracer';
import {
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isAbortError,
} from '../../util/fetch/errors';
import invariant from '../../util/invariant';
import { renderVarsInObject } from '../../util/render';
import {
  isCredentialHeader,
  looksLikeSecret,
  sanitizeObject,
  sanitizeUrlEncodedString,
  sanitizeUrlForLogging,
} from '../../util/sanitizer';
import { escapeRegExp } from '../../util/text';
import {
  answersMatchDecisionQuestions,
  decisionGradingLevelsSchema,
  decisionProbabilitySchema,
  decisionRequestSchema,
  decisionResponseSchema,
  parseDecisionsInput,
} from '../openai/decisionsProtocol';
import { getResponsesTokenUsage } from '../responses/processor';
import { getRequestTimeoutMs } from '../shared';
import { decodeUrlComponent } from '../urlEncoding';
import { AzureGenericProvider } from './generic';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../types/index';
import type { DecisionQuestion, DecisionRequest } from '../openai/decisionsProtocol';
import type { AzureDecisionsOptions, AzureProviderOptions } from './types';

const cacheScopes = new LRUCache<string, string>({
  max: 256,
  ttl: 30 * 60 * 1000,
  ttlAutopurge: true,
  updateAgeOnGet: true,
});

function hasSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return looksLikeSecret(value);
  }
  return value !== null && typeof value === 'object'
    ? Object.values(value).some(hasSensitiveValue)
    : false;
}

function hasHostedDecisionImage(body: DecisionRequest): boolean {
  const parts = [
    ...body.questions.map((question) => question.instructions),
    ...(typeof body.input === 'string'
      ? []
      : body.input.map((item) =>
          'content' in item ? item.content : 'output' in item ? item.output : undefined,
        )),
  ];
  return parts.some(
    (items) =>
      Array.isArray(items) &&
      items.some(
        (item) =>
          item.type === 'input_image' && !/^data:image\/[^;,]+;base64,/i.test(item.image_url),
      ),
  );
}

function getHeaderCredentials(name: string, value: string): string[] {
  const trimmed = value.trim();
  const credentials = [value, trimmed.replace(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s+/, '')];
  const basic = /^Basic\s+([a-z\d+/]+={0,2})$/i.exec(trimmed);
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator !== -1) {
      credentials.push(decoded, decoded.slice(0, separator), decoded.slice(separator + 1));
    }
  }
  if (name.toLowerCase() === 'cookie') {
    for (const part of value.split(';')) {
      const separator = part.indexOf('=');
      if (separator !== -1) {
        const cookieName = part.slice(0, separator).trim();
        const cookieValue = decodeUrlComponent(part.slice(separator + 1).trim());
        if (isCredentialHeader(cookieName, cookieValue)) {
          credentials.push(cookieValue);
        }
      }
    }
  }
  return credentials;
}

function getUrlCredentials(value: string): string[] {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [];
  }
  const credentials: string[] = [];
  if (url.username || url.password) {
    const raw = [url.username, url.password];
    const decoded = raw.map(decodeUrlComponent);
    const basic = Buffer.from(decoded.join(':')).toString('base64');
    credentials.push(...raw, ...decoded, raw.join(':'), decoded.join(':'), basic, `Basic ${basic}`);
  }
  const sanitizedSegments = sanitizeUrlForLogging(url.pathname).split('/');
  for (const [index, segment] of url.pathname.split('/').entries()) {
    if (sanitizedSegments[index] === '%5BREDACTED%5D') {
      credentials.push(segment, decodeUrlComponent(segment));
    }
  }
  for (const segment of url.search.slice(1).split(/[&;]/)) {
    const separator = segment.indexOf('=');
    if (separator !== -1 && sanitizeUrlEncodedString(segment) !== segment) {
      const [, decoded] = Array.from(new URLSearchParams(segment))[0];
      credentials.push(segment.slice(separator + 1), decoded);
    }
  }
  return credentials;
}

export class AzureDecisionsProvider extends AzureGenericProvider<AzureDecisionsOptions> {
  declare config: AzureDecisionsOptions;

  get handlesOwnRetries(): boolean {
    return true;
  }

  constructor(deploymentName: string, options: AzureProviderOptions<AzureDecisionsOptions> = {}) {
    if (!deploymentName.trim()) {
      throw new Error(
        'Azure Decisions requires a deployment name: use azure:decisions:<deployment name>',
      );
    }
    super(deploymentName, options);
  }

  id(): string {
    return `azure:decisions:${this.deploymentName}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const config: AzureDecisionsOptions = {
      ...this.config,
      ...(context?.prompt?.config as Partial<AzureDecisionsOptions>),
    };
    if (context?.isGrading) {
      const label = context.prompt.label;
      if (label === 'llm-rubric') {
        return this.grade(prompt, config, context, options);
      }
      return {
        error: `Azure Decisions cannot grade \`${label}\` assertions. Use \`llm-rubric\` or \`classifier\`.`,
      };
    }
    return this.ask(parseDecisionsInput(prompt), config, context, options);
  }

  async callClassificationApi(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderClassificationResponse> {
    options?.abortSignal?.throwIfAborted();
    const parsed = z
      .object({
        instructions: z.string().min(1),
        labels: z.union([z.array(z.string()).min(1), z.record(z.string(), z.string().nullable())]),
      })
      .safeParse(this.config);
    if (!parsed.success) {
      return {
        error:
          'Azure Decisions classifier needs `instructions` and `labels` (strings or a label-to-description map).',
      };
    }
    const { instructions, labels } = parsed.data;
    const choices = Array.isArray(labels)
      ? labels.map((value) => ({ value }))
      : Object.entries(labels).map(([value, description]) => ({
          value,
          ...(description === null ? {} : { description }),
        }));
    const result = await this.ask(
      prompt,
      {
        ...this.config,
        questions: [{ name: 'classification', type: 'choice', instructions, choices }],
      },
      undefined,
      options,
    );
    if (result.error) {
      return result;
    }
    const answer = decisionResponseSchema.parse(result.raw).answers[0];
    const { output: _output, ...response } = result;
    if (answer.type !== 'choice') {
      return { ...response, error: 'Azure Decisions refused to classify the input.' };
    }
    return {
      ...response,
      classification: Object.fromEntries(
        answer.probabilities.map(({ value, probability }) => [value, probability]),
      ),
    };
  }

  private async grade(
    prompt: string,
    config: AzureDecisionsOptions,
    context: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const messages = z
        .array(z.object({ content: z.unknown().optional() }))
        .safeParse(JSON.parse(prompt));
      const textPart = z.object({
        type: z.enum(['text', 'input_text', 'output_text']),
        text: z.string(),
      });
      if (
        messages.success &&
        messages.data.some(
          ({ content }) =>
            Array.isArray(content) && content.some((part) => !textPart.safeParse(part).success),
        )
      ) {
        return {
          error:
            'Azure Decisions `llm-rubric` supports text output only; media attachments are not supported.',
        };
      }
    } catch {
      // Plain-text grading prompts have no structured attachments.
    }
    const threshold = decisionProbabilitySchema.safeParse(config.threshold ?? 0.5);
    if (!threshold.success) {
      return { error: 'Azure Decisions `threshold` must be a number from 0 to 1.' };
    }
    const { rubric, output } = context.vars;
    if (rubric === undefined || output === undefined) {
      return { error: 'Azure Decisions `llm-rubric` requires rubric and output variables.' };
    }
    const levels =
      config.levels === undefined
        ? undefined
        : decisionGradingLevelsSchema.safeParse(config.levels);
    if (levels && !levels.success) {
      return {
        error:
          'Azure Decisions `levels` must list 2 to 10 strings or {label, description?} objects, ordered low to high.',
      };
    }
    const instructions = typeof rubric === 'string' ? rubric : JSON.stringify(rubric);
    const question: DecisionQuestion = levels?.success
      ? { name: 'grade', type: 'score', instructions, levels: levels.data }
      : { name: 'grade', type: 'predicate', instructions };
    const result = await this.ask(
      typeof output === 'string' ? output : JSON.stringify(output),
      { ...config, questions: [question] },
      context,
      options,
    );
    if (result.error) {
      return result;
    }
    const answer = decisionResponseSchema.parse(result.raw).answers[0];
    if (answer.type !== 'predicate' && answer.type !== 'score') {
      return {
        ...result,
        output: undefined,
        error: 'Azure Decisions refused to grade the output.',
      };
    }
    const raw = answer.type === 'predicate' ? answer.probability : answer.score;
    const top = question.type === 'score' ? question.levels.length - 1 : 1;
    const score = raw / top;
    const pass = score >= threshold.data;
    const comparison = `< threshold ${threshold.data}`;
    const reason =
      answer.type === 'predicate'
        ? `Decisions predicate probability ${raw} ${comparison}`
        : `Decisions score ${raw} on levels 0–${top} (${score} normalized) ${comparison}`;
    return { ...result, output: { pass, score, ...(!pass && { reason }) } };
  }

  private async ask(
    input: unknown,
    config: AzureDecisionsOptions,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    const apiBaseUrl = this.getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error(
        'Azure API configuration missing. Set AZURE_OPENAI_API_BASE_URL or AZURE_API_HOST, or configure apiBaseUrl or apiHost.',
      );
    }

    let body: DecisionRequest;
    try {
      body = decisionRequestSchema.parse({
        model: this.deploymentName,
        input,
        questions:
          context?.isGrading && context.prompt.label === 'llm-rubric'
            ? config.questions
            : renderVarsInObject(config.questions, context?.vars),
        safety_identifier: renderVarsInObject(config.safety_identifier, context?.vars),
      });
    } catch (error) {
      const detail =
        error instanceof z.ZodError
          ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : String(error);
      return { error: `Invalid Azure Decisions request: ${detail}` };
    }
    if (hasHostedDecisionImage(body)) {
      return {
        error:
          'Invalid Azure Decisions request: Azure Decisions images must be inline base64 data URLs.',
      };
    }

    const apiUrl = /\/openai\/v1$/i.test(apiBaseUrl)
      ? apiBaseUrl
      : /\/openai$/i.test(apiBaseUrl)
        ? `${apiBaseUrl}/v1`
        : `${apiBaseUrl}/openai/v1`;

    return withGenAISpan(
      {
        system: 'azure.ai.openai',
        operationName: 'chat',
        model: body.model,
        providerId: this.id(),
        evalId: context?.evaluationId,
        testIndex: context?.testIdx,
        promptLabel: context?.prompt?.label,
        traceparent: context?.traceparent,
        requestBody: typeof input === 'string' ? input : JSON.stringify(input),
      },
      () => this.callDecisions(apiUrl, body, config, context, options),
      extractProviderResponseAttributes,
    );
  }

  private async callDecisions(
    apiUrl: string,
    body: DecisionRequest,
    config: AzureDecisionsOptions,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(this.authHeaders, 'auth headers are not initialized');
    const headers = Object.fromEntries(
      Object.entries({
        'Content-Type': 'application/json',
        ...this.authHeaders,
        ...config.headers,
      }).filter(([name]) => name.toLowerCase() !== 'x-promptfoo-silent'),
    );
    const url = `${apiUrl}/decisions`;
    const secrets = [
      ...getUrlCredentials(url),
      ...Object.entries(headers)
        .filter(([name, value]) => isCredentialHeader(name, value))
        .flatMap(([name, value]) => getHeaderCredentials(name, value)),
    ]
      .filter(Boolean)
      .flatMap((secret) => {
        const variants = [secret, JSON.stringify(secret).slice(1, -1)];
        try {
          return [...variants, encodeURIComponent(secret)];
        } catch {
          return variants;
        }
      });
    headers['x-promptfoo-silent'] = 'true';
    const credentialPattern = new RegExp(
      [...new Set([...secrets, '[REDACTED]'])]
        .sort((left, right) => right.length - left.length)
        .map((secret) =>
          secret.length > 1 ? escapeRegExp(secret) : `(?<!\\w)${escapeRegExp(secret)}(?!\\w)`,
        )
        .join('|'),
      'g',
    );
    const redactCredentials = (value: string, publicModel?: string): string =>
      value.replace(credentialPattern, (match) =>
        publicModel?.includes(match) ? match : '[REDACTED]',
      );
    const errorText = (value: unknown): string =>
      redactCredentials(String(sanitizeObject(String(value), { sanitizeUrls: true })));
    const publicIdentifiers = new Set(
      body.questions.flatMap((question) => [
        question.name,
        ...(question.type === 'choice'
          ? question.choices.map(({ value }) => value)
          : question.type === 'score'
            ? question.levels.map(({ label }) => label)
            : []),
      ]),
    );
    const responseData = (value: unknown, schema?: z.core.$ZodType): unknown => {
      if (schema instanceof z.ZodOptional) {
        schema = schema.unwrap();
      }
      if (schema instanceof z.ZodDiscriminatedUnion) {
        schema = schema.options.find((option) => z.safeParse(option, value).success);
      }
      if (schema instanceof z.ZodLiteral && schema.safeParse(value).success) {
        return value;
      }
      if (typeof value === 'string') {
        if (schema === decisionResponseSchema.shape.model) {
          return redactCredentials(value, body.model);
        }
        return schema && publicIdentifiers.has(value) ? value : redactCredentials(value);
      }
      if (Array.isArray(value)) {
        const element = schema instanceof z.ZodArray ? schema.element : undefined;
        return value.map((item) => responseData(item, element));
      }
      if (value !== null && typeof value === 'object') {
        const shape = schema instanceof z.ZodObject ? schema.shape : undefined;
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => {
            const field =
              shape && Object.prototype.hasOwnProperty.call(shape, key) ? shape[key] : undefined;
            return [field ? key : redactCredentials(key), responseData(item, field)];
          }),
        );
      }
      return value;
    };
    const responseHeaders = (values: Record<string, string> = {}) =>
      Object.fromEntries(
        Object.entries(values)
          .filter(([name]) =>
            /^(?:retry-after(?:-ms)?|x-request-id|(?:x-)?ratelimit-(?:limit|remaining|reset)(?:-(?:requests|tokens))?)$/i.test(
              name,
            ),
          )
          .map(([name, value]) => [name.toLowerCase(), errorText(value)]),
      );

    let deleteFromCache: (() => Promise<void>) | undefined;
    try {
      const transport = JSON.stringify([url, Array.from(new Headers(headers).entries()).sort()]);
      let scope = cacheScopes.get(transport);
      if (!scope) {
        scope = randomUUID();
        cacheScopes.set(transport, scope);
      }
      const bust = (context?.bustCache ?? context?.debug) || hasSensitiveValue(body);
      const cacheKey = bust
        ? undefined
        : `azure-decisions:${createHash('sha256')
            .update(JSON.stringify({ scope, body }))
            .digest('hex')}`;
      const response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: options?.abortSignal,
          skipCloudAuthInjection: true,
        },
        getRequestTimeoutMs(),
        'json',
        {
          bust,
          cacheKey,
          repeatIndex: context?.repeatIndex,
          sanitizeResponse: ({ data, statusText, headers }) => ({
            data: responseData(data, decisionResponseSchema),
            statusText: errorText(statusText),
            headers: responseHeaders(headers),
          }),
        },
        config.maxRetries,
      );
      deleteFromCache = response.deleteFromCache;
      const { data, status, latencyMs } = response;
      const http = {
        status,
        statusText: errorText(response.statusText),
        headers: responseHeaders(response.headers),
      };
      const cached = response.cached || response.coalesced === true;
      const httpMetadata = cached ? {} : { http };
      const apiError = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
      if (status < 200 || status >= 300 || apiError.success) {
        await deleteFromCache?.();
        return {
          error: `Azure Decisions API error (${status}): ${errorText(
            apiError.success
              ? apiError.data.error.message
              : response.statusText || 'Request failed',
          )}`,
          metadata: httpMetadata,
        };
      }

      const result = decisionResponseSchema.safeParse(data);
      if (!result.success || !answersMatchDecisionQuestions(result.data.answers, body.questions)) {
        await deleteFromCache?.();
        return {
          error: 'Invalid Azure Decisions API response: answers or usage do not match the request',
          metadata: httpMetadata,
        };
      }
      const { answers, model, usage } = result.data;
      const inputCost = config.inputCost ?? config.cost;
      const outputCost = config.outputCost ?? config.cost;
      const cost =
        inputCost !== undefined && outputCost !== undefined
          ? cached
            ? 0
            : usage.input_tokens * inputCost + usage.output_tokens * outputCost
          : undefined;
      return {
        cached,
        latencyMs,
        tokenUsage: cached
          ? { total: usage.total_tokens, cached: usage.total_tokens }
          : {
              ...getResponsesTokenUsage(result.data, false),
              cached: usage.input_tokens_details?.cached_tokens,
            },
        ...(cost === undefined ? {} : { cost }),
        output: JSON.stringify({ answers }),
        raw: data,
        metadata: {
          ...httpMetadata,
          model,
          requestId: http.headers['x-request-id'],
        },
        ...(answers.every((answer) => answer.type === 'refusal') ? { isRefusal: true } : {}),
      };
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      if (isAbortError(error)) {
        throw error;
      }
      await deleteFromCache?.();
      if (error instanceof HttpRateLimitError) {
        return {
          error: `Azure Decisions API error: ${errorText(formatRateLimitErrorMessage(error))}`,
          metadata: {
            rateLimitKind: error.kind,
            http: {
              status: error.status,
              statusText: errorText(error.statusText),
              headers: {
                ...responseHeaders(error.headers),
                ...(error.retryAfterMs === undefined
                  ? {}
                  : { 'retry-after-ms': String(error.retryAfterMs) }),
              },
            },
          },
        };
      }
      return { error: `Azure Decisions API call failed: ${errorText(error)}` };
    }
  }
}
