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
import {
  getCloudAuthHeaderName,
  getCloudBearerToken,
  isPromptfooCloudApiHost,
} from '../../util/fetch/monkeyPatchFetch';
import { renderVarsInObject } from '../../util/render';
import {
  isCredentialHeader,
  sanitizeObject,
  sanitizeUrlEncodedString,
  sanitizeUrlForLogging,
} from '../../util/sanitizer';
import { escapeRegExp } from '../../util/text';
import {
  type DecisionGradingConfig,
  decisionLabelEntries,
  gradeDecisionScore,
  readTextDecisionRubric,
  resolveDecisionThreshold,
} from '../decisionGrading';
import { getResponsesTokenUsage } from '../responses/processor';
import { getRequestTimeoutMs } from '../shared';
import { decodeUrlComponent } from '../urlEncoding';
import { calculateOpenAIUsageCost } from './billing';
import {
  answersMatchDecisionQuestions,
  decisionGradingLevelsSchema,
  decisionRequestSchema,
  decisionResponseSchema,
  parseDecisionsInput,
} from './decisionsProtocol';
import { hasHeaderOverride, OpenAiGenericProvider } from './index';
import { appendOpenAiApiPath, assertOpenAiApiModel, hasSensitiveOpenAiCacheString } from './util';

import type { EnvOverrides } from '../../contracts/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../types/index';
import type { DecisionGradingLevel, DecisionQuestion, DecisionRequest } from './decisionsProtocol';
import type { OpenAiSharedOptions } from './types';

// Equivalent grader instances share random namespaces within this process. Credentials stay
// only in bounded memory, expire after inactivity, and never enter persisted cache keys.
const cacheScopes = new LRUCache<string, string>({
  max: 256,
  ttl: 30 * 60 * 1000,
  ttlAutopurge: true,
  updateAgeOnGet: true,
});

interface DecisionsOptions
  extends OpenAiSharedOptions,
    DecisionGradingConfig<DecisionGradingLevel> {
  model?: string;
  questions?: DecisionQuestion[];
  prompt_cache_key?: string | null;
  prompt_cache_options?: DecisionRequest['prompt_cache_options'];
  safety_identifier?: string | null;
}

function hasSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return hasSensitiveOpenAiCacheString(value);
  }
  return value !== null && typeof value === 'object'
    ? Object.values(value).some(hasSensitiveValue)
    : false;
}

/** Collect gateway authentication forms without changing the supplied headers. */
function getHeaderCredentials(name: string, value: string): string[] {
  const trimmed = value.trim();
  const credentials = [value, trimmed.replace(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s+/, '')];
  const basic = /^Basic\s+([a-z\d+/]+={0,2})$/i.exec(trimmed);
  if (basic) {
    const bytes = Buffer.from(basic[1], 'base64');
    const decoded = bytes.toString('utf8');
    const separator = decoded.indexOf(':');
    if (
      separator !== -1 &&
      bytes.toString('base64').replace(/=+$/, '') === basic[1].replace(/=+$/, '')
    ) {
      credentials.push(decoded, decoded.slice(0, separator), decoded.slice(separator + 1));
    }
  }
  if (name.toLowerCase() === 'cookie') {
    for (const part of value.split(';')) {
      const separator = part.indexOf('=');
      if (separator !== -1) {
        const raw = part.slice(separator + 1).trim();
        const unquoted = raw.replace(/^"(.*)"$/, '$1');
        const decoded = decodeUrlComponent(unquoted);
        const decodedValue = decoded.replace(/^"(.*)"$/, '$1');
        const cookieName = part
          .slice(0, separator)
          .trim()
          .replace(/^__(?:Host|Secure)-/i, '');
        // Cookie metadata is not a credential; keep full-header secrecy without erasing locale values.
        if (
          isCredentialHeader(cookieName, decodedValue) ||
          /^(?:csrf|xsrf)$/i.test(cookieName) ||
          /(?:session(?:[-_]?id)?|sessid|(?:^|[._-])sid)$/i.test(cookieName)
        ) {
          credentials.push(raw, unquoted, decoded, decodedValue);
        }
      }
    }
  }
  return credentials;
}

/** Collect URL authentication forms without changing the gateway request URL. */
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
    const pair = decoded.join(':');
    const basic = Buffer.from(pair).toString('base64');
    credentials.push(...raw, ...decoded, raw.join(':'), pair, basic, `Basic ${basic}`);
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

export class OpenAiDecisionsProvider extends OpenAiGenericProvider {
  declare config: DecisionsOptions;

  get handlesOwnRetries(): boolean {
    // fetchWithCache owns transport retries; do not replay an exhausted request.
    return true;
  }

  constructor(
    modelName: string,
    options: { config?: DecisionsOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const model = modelName || options.config?.model;
    if (typeof model !== 'string' || !model.trim()) {
      throw new Error(
        'OpenAI Decisions requires a model: use openai:decisions:<model> or config.model',
      );
    }
    super(model, options);
  }

  id(): string {
    return `openai:decisions:${this.modelName}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config: DecisionsOptions = { ...this.config, ...context?.prompt?.config };
    const label = context?.prompt?.label;
    if (context?.isGrading) {
      if (label === 'llm-rubric') {
        return this.grade(prompt, config, context, options);
      }
      return {
        error: `OpenAI Decisions cannot grade \`${label}\` assertions. Use \`llm-rubric\` or \`classifier\`.`,
      };
    }
    return this.ask(parseDecisionsInput(prompt), config, context, options);
  }

  async callClassificationApi(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderClassificationResponse> {
    const parsed = z
      .object({
        instructions: z.string().min(1),
        labels: z.union([z.array(z.string()).min(1), z.record(z.string(), z.string().nullable())]),
      })
      .safeParse(this.config);
    if (!parsed.success) {
      return {
        error:
          'OpenAI Decisions classifier needs `instructions` and `labels` (strings or a label-to-description map).',
      };
    }
    const { instructions, labels } = parsed.data;
    const choices = decisionLabelEntries(labels).map(([value, description]) => ({
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
      return { ...response, error: 'OpenAI Decisions refused to classify the input.' };
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
    config: DecisionsOptions,
    context: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const rubric = readTextDecisionRubric(prompt, context.vars, 'OpenAI Decisions');
    if ('error' in rubric) {
      return rubric;
    }
    const threshold = resolveDecisionThreshold(config.threshold);
    if (threshold === undefined) {
      return { error: 'OpenAI Decisions `threshold` must be a number from 0 to 1.' };
    }
    const levels =
      config.levels === undefined
        ? undefined
        : decisionGradingLevelsSchema.safeParse(config.levels);
    if (levels && !levels.success) {
      return {
        error:
          'OpenAI Decisions `levels` must list 2 to 10 strings or {label, description?} objects, ordered low to high.',
      };
    }
    const { instructions, input } = rubric;
    const question: z.infer<typeof questionSchema> = levels?.success
      ? { name: 'grade', type: 'score', instructions, levels: levels.data }
      : { name: 'grade', type: 'predicate', instructions };
    const result = await this.ask(input, { ...config, questions: [question] }, context, options);
    if (result.error) {
      return result;
    }
    const answer = decisionResponseSchema.parse(result.raw).answers[0];
    if (answer.type !== 'predicate' && answer.type !== 'score') {
      return {
        ...result,
        output: undefined,
        error: 'OpenAI Decisions refused to grade the output.',
      };
    }
    const raw = answer.type === 'predicate' ? answer.probability : answer.score;
    const top = question.type === 'score' ? question.levels.length - 1 : 1;
    const { pass, score } = gradeDecisionScore(raw, top, threshold);
    const comparison = `< threshold ${threshold}`;
    const reason =
      answer.type === 'predicate'
        ? `Decisions predicate probability ${raw} ${comparison}`
        : `Decisions score ${raw} on levels 0–${top} (${score} normalized) ${comparison}`;
    // Let the matcher explain its final verdict when the provider threshold passes.
    return { ...result, output: { pass, score, ...(!pass && { reason }) } };
  }

  private async ask(
    input: unknown,
    config: DecisionsOptions,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const apiKey = this.getApiKey(config);
    if ((config.apiKeyRequired ?? true) && !apiKey) {
      throw new Error(this.getMissingApiKeyErrorMessage(config));
    }

    let body: DecisionRequest;
    try {
      body = decisionRequestSchema.parse({
        model: this.modelName,
        input,
        questions:
          context?.isGrading && context.prompt.label === 'llm-rubric'
            ? config.questions
            : renderVarsInObject(config.questions, context?.vars),
        prompt_cache_key: renderVarsInObject(config.prompt_cache_key, context?.vars),
        prompt_cache_options: config.prompt_cache_options,
        safety_identifier: renderVarsInObject(config.safety_identifier, context?.vars),
      });
      assertOpenAiApiModel(body.model, this.getApiUrl(config));
    } catch (error) {
      const detail =
        error instanceof z.ZodError
          ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : String(error);
      return { error: `Invalid OpenAI Decisions request: ${detail}` };
    }

    return withGenAISpan(
      {
        system: this.getGenAISystem(),
        operationName: 'chat',
        model: body.model,
        providerId: this.id(),
        evalId: context?.evaluationId,
        testIndex: context?.testIdx,
        promptLabel: context?.prompt?.label,
        traceparent: context?.traceparent,
        requestBody: typeof input === 'string' ? input : JSON.stringify(input),
      },
      () => this.callDecisions(body, config, apiKey, context, options),
      extractProviderResponseAttributes,
    );
  }

  private async callDecisions(
    body: DecisionRequest,
    config: DecisionsOptions,
    apiKey: string | undefined,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const headers = Object.fromEntries(
      Object.entries({
        ...(hasHeaderOverride(config.headers, 'Content-Type')
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(apiKey && !hasHeaderOverride(config.headers, 'Authorization')
          ? { Authorization: `Bearer ${apiKey}` }
          : {}),
        ...this.getOpenAiRequestHeaders(config.headers, config),
      }).filter(([name]) => name.toLowerCase() !== 'x-promptfoo-silent'),
    );
    const apiUrl = this.getApiUrl(config);
    // Snapshot implicit Cloud auth before async transport work, cache identity, and redaction.
    const cloudAuthHeaderName = isPromptfooCloudApiHost(apiUrl)
      ? getCloudAuthHeaderName()
      : undefined;
    const cloudAuth = getCloudBearerToken(apiUrl);
    if (cloudAuth && cloudAuthHeaderName && !hasHeaderOverride(headers, cloudAuthHeaderName)) {
      const url = new URL(apiUrl);
      // fetchWithProxy derives URL Basic auth before Cloud injection; keep that precedence.
      if (
        cloudAuthHeaderName.toLowerCase() !== 'authorization' ||
        !(url.username || url.password)
      ) {
        headers[cloudAuthHeaderName] = cloudAuth;
      }
    }
    // Some API errors echo the supplied credential. Keep it out of eval results as well as logs.
    const secrets = [
      apiKey,
      ...getUrlCredentials(apiUrl),
      ...Object.entries(headers)
        .filter(
          ([name, value]) =>
            name.toLowerCase() === cloudAuthHeaderName?.toLowerCase() ||
            isCredentialHeader(name, value),
        )
        .flatMap(([name, value]) => getHeaderCredentials(name, value)),
    ]
      .filter((secret): secret is string => Boolean(secret))
      .flatMap((secret) => {
        const variants = [secret, JSON.stringify(secret).slice(1, -1)];
        try {
          return [...variants, encodeURIComponent(secret)];
        } catch {
          // Invalid Unicode must still reach the existing request error handling.
          return variants;
        }
      });
    // Gateways can echo credentials in response bodies before provider-level redaction runs.
    headers['x-promptfoo-silent'] = 'true';
    // Longer credentials match before markers; single-character userinfo cannot erase words.
    // One pass preserves existing markers while redacting credentials that contain a marker.
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
    // Fixed structure and request-declared identities must survive credential collisions.
    // Only schema-declared fields may retain identities; diagnostic echoes still redact them.
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
          // Resolved snapshots may retain public model substrings, but not other credentials.
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
    // Only retain diagnostics used by the scheduler; gateways can echo arbitrary auth headers.
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
      const url = appendOpenAiApiPath(apiUrl, 'decisions');
      const transport = JSON.stringify([url, Array.from(new Headers(headers).entries()).sort()]);
      let scope = cacheScopes.get(transport);
      if (!scope) {
        scope = randomUUID();
        cacheScopes.set(transport, scope);
      }
      // Zod reconstructs each request object in schema order, canonicalizing its keys.
      const bust = this.shouldBustCache(context) || hasSensitiveValue(body);
      const cacheKey = bust
        ? undefined
        : `openai-decisions:${createHash('sha256')
            .update(JSON.stringify({ scope, body }))
            .digest('hex')}`;
      const response = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: options?.abortSignal,
          skipCloudAuthInjection: cloudAuthHeaderName !== undefined,
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
      // Reused responses must not replay stale rate-limit headers into the scheduler.
      const httpMetadata = cached ? {} : { http };
      const apiError = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
      if (status < 200 || status >= 300 || apiError.success) {
        await deleteFromCache?.();
        return {
          error: `OpenAI Decisions API error (${status}): ${errorText(
            apiError.success
              ? apiError.data.error.message
              : response.statusText || 'Request failed',
          )}`,
          metadata: httpMetadata,
        };
      }

      const result = decisionResponseSchema.safeParse(data);
      if (!result.success) {
        await deleteFromCache?.();
        return {
          error: 'Invalid OpenAI Decisions API response: answers or usage do not match the request',
          metadata: httpMetadata,
        };
      }
      const { answers, model, usage } = result.data;
      // Decisions pricing may differ from text generation; only use caller-supplied rates.
      const inputCost = config.inputCost ?? config.cost;
      const outputCost = config.outputCost ?? config.cost;
      const cost =
        inputCost !== undefined && outputCost !== undefined
          ? calculateOpenAIUsageCost(model, { ...config, inputCost, outputCost }, usage, {
              cachedResponse: cached,
            })
          : undefined;
      const accounting = {
        cached,
        latencyMs,
        tokenUsage: cached
          ? { total: usage.total_tokens, cached: usage.total_tokens }
          : {
              ...getResponsesTokenUsage(result.data, false),
              cached: usage.input_tokens_details?.cached_tokens,
            },
        ...(cost === undefined ? {} : { cost }),
      };
      if (!answersMatchDecisionQuestions(answers, body.questions)) {
        await deleteFromCache?.();
        return {
          ...accounting,
          error: 'Invalid OpenAI Decisions API response: answers or usage do not match the request',
          metadata: httpMetadata,
        };
      }
      return {
        ...accounting,
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
          error: `OpenAI Decisions API error: ${errorText(formatRateLimitErrorMessage(error))}`,
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
      return { error: `OpenAI Decisions API call failed: ${errorText(error)}` };
    }
  }
}
