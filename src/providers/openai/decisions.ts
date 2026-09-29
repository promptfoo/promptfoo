import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import { extractProviderResponseAttributes, withGenAISpan } from '../../tracing/genaiTracer';
import { renderVarsInObject } from '../../util/render';
import { isNonCredentialHeader, sanitizeObject } from '../../util/sanitizer';
import { normalizeResponsesInput } from '../responses/input';
import { getResponsesTokenUsage } from '../responses/processor';
import { getRequestTimeoutMs } from '../shared';
import { calculateOpenAIUsageCost } from './billing';
import { hasHeaderOverride, OpenAiGenericProvider } from './index';
import { appendOpenAiApiPath, assertOpenAiApiModel, hasSensitiveOpenAiCacheString } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

const choiceValue = z.union([z.string(), z.boolean()]);
const probability = z.number().min(0).max(1);
const questionFields = { name: z.string().optional(), instructions: z.string() };
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
      levels: z
        .array(z.object({ label: z.string(), description: z.string().optional() }).strict())
        .min(2)
        .max(10),
    })
    .strict(),
]);
const questionsSchema = z
  .array(questionSchema)
  .min(1)
  .max(64)
  .refine(
    (questions) => {
      const names = questions.flatMap((question) =>
        question.name === undefined ? [] : [question.name],
      );
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
              image_url: z.string(),
              detail: z.enum(['auto', 'low', 'high', 'original']).optional(),
            }),
          ]),
        ),
      ]),
    }),
  ),
]);
const requestSchema = z.object({
  model: z.string().trim().min(1),
  input: inputSchema,
  questions: questionsSchema,
  safety_identifier: z.string().max(64).nullable().optional(),
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
  usage: z.object({
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
  }),
});

interface DecisionsOptions extends OpenAiSharedOptions {
  model?: string;
  questions?: z.infer<typeof questionsSchema>;
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
      if (answer.type === 'choice' && question.type === 'choice') {
        return (
          question.choices.some(({ value }) => value === answer.choice) &&
          answer.probabilities.length === question.choices.length &&
          answer.probabilities.every(({ value }, i) => value === question.choices[i].value)
        );
      }
      if (answer.type === 'score' && question.type === 'score') {
        return (
          answer.score <= question.levels.length - 1 &&
          answer.probabilities.length === question.levels.length &&
          answer.probabilities.every(
            ({ value, label }, i) => value === i && label === question.levels[i].label,
          )
        );
      }
      return answer.type === question.type;
    })
  );
}

export class OpenAiDecisionsProvider extends OpenAiGenericProvider {
  declare config: DecisionsOptions;

  // Transport credentials remain in memory; only random namespaces reach the disk cache.
  private readonly cacheScopes = new Map<string, string>();

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
    const apiKey = this.getApiKey(config);
    if ((config.apiKeyRequired ?? true) && !apiKey) {
      throw new Error(this.getMissingApiKeyErrorMessage(config));
    }

    let body: z.infer<typeof requestSchema>;
    try {
      let input: unknown = prompt;
      if (prompt.trimStart().startsWith('[')) {
        try {
          input = normalizeResponsesInput(JSON.parse(prompt));
        } catch {
          // Brackets also begin ordinary text, such as log prefixes and Markdown checklists.
        }
      }
      body = requestSchema.parse({
        model: context?.prompt?.config?.model ?? this.modelName,
        input,
        questions: renderVarsInObject(config.questions, context?.vars),
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
        requestBody: prompt,
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
    const headers = {
      ...(hasHeaderOverride(config.headers, 'Content-Type')
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(apiKey && !hasHeaderOverride(config.headers, 'Authorization')
        ? { Authorization: `Bearer ${apiKey}` }
        : {}),
      ...this.getOpenAiRequestHeaders(config.headers, config),
    };
    // Some API errors echo the supplied credential. Keep it out of eval results as well as logs.
    const errorText = (value: unknown): string => {
      let message = String(sanitizeObject(String(value), { sanitizeUrls: true }));
      const secrets = [
        apiKey,
        ...Object.entries(headers)
          .filter(([name]) => !isNonCredentialHeader(name))
          .map(([, value]) => value.replace(/^Bearer\s+/i, '')),
      ];
      for (const secret of secrets) {
        if (secret) {
          message = message.replaceAll(secret, '[REDACTED]');
        }
      }
      return message;
    };

    let deleteFromCache: (() => Promise<void>) | undefined;
    try {
      const url = appendOpenAiApiPath(this.getApiUrl(config), 'decisions');
      const transport = JSON.stringify([url, Array.from(new Headers(headers).entries()).sort()]);
      let scope = this.cacheScopes.get(transport);
      if (!scope) {
        scope = randomUUID();
        this.cacheScopes.set(transport, scope);
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
        },
        getRequestTimeoutMs(),
        'json',
        { bust, cacheKey, repeatIndex: context?.repeatIndex },
        config.maxRetries,
      );
      deleteFromCache = response.deleteFromCache;
      const { data, status, latencyMs } = response;
      const cached = response.cached || response.coalesced === true;
      const apiError = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
      if (status < 200 || status >= 300 || apiError.success) {
        await deleteFromCache?.();
        return {
          error: `OpenAI Decisions API error (${status}): ${errorText(
            apiError.success
              ? apiError.data.error.message
              : response.statusText || 'Request failed',
          )}`,
        };
      }

      const result = responseSchema.safeParse(data);
      if (!result.success || !answersMatchQuestions(result.data.answers, body.questions)) {
        await deleteFromCache?.();
        return {
          error: 'Invalid OpenAI Decisions API response: answers or usage do not match the request',
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
      return {
        output: JSON.stringify({ answers }),
        raw: data,
        metadata: { model },
        cached,
        latencyMs,
        tokenUsage: cached
          ? { total: usage.total_tokens, cached: usage.total_tokens }
          : {
              ...getResponsesTokenUsage(result.data, false),
              ...(usage.input_tokens_details?.cached_tokens === undefined
                ? {}
                : { cached: usage.input_tokens_details.cached_tokens }),
            },
        ...(answers.every((answer) => answer.type === 'refusal') ? { isRefusal: true } : {}),
        ...(cost === undefined ? {} : { cost }),
      };
    } catch (error) {
      await deleteFromCache?.();
      return { error: `OpenAI Decisions API call failed: ${errorText(error)}` };
    }
  }
}
