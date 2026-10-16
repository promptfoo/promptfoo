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
import { normalizeResponsesInput } from '../responses/input';
import { getResponsesTokenUsage } from '../responses/processor';
import { getRequestTimeoutMs } from '../shared';
import { decodeUrlComponent } from '../urlEncoding';
import { calculateOpenAIUsageCost } from './billing';
import { hasHeaderOverride, OpenAiGenericProvider } from './index';
import { appendOpenAiApiPath, assertOpenAiApiModel, hasSensitiveOpenAiCacheString } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

// Equivalent grader instances share random namespaces within this process. Credentials stay
// only in bounded memory, expire after inactivity, and never enter persisted cache keys.
const cacheScopes = new LRUCache<string, string>({
  max: 256,
  ttl: 30 * 60 * 1000,
  ttlAutopurge: true,
  updateAgeOnGet: true,
});

const choiceValue = z.union([z.string(), z.boolean()]);
const probability = z.number().min(0).max(1);
// Promptfoo allows one percentage point of rounding error, plus floating-point slack.
const DISTRIBUTION_TOLERANCE = 0.01 + 1e-12;
const questionFields = { name: z.string().optional(), instructions: z.string() };
const levelSchema = z.object({ label: z.string(), description: z.string().optional() }).strict();
const gradingLevelsSchema = z
  .array(z.union([z.string().transform((label) => ({ label })), levelSchema]))
  .min(2)
  .max(10);
const questionSchema = z.discriminatedUnion('type', [
  z.object({ ...questionFields, type: z.literal('predicate') }).strict(),
  z
    .object({
      ...questionFields,
      type: z.literal('choice'),
      choices: z
        .array(z.object({ value: choiceValue, description: z.string().optional() }).strict())
        .min(2)
        .max(255)
        .refine(
          (choices) => new Set(choices.map((choice) => choice.value)).size === choices.length,
          {
            message: 'Choice values must be unique within the question',
          },
        ),
    })
    .strict(),
  z
    .object({
      ...questionFields,
      type: z.literal('score'),
      levels: z.array(levelSchema).min(2).max(10),
    })
    .strict(),
]);
const questionsSchema = z
  .array(questionSchema)
  .min(1)
  .refine(
    (questions) => {
      const names = questions.map(({ name }) => name).filter((name) => name !== undefined);
      return new Set(names).size === names.length;
    },
    { message: 'Question names must be unique within the request' },
  );

const inputSchema = z.union([
  z.string(),
  z.array(
    z.object({
      type: z.literal('message').optional(),
      role: z.literal('user'),
      content: z.union([
        z.string(),
        z.array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('input_text'), text: z.string() }),
            z.object({
              type: z.literal('input_image'),
              image_url: z
                .string()
                .regex(
                  /^data:image\/[^;,]+;base64,/i,
                  'Decisions images must be inline base64 data URLs',
                ),
              detail: z.enum(['auto', 'low', 'high', 'original']).nullable().optional(),
            }),
          ]),
        ),
      ]),
    }),
  ),
]);
const requestSchema = z.object({
  model: z.string().trim().min(1),
  input: inputSchema.refine(
    (input) =>
      typeof input === 'string' ||
      input.reduce(
        (count, message) =>
          count +
          (Array.isArray(message.content)
            ? message.content.filter((part) => part.type === 'input_image').length
            : 0),
        0,
      ) <= 128,
    { message: 'Decisions accepts at most 128 images per request' },
  ),
  questions: questionsSchema,
  safety_identifier: z.string().max(128).nullable().optional(),
});

const answerName = { name: z.string().nullable() };
const answerSchema = z.discriminatedUnion('type', [
  z.object({ ...answerName, type: z.literal('refusal') }),
  z.object({ ...answerName, type: z.literal('predicate'), probability }),
  z.object({
    ...answerName,
    type: z.literal('choice'),
    choice: choiceValue,
    confidence: probability,
    probabilities: z.array(z.object({ value: choiceValue, probability })),
  }),
  z.object({
    ...answerName,
    type: z.literal('score'),
    score: z.number().nonnegative(),
    confidence: probability,
    probabilities: z.array(z.object({ value: z.number().int(), label: z.string(), probability })),
  }),
]);
const tokenCount = z.number().int().nonnegative();
const responseSchema = z.object({
  model: z.string().min(1),
  answers: z.array(answerSchema),
  usage: z
    .object({
      input_tokens: tokenCount,
      output_tokens: tokenCount,
      total_tokens: tokenCount,
      input_tokens_details: z
        .object({ cached_tokens: tokenCount.optional(), cache_write_tokens: tokenCount.optional() })
        .passthrough()
        .optional(),
      output_tokens_details: z
        .object({ reasoning_tokens: tokenCount.optional() })
        .passthrough()
        .optional(),
    })
    .refine(
      ({ input_tokens, output_tokens, total_tokens }) =>
        total_tokens === input_tokens + output_tokens,
    ),
});

interface DecisionsOptions extends OpenAiSharedOptions {
  model?: string;
  questions?: z.infer<typeof questionsSchema>;
  safety_identifier?: string | null;
  /** llm-rubric: minimum normalized score to pass. */
  threshold?: number;
  /** llm-rubric: ordered score levels, low to high. Omit for a predicate. */
  levels?: Array<string | z.infer<typeof levelSchema>>;
  /** classifier: what to decide and the possible string labels. */
  instructions?: string;
  labels?: string[] | Record<string, string | null>;
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

/** Check correspondence before an eval can mistake a malformed result for a successful answer. */
function answersMatchQuestions(
  answers: z.infer<typeof answerSchema>[],
  questions: z.infer<typeof questionsSchema>,
): boolean {
  return (
    answers.length === questions.length &&
    answers.every((answer, index) => {
      const question = questions[index];
      if (answer.name !== (question.name ?? null)) {
        return false;
      }
      if (answer.type === 'refusal') {
        return true;
      }
      if (
        (answer.type === 'choice' || answer.type === 'score') &&
        Math.abs(answer.probabilities.reduce((sum, item) => sum + item.probability, 0) - 1) >
          DISTRIBUTION_TOLERANCE
      ) {
        return false;
      }
      if (answer.type === 'choice' && question.type === 'choice') {
        return (
          question.choices.some(({ value }) => value === answer.choice) &&
          answer.probabilities.length === question.choices.length &&
          new Set(answer.probabilities.map(({ value }) => value)).size ===
            question.choices.length &&
          answer.probabilities.every(({ value }) =>
            question.choices.some((choice) => choice.value === value),
          )
        );
      }
      if (answer.type === 'score' && question.type === 'score') {
        const maxScore = question.levels.length - 1;
        const expectedScore = answer.probabilities.reduce(
          (sum, item) => sum + item.value * item.probability,
          0,
        );
        return (
          answer.score <= maxScore &&
          Math.abs(answer.score - expectedScore) / maxScore <= DISTRIBUTION_TOLERANCE &&
          answer.probabilities.length === question.levels.length &&
          new Set(answer.probabilities.map(({ value }) => value)).size === question.levels.length &&
          answer.probabilities.every(
            ({ value, label }) => value >= 0 && label === question.levels[value]?.label,
          )
        );
      }
      return answer.type === question.type;
    })
  );
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
    let input: unknown = prompt;
    if (prompt.trimStart().startsWith('[')) {
      try {
        input = normalizeResponsesInput(JSON.parse(prompt));
      } catch {
        // Brackets also begin ordinary text, such as log prefixes and Markdown checklists.
      }
    }
    return this.ask(input, config, context, options);
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
    const answer = responseSchema.parse(result.raw).answers[0];
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
    // The matcher puts attachments in the rendered prompt, while vars.output may be only a
    // placeholder. Reject actual media parts rather than grading that placeholder as evidence.
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
            'OpenAI Decisions `llm-rubric` supports text output only; media attachments are not supported.',
        };
      }
    } catch {
      // Plain-text grading prompts have no structured attachments.
    }
    const threshold = probability.safeParse(config.threshold ?? 0.5);
    if (!threshold.success) {
      return { error: 'OpenAI Decisions `threshold` must be a number from 0 to 1.' };
    }
    const { rubric, output } = context.vars;
    if (rubric === undefined || output === undefined) {
      return { error: 'OpenAI Decisions `llm-rubric` requires rubric and output variables.' };
    }
    const levels =
      config.levels === undefined ? undefined : gradingLevelsSchema.safeParse(config.levels);
    if (levels && !levels.success) {
      return {
        error:
          'OpenAI Decisions `levels` must list 2 to 10 strings or {label, description?} objects, ordered low to high.',
      };
    }
    const instructions = typeof rubric === 'string' ? rubric : JSON.stringify(rubric);
    const question: z.infer<typeof questionSchema> = levels?.success
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
    const answer = responseSchema.parse(result.raw).answers[0];
    if (answer.type !== 'predicate' && answer.type !== 'score') {
      return {
        ...result,
        output: undefined,
        error: 'OpenAI Decisions refused to grade the output.',
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

    let body: z.infer<typeof requestSchema>;
    try {
      body = requestSchema.parse({
        model: this.modelName,
        input,
        questions:
          context?.isGrading && context.prompt.label === 'llm-rubric'
            ? config.questions
            : renderVarsInObject(config.questions, context?.vars),
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
    body: z.infer<typeof requestSchema>,
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
        if (schema === responseSchema.shape.model) {
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
            data: responseData(data, responseSchema),
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

      const result = responseSchema.safeParse(data);
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
      if (!answersMatchQuestions(answers, body.questions)) {
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
