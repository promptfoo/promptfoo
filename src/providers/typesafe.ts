/**
 * TypeSafe provider for Jev, a "System One" model. Jev does not generate text: it answers
 * typed questions (Noul, Score, Choice) about a `state` with calibrated probabilities.
 *
 * - As an `llm-rubric` grader, the rubric is asked about the graded output as a yes/no
 *   Noul question, or as a Score question when `levels` is configured.
 * - As a `classifier` provider, `instructions` and `labels` form a Choice question.
 * - As a regular provider, the prompt is the state, `questions` is sent as configured, and
 *   the output is Jev's answers.
 *
 * Drex, nace.ai's decision models, speak the same protocol: `./nace` subclasses this provider.
 *
 * API reference: https://docs.typesafe.ai/api
 */

import { fetchWithCache } from '../cache';
import { getEnvString, getProviderEnvString } from '../envars';
import logger from '../logger';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../util/fetch/errors';
import { rateLimitTimingFromHeaders } from '../util/fetch/index';
import { ellipsize } from '../util/text';
import { getRequestTimeoutMs } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../types/index';

const DEFAULT_THRESHOLD = 0.5;
// Without a Retry-After, the scheduler pauses a rate-limited provider for a minute.
// TypeSafe's own SDKs back off for at most five seconds.
const DEFAULT_RETRY_AFTER_MS = 2000;
// These graders read any JSON object without `pass` as a pass, so they must never
// receive Jev's answers.
const UNSUPPORTED_GRADER_LABELS = ['agent-rubric', 'trajectory:goal-success'];

/** The parts of the System One protocol that differ by vendor. Drex (`./nace`) shares the rest. */
export interface SystemOneVendor {
  /** The provider id prefix, also the key of the provider's `metadata`. */
  prefix: string;
  /** The vendor's name in messages. */
  name: string;
  /** The model's name in messages. */
  model: string;
  apiKeyEnvVar: EnvVarKey;
  defaultApiBaseUrl: string;
  /** Price per input token by the model id that answered; output tokens are free. */
  inputCostPerToken: Record<string, number>;
}

const TYPESAFE: SystemOneVendor = {
  prefix: 'typesafe',
  name: 'TypeSafe',
  model: 'Jev',
  apiKeyEnvVar: 'TYPESAFE_API_KEY',
  defaultApiBaseUrl: 'https://api.typesafe.ai',
  // https://docs.typesafe.ai/models: priced per input token; output tokens are free.
  inputCostPerToken: { 'jev-1.13.0': 0.042 / 1_000_000 },
};

/** Jev accepts a string, a JSON object, or an array wherever it takes content. */
export type TypeSafeEntry = string | Record<string, unknown> | unknown[];

export type TypeSafeQuestion =
  | {
      type: 'noul';
      instructions: TypeSafeEntry;
      criteria?: { true?: TypeSafeEntry; false?: TypeSafeEntry };
    }
  | { type: 'score'; instructions: TypeSafeEntry; criteria: TypeSafeEntry[] }
  | {
      type: 'choice';
      instructions: TypeSafeEntry;
      criteria: Record<string, TypeSafeEntry | null>;
    };

export interface TypeSafeConfig {
  apiKey?: string;
  /** Defaults to https://api.typesafe.ai */
  apiBaseUrl?: string;
  /** Regular provider: the questions to ask about each prompt, keyed by an id you choose. */
  questions?: Record<string, TypeSafeQuestion>;
  /** `llm-rubric`: minimum 0–1 score to pass. Defaults to 0.5. */
  threshold?: number;
  /** `llm-rubric`: ordered Score levels, low to high. Omit to ask a yes/no Noul question. */
  levels?: TypeSafeEntry[];
  /** `classifier`: what to decide. */
  instructions?: TypeSafeEntry;
  /** `classifier`: the options, as a list of labels or a label → description map. */
  labels?: string[] | Record<string, TypeSafeEntry | null>;
}

interface TypeSafeResponseBody {
  model?: string;
  answers?: Record<string, Record<string, unknown>>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

type TypeSafeResult =
  | { error: string; metadata?: ProviderResponse['metadata'] }
  | {
      answers: NonNullable<TypeSafeResponseBody['answers']>;
      /** Fields shared by every successful response, whichever question was asked. */
      response: ProviderResponse & { metadata: Record<string, Record<string, unknown>> };
      /** Evicts the response from the cache and reports it as malformed. */
      malformed: () => Promise<{ error: string }>;
    };

/** What a request needs besides its state and questions. */
export interface SystemOneRequestOptions {
  /** The provider config merged with the prompt's; a vendor may read its own fields from it. */
  config: TypeSafeConfig;
  /** The test's vars, for config fields that are templates. */
  vars?: CallApiContextParams['vars'];
  bustCache?: boolean;
  abortSignal?: AbortSignal;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Jev rejects content that is not a string, object, or array. Text that holds a JSON
 * object or array is sent as structure, which Jev can address by field name.
 */
function toEntry(value: unknown): TypeSafeEntry {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as TypeSafeEntry;
      }
    } catch {
      // Not JSON; send the text as written.
    }
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    return value as TypeSafeEntry;
  }
  return value === undefined ? '' : JSON.stringify(value);
}

/**
 * TypeSafe reports errors as `{detail}`, where `detail` is a string, an
 * `{error_type, message}` object, or a list of field validation errors.
 */
function formatErrorDetail(data: unknown): string {
  const detail = isPlainObject(data) && data.detail != null ? data.detail : data;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        isPlainObject(item) && Array.isArray(item.loc) && typeof item.msg === 'string'
          ? `${item.loc.join('.')}: ${item.msg}`
          : JSON.stringify(item),
      )
      .join('; ');
  }
  if (isPlainObject(detail)) {
    const text = [detail.message, detail.error_type].find((value) => typeof value === 'string');
    if (text) {
      return text as string;
    }
  }
  return JSON.stringify(detail) ?? '';
}

/** A failure the scheduler should back off from and retry, unless it is a hard quota. */
function rateLimited(
  error: string,
  http: { status: number; statusText: string },
  retryAfterMs: number | undefined,
  rateLimitKind: string = 'rate_limit',
) {
  const delay = String(Math.ceil(retryAfterMs ?? DEFAULT_RETRY_AFTER_MS));
  return {
    error,
    metadata: { rateLimitKind, http: { ...http, headers: { 'retry-after-ms': delay } } },
  };
}

export class TypeSafeProvider implements ApiProvider {
  modelName: string;
  config: TypeSafeConfig;
  env?: EnvOverrides;

  /** The vendor this provider talks to. A vendor with the same protocol overrides it. */
  protected get vendor(): SystemOneVendor {
    return TYPESAFE;
  }

  constructor(
    modelName: string,
    options: { config?: TypeSafeConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.config = config || {};
    this.env = env;
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `${this.vendor.prefix}:${this.modelName}`;
  }

  toString(): string {
    return `[${this.vendor.name} Provider ${this.modelName}]`;
  }

  requiresApiKey(): boolean {
    return true;
  }

  /** The error for a request with no API key. */
  protected missingApiKeyError(): string {
    const { name, apiKeyEnvVar } = this.vendor;
    return `${name} API key is not set. Set the ${apiKeyEnvVar} environment variable or add \`apiKey\` to the provider config.`;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getProviderEnvString(this.env, this.vendor.apiKeyEnvVar) ||
      getEnvString(this.vendor.apiKeyEnvVar)
    );
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { name, model } = this.vendor;
    const request: SystemOneRequestOptions = {
      config: { ...this.config, ...context?.prompt?.config },
      vars: context?.vars,
      bustCache: context?.bustCache ?? context?.debug,
      abortSignal: options?.abortSignal,
    };
    const label = context?.prompt?.label;

    // llm-rubric passes the rubric and the graded output as vars. The model reads those directly
    // instead of the rendered grading prompt, which is written for a text-generation model.
    if (label === 'llm-rubric' && context?.vars?.rubric !== undefined) {
      return this.grade(context.vars.rubric, context.vars.output, request);
    }
    if (label && UNSUPPORTED_GRADER_LABELS.includes(label)) {
      return {
        error: `${name} provider ${this.id()} cannot grade \`${label}\` assertions. ${model} grades only \`llm-rubric\` and \`classifier\`.`,
      };
    }

    const { questions } = request.config;
    if (!isPlainObject(questions) || Object.keys(questions).length === 0) {
      return {
        error: `${name} provider ${this.id()} needs \`questions\` in its config to answer prompts. To grade with ${model} instead, use it as the provider for \`llm-rubric\` or \`classifier\` assertions.`,
      };
    }
    const result = await this.ask(toEntry(prompt), questions, request);
    if ('error' in result) {
      return result;
    }
    return { ...result.response, output: result.answers };
  }

  async callClassificationApi(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderClassificationResponse> {
    const { instructions, labels } = this.config;
    if (!instructions || !labels) {
      return {
        error: `${this.vendor.name} provider ${this.id()} needs \`instructions\` and \`labels\` in its config to classify, for example \`instructions: Which team should handle this?\` and \`labels: [billing, technical, sales]\`.`,
      };
    }
    const criteria = Array.isArray(labels)
      ? Object.fromEntries(labels.map((label) => [label, null]))
      : labels;
    const result = await this.ask(
      toEntry(prompt),
      { classification: { type: 'choice', instructions, criteria } },
      { config: this.config, abortSignal: options?.abortSignal },
    );
    if ('error' in result) {
      return result;
    }

    const { probabilities } = result.answers.classification;
    if (!isPlainObject(probabilities) || !Object.values(probabilities).every(isFiniteNumber)) {
      return result.malformed();
    }
    const { cached, tokenUsage, metadata } = result.response;
    return {
      classification: probabilities as Record<string, number>,
      cached,
      tokenUsage,
      metadata,
    };
  }

  private async grade(
    rubric: unknown,
    output: unknown,
    request: SystemOneRequestOptions,
  ): Promise<ProviderResponse> {
    const { name, model, prefix } = this.vendor;
    const { levels } = request.config;
    const threshold = request.config.threshold ?? DEFAULT_THRESHOLD;
    // An invalid threshold must not pass every output: `score >= ''` is always true.
    if (typeof threshold !== 'number' || !(threshold >= 0 && threshold <= 1)) {
      return {
        error: `${name} \`threshold\` must be a number from 0 to 1, got ${JSON.stringify(threshold)}.`,
      };
    }
    if (levels !== undefined && (!Array.isArray(levels) || levels.length < 2)) {
      return {
        error: `${name} \`levels\` must list at least two Score levels, ordered low to high.`,
      };
    }

    let question: TypeSafeQuestion;
    try {
      const instructions = this.instructionEntry(rubric);
      question = levels
        ? {
            type: 'score',
            instructions,
            criteria: levels.map((level) => this.instructionEntry(level)),
          }
        : { type: 'noul', instructions };
    } catch (err) {
      return {
        error: `${name} request error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const result = await this.ask(toEntry(output), { grade: question }, request);
    if ('error' in result) {
      return result;
    }

    // A Noul is a probability. A Score is a probability-weighted position on levels 0..top.
    const answer = result.answers.grade;
    const raw = levels ? answer.score : answer.noul;
    const top = levels ? levels.length - 1 : 1;
    if (!isFiniteNumber(raw) || raw < 0 || raw > top) {
      return result.malformed();
    }

    // Scale to 0–1. Rounding keeps float error from the division out of the threshold comparison.
    const score = Number((raw / top).toFixed(6));
    const pass = score >= threshold;
    const comparison = `${pass ? '>=' : '<'} threshold ${threshold}`;
    // The model returns no rationale, so the reason states how the verdict was derived.
    const reason = levels
      ? `${model} Score ${raw} on levels 0–${top} (${score} normalized) ${comparison}; nearest level: ${ellipsize(JSON.stringify(levels[Math.round(raw)]) ?? '', 200)}`
      : `${model} Noul probability ${raw} ${comparison}`;

    return {
      ...result.response,
      output: { pass, score, reason },
      metadata: { [prefix]: { ...result.response.metadata[prefix], answer } },
    };
  }

  /**
   * A rubric or level as the question content. A vendor whose API takes only strings there
   * overrides this, and may throw to reject a value it cannot send.
   */
  protected instructionEntry(value: unknown): TypeSafeEntry {
    return toEntry(value);
  }

  /** The request body. A vendor adds its own fields here, and may throw to reject the request. */
  protected requestBody(
    state: TypeSafeEntry,
    questions: Record<string, TypeSafeQuestion>,
    _request: SystemOneRequestOptions,
  ): Record<string, unknown> {
    return { state, model: this.modelName, questions };
  }

  /**
   * Whether `answer` is a well-formed answer to `question`. The default accepts any object; a
   * vendor overrides this to check the answer's fields and bounds. A rejected response is
   * reported as malformed and evicted from the cache.
   */
  protected isValidAnswer(_question: TypeSafeQuestion, _answer: Record<string, unknown>): boolean {
    return true;
  }

  /** The text of an error response body. */
  protected formatErrorDetail(data: unknown): string {
    return formatErrorDetail(data);
  }

  /** Ask the model `questions` about `state`. */
  private async ask(
    state: TypeSafeEntry,
    questions: Record<string, TypeSafeQuestion>,
    request: SystemOneRequestOptions,
  ): Promise<TypeSafeResult> {
    const { name, model, prefix, defaultApiBaseUrl, inputCostPerToken } = this.vendor;
    const { bustCache, abortSignal } = request;
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { error: this.missingApiKeyError() };
    }

    let payload: string;
    try {
      payload = JSON.stringify(this.requestBody(state, questions, request));
    } catch (err) {
      return {
        error: `${name} request error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    logger.debug(`[${name}] Calling ${model}`, {
      model: this.modelName,
      questions: Object.keys(questions),
    });

    let fetched;
    try {
      // Read text so an error page or empty body still reports its HTTP status.
      fetched = await fetchWithCache<string>(
        `${this.config.apiBaseUrl || defaultApiBaseUrl}/v1/systemone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: payload,
          ...(abortSignal ? { signal: abortSignal } : {}),
        },
        getRequestTimeoutMs(),
        'text',
        bustCache,
      );
    } catch (err) {
      abortSignal?.throwIfAborted();
      if (err instanceof HttpRateLimitError) {
        // The transport's 429 retries are exhausted. Keep the server's timing for the scheduler.
        const detail = ellipsize(this.formatErrorDetail(err.body), 300);
        return rateLimited(
          `${name} API error: ${formatRateLimitErrorMessage(err, detail)}`,
          { status: err.status, statusText: err.statusText },
          err.retryAfterMs,
          err.kind,
        );
      }
      return { error: `${name} API call error: ${String(err)}` };
    }

    const { status, statusText, headers = {}, cached, latencyMs, deleteFromCache } = fetched;
    const requestId = headers['x-typesafe-request-id'];
    const requestIdText = requestId ? ` (request id ${requestId})` : '';
    let data: unknown = fetched.data;
    try {
      data = JSON.parse(fetched.data);
    } catch {
      // Not JSON; report the text as received.
    }

    if (status < 200 || status >= 300) {
      const detail = ellipsize(this.formatErrorDetail(data), 1000);
      const error = `${name} API error: ${[status, statusText].filter(Boolean).join(' ')}${requestIdText}${detail && `\n${detail}`}`;
      // Both vendors ask clients to back off and retry `529 Overloaded` like a rate limit, so
      // hand it to the scheduler as one. The transport already retries 429.
      return status === 529
        ? rateLimited(
            error,
            { status, statusText },
            rateLimitTimingFromHeaders(headers).retryAfterMs,
          )
        : { error };
    }

    const malformed = async () => {
      await deleteFromCache?.();
      return {
        error: `${name} API returned an unexpected response${requestIdText}: ${ellipsize(String(fetched.data), 1000)}`,
      };
    };
    const body = isPlainObject(data) ? (data as TypeSafeResponseBody) : undefined;
    const answers = body?.answers;
    // Every question must have its own answer, or assertions would run on partial output.
    const isAnswered = (id: string) =>
      Object.prototype.hasOwnProperty.call(answers, id) &&
      isPlainObject(answers?.[id]) &&
      this.isValidAnswer(questions[id], answers[id]);
    if (!body || !isPlainObject(answers) || !Object.keys(questions).every(isAnswered)) {
      return malformed();
    }

    const { input_tokens: prompt = 0, output_tokens: completion = 0 } = body.usage ?? {};
    const total = prompt + completion;
    const inputCost = inputCostPerToken[body.model ?? this.modelName];
    return {
      answers,
      malformed,
      response: {
        cached,
        latencyMs,
        tokenUsage: cached
          ? { cached: total, total }
          : { total, prompt, completion, numRequests: 1 },
        cost: inputCost === undefined ? undefined : prompt * inputCost,
        // The versioned model that answered; `jev-latest` and `drex-latest` are aliases that move.
        metadata: { [prefix]: { model: body.model, ...(requestId && { requestId }) } },
      },
    };
  }
}
