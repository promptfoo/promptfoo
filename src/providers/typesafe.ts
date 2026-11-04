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
 * API reference: https://docs.typesafe.ai/api
 */

import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../util/fetch/errors';
import { rateLimitTimingFromHeaders } from '../util/fetch/index';
import { ellipsize } from '../util/text';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
} from '../types/index';

const DEFAULT_API_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_THRESHOLD = 0.5;
// Without a Retry-After, the scheduler pauses a rate-limited provider for a minute.
// TypeSafe's own SDKs back off for at most five seconds.
const DEFAULT_RETRY_AFTER_MS = 2000;
// These graders read any JSON object without `pass` as a pass, so they must never
// receive Jev's answers.
const UNSUPPORTED_GRADER_LABELS = ['agent-rubric', 'trajectory:goal-success'];
// https://docs.typesafe.ai/models: priced per input token; output tokens are free.
const INPUT_COST_PER_TOKEN: Record<string, number> = {
  'jev-1.13.0': 0.042 / 1_000_000,
};

/** Jev accepts a string, a JSON object, or an array wherever it takes content. */
type TypeSafeEntry = string | Record<string, unknown> | unknown[];

type TypeSafeQuestion =
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
      response: ProviderResponse & { metadata: { typesafe: Record<string, unknown> } };
      /** Evicts the response from the cache and reports it as malformed. */
      malformed: () => Promise<{ error: string }>;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
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
    return `typesafe:${this.modelName}`;
  }

  toString(): string {
    return `[TypeSafe Provider ${this.modelName}]`;
  }

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.TYPESAFE_API_KEY || getEnvString('TYPESAFE_API_KEY');
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config: TypeSafeConfig = { ...this.config, ...context?.prompt?.config };
    const bustCache = context?.bustCache ?? context?.debug;
    const abortSignal = options?.abortSignal;
    const label = context?.prompt?.label;

    // llm-rubric passes the rubric and the graded output as vars. Jev reads those directly
    // instead of the rendered grading prompt, which is written for a text-generation model.
    if (label === 'llm-rubric' && context?.vars?.rubric !== undefined) {
      return this.grade(context.vars.rubric, context.vars.output, config, bustCache, abortSignal);
    }
    if (label && UNSUPPORTED_GRADER_LABELS.includes(label)) {
      return {
        error: `TypeSafe provider ${this.id()} cannot grade \`${label}\` assertions. Jev grades only \`llm-rubric\` and \`classifier\`.`,
      };
    }

    const { questions } = config;
    if (!isPlainObject(questions) || Object.keys(questions).length === 0) {
      return {
        error: `TypeSafe provider ${this.id()} needs \`questions\` in its config to answer prompts. To grade with Jev instead, use it as the provider for \`llm-rubric\` or \`classifier\` assertions.`,
      };
    }
    const result = await this.ask(toEntry(prompt), questions, bustCache, abortSignal);
    if ('error' in result) {
      return result;
    }
    return { ...result.response, output: result.answers };
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    const { instructions, labels } = this.config;
    if (!instructions || !labels) {
      return {
        error: `TypeSafe provider ${this.id()} needs \`instructions\` and \`labels\` in its config to classify, for example \`instructions: Which team should handle this?\` and \`labels: [billing, technical, sales]\`.`,
      };
    }
    const criteria = Array.isArray(labels)
      ? Object.fromEntries(labels.map((label) => [label, null]))
      : labels;
    const result = await this.ask(toEntry(prompt), {
      classification: { type: 'choice', instructions, criteria },
    });
    if ('error' in result) {
      return result;
    }

    const { probabilities } = result.answers.classification;
    if (!isPlainObject(probabilities) || !Object.values(probabilities).every(isFiniteNumber)) {
      return result.malformed();
    }
    return { classification: probabilities as Record<string, number> };
  }

  private async grade(
    rubric: unknown,
    output: unknown,
    config: TypeSafeConfig,
    bustCache?: boolean,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const { levels } = config;
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    // An invalid threshold must not pass every output: `score >= ''` is always true.
    if (typeof threshold !== 'number' || !(threshold >= 0 && threshold <= 1)) {
      return {
        error: `TypeSafe \`threshold\` must be a number from 0 to 1, got ${JSON.stringify(threshold)}.`,
      };
    }
    if (levels !== undefined && (!Array.isArray(levels) || levels.length < 2)) {
      return {
        error: 'TypeSafe `levels` must list at least two Score levels, ordered low to high.',
      };
    }

    const instructions = toEntry(rubric);
    const question: TypeSafeQuestion = levels
      ? { type: 'score', instructions, criteria: levels.map(toEntry) }
      : { type: 'noul', instructions };
    const result = await this.ask(toEntry(output), { grade: question }, bustCache, abortSignal);
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
    // Jev returns no rationale, so the reason states how the verdict was derived.
    const reason = levels
      ? `Jev Score ${raw} on levels 0–${top} (${score} normalized) ${comparison}; nearest level: ${ellipsize(JSON.stringify(levels[Math.round(raw)]) ?? '', 200)}`
      : `Jev Noul probability ${raw} ${comparison}`;

    return {
      ...result.response,
      output: { pass, score, reason },
      metadata: { typesafe: { ...result.response.metadata.typesafe, answer } },
    };
  }

  /** Ask Jev `questions` about `state`. */
  private async ask(
    state: TypeSafeEntry,
    questions: Record<string, TypeSafeQuestion>,
    bustCache?: boolean,
    abortSignal?: AbortSignal,
  ): Promise<TypeSafeResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'TypeSafe API key is not set. Set the TYPESAFE_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    logger.debug('[TypeSafe] Calling Jev', {
      model: this.modelName,
      questions: Object.keys(questions),
    });

    let fetched;
    try {
      // Read text so an error page or empty body still reports its HTTP status.
      fetched = await fetchWithCache<string>(
        `${this.config.apiBaseUrl || DEFAULT_API_BASE_URL}/v1/systemone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ state, model: this.modelName, questions }),
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
        const detail = ellipsize(formatErrorDetail(err.body), 300);
        return rateLimited(
          `TypeSafe API error: ${formatRateLimitErrorMessage(err, detail)}`,
          { status: err.status, statusText: err.statusText },
          err.retryAfterMs,
          err.kind,
        );
      }
      return { error: `TypeSafe API call error: ${String(err)}` };
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
      const detail = ellipsize(formatErrorDetail(data), 1000);
      const error = `TypeSafe API error: ${[status, statusText].filter(Boolean).join(' ')}${requestIdText}${detail && `\n${detail}`}`;
      // TypeSafe asks clients to back off and retry `529 Overloaded` like a rate limit, so
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
        error: `TypeSafe API returned an unexpected response${requestIdText}: ${ellipsize(String(fetched.data), 1000)}`,
      };
    };
    const body = isPlainObject(data) ? (data as TypeSafeResponseBody) : undefined;
    const answers = body?.answers;
    // Every question must have its own answer, or assertions would run on partial output.
    const isAnswered = (id: string) =>
      Object.prototype.hasOwnProperty.call(answers, id) && isPlainObject(answers?.[id]);
    if (!body || !isPlainObject(answers) || !Object.keys(questions).every(isAnswered)) {
      return malformed();
    }

    const { input_tokens: prompt = 0, output_tokens: completion = 0 } = body.usage ?? {};
    const total = prompt + completion;
    const inputCost = INPUT_COST_PER_TOKEN[body.model ?? this.modelName];
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
        // The versioned model that answered; `jev-latest` is an alias that moves.
        metadata: { typesafe: { model: body.model, ...(requestId && { requestId }) } },
      },
    };
  }
}
