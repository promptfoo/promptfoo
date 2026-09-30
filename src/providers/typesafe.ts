/**
 * TypeSafe provider for Jev, a "System One" model.
 *
 * Jev does not generate text. It answers typed questions (Noul, Score, Choice) about a
 * `state` and returns calibrated probabilities. This provider maps promptfoo's grading
 * surfaces onto those questions:
 *
 * - `callApi` answers `llm-rubric` with a Noul question (or a Score question when `levels`
 *   are configured) and returns a `{pass, score, reason}` JSON string. Jev returns no
 *   rationale, so `reason` is a deterministic derivation from the answer, and the raw
 *   answer is kept in `metadata.typesafe`.
 * - `callClassificationApi` answers the `classifier` assertion with a Choice question and
 *   returns its label → probability map.
 *
 * API docs: https://docs.typesafe.ai/api
 */

import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import { HttpRateLimitError, isAbortError } from '../util/fetch/errors';
import { getFetchRetryContextMaxRetries } from '../util/fetch/retryContext';
import { sanitizeObject } from '../util/sanitizer';
import { ellipsize } from '../util/text';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiClassificationProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderResponse,
  TokenUsage,
} from '../types/index';
import type { FetchOptions } from '../util/fetch/types';

const DEFAULT_API_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_THRESHOLD = 0.5;
const GRADE_QUESTION_ID = 'grade';
const CLASSIFICATION_QUESTION_ID = 'classification';
const MIN_SCORE_LEVELS = 2;
const MAX_SCORE_LEVELS = 10;
const MIN_CHOICE_OPTIONS = 2;
const MAX_CHOICE_OPTIONS = 255;
const PROBABILITY_SUM_TOLERANCE = 0.0001;
// https://docs.typesafe.ai/models: Jev 1.13 costs $0.042 / million input tokens.
const JEV_1_13_INPUT_COST_PER_TOKEN = 0.042 / 1_000_000;

/** Jev accepts a string, a JSON object, or an array wherever it takes content. */
type TypeSafeEntry = string | Record<string, unknown> | unknown[];

export interface TypeSafeConfig {
  apiKey?: string;
  /** Defaults to https://api.typesafe.ai */
  apiBaseUrl?: string;
  /** Maximum additional attempts for retryable failures. Defaults to 4. */
  maxRetries?: number;
  /** `callApi` passes when the derived 0–1 score is >= threshold. Defaults to 0.5. */
  threshold?: number;
  /** Ordered Score levels, low to high (2–10). When set, `callApi` asks a Score question. */
  levels?: TypeSafeEntry[];
  /**
   * The question for `callClassificationApi`, and for `callApi` when no `llm-rubric`
   * rubric is available.
   */
  instructions?: TypeSafeEntry;
  /** Choice options for `callClassificationApi`: a list of labels or a label → description map. */
  labels?: string[] | Record<string, TypeSafeEntry | null>;
}

type TypeSafeQuestion =
  | { type: 'noul'; instructions: TypeSafeEntry }
  | { type: 'score'; instructions: TypeSafeEntry; criteria: TypeSafeEntry[] }
  | {
      type: 'choice';
      instructions: TypeSafeEntry;
      criteria: Record<string, TypeSafeEntry | null>;
    };

interface TypeSafeRequest {
  state: TypeSafeEntry;
  model: string;
  questions: Record<string, TypeSafeQuestion>;
}

interface TypeSafeResponse {
  model?: string;
  answers: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface TypeSafeNoulAnswer {
  type: 'noul';
  noul: number;
}

interface TypeSafeScoreAnswer {
  type: 'score';
  score: number;
  legend?: Record<string, unknown>;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface TypeSafeChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

type TypeSafeResult =
  | {
      data: TypeSafeResponse;
      cached: boolean;
      latencyMs?: number;
      requestId?: string;
      deleteFromCache?: () => Promise<void>;
    }
  | { error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Convert a promptfoo var into a Jev entry, keeping structured values structured. */
function toEntry(value: unknown): TypeSafeEntry {
  if (typeof value === 'string' || Array.isArray(value) || isPlainObject(value)) {
    return value;
  }
  if (value === undefined) {
    return '';
  }
  return JSON.stringify(value) ?? String(value);
}

function isEntry(value: unknown): value is TypeSafeEntry {
  return typeof value === 'string' || Array.isArray(value) || isPlainObject(value);
}

function hasEntry(value: unknown): value is TypeSafeEntry {
  return isEntry(value) && !(typeof value === 'string' && value.trim() === '');
}

function getOrderedLabels(question: TypeSafeQuestion): TypeSafeEntry[] {
  if (question.type === 'choice') {
    return Object.keys(question.criteria);
  }
  if (question.type === 'score') {
    return question.criteria;
  }
  return [];
}

/**
 * Build the cache key for a Jev request.
 *
 * The key covers the model, the state, the full question schema, the ordered labels (Choice
 * options or Score levels), so a changed candidate set never reuses a cached probability.
 * The pass threshold only changes local interpretation and is deliberately excluded.
 * The request is hashed exactly as sent rather than with sorted keys:
 * key order inside `state` and Choice `criteria` is model input. The API key is not part of
 * the key.
 */
export function getTypeSafeCacheKey(apiBaseUrl: string, request: TypeSafeRequest): string {
  const orderedLabels = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => [id, getOrderedLabels(question)]),
  );
  return `typesafe:v2:${request.model}:${sha256(
    JSON.stringify({
      apiBaseUrl,
      model: request.model,
      state: request.state,
      questions: request.questions,
      orderedLabels,
    }),
  )}`;
}

function safeErrorDetail(value: unknown, apiKey?: string): string {
  const sanitized = sanitizeObject(value, { sanitizeUrls: true });
  const detail = typeof sanitized === 'string' ? sanitized : (JSON.stringify(sanitized) ?? '');
  return ellipsize(apiKey ? detail.split(apiKey).join('[REDACTED]') : detail, 1000);
}

function formatTypeSafeError(
  status: number,
  statusText: string,
  data: unknown,
  requestId?: string,
  apiKey?: string,
  quota = false,
): string {
  const detail = safeErrorDetail(data, apiKey);
  const hints: Record<number, string> = {
    401: ' Check TYPESAFE_API_KEY or the `apiKey` provider config.',
    422: ' The request failed validation.',
    // The shared scheduler recognizes this marker as a non-retryable quota error.
    429: quota
      ? ' Quota exceeded: check your TypeSafe plan and billing.'
      : ' Rate limit exceeded; retry after a short delay.',
    529: ' TypeSafe is overloaded; retry after a short delay.',
  };
  const requestIdText = requestId ? ` (request id ${requestId})` : '';
  return safeErrorDetail(
    `TypeSafe API error: ${status} ${statusText || 'Unknown error'}${requestIdText}.${
      hints[status] ?? ''
    }${detail ? `\n${detail}` : ''}`,
    apiKey,
  );
}

function getAnswer(data: TypeSafeResponse, questionId: string, type: TypeSafeQuestion['type']) {
  const answer = data.answers[questionId];
  if (!isPlainObject(answer) || answer.type !== type) {
    throw new Error(
      `TypeSafe response has no ${type} answer for "${questionId}": ${ellipsize(
        JSON.stringify(data.answers) ?? '',
        500,
      )}`,
    );
  }
  return answer;
}

function getTokenUsage(data: TypeSafeResponse, cached: boolean): Partial<TokenUsage> {
  const usage = data.usage ?? {};
  const prompt =
    isFiniteNumber(usage.input_tokens) && usage.input_tokens >= 0 ? usage.input_tokens : 0;
  const completion =
    isFiniteNumber(usage.output_tokens) && usage.output_tokens >= 0 ? usage.output_tokens : 0;
  const total = prompt + completion;
  if (cached) {
    return { cached: total, total };
  }
  return { total, prompt, completion, numRequests: 1 };
}

function getCost(
  data: TypeSafeResponse,
  requestedModel: string,
  cached: boolean,
): number | undefined {
  if (cached) {
    return 0;
  }
  const inputTokens = data.usage?.input_tokens;
  if (
    (data.model ?? requestedModel) === 'jev-1.13.0' &&
    isFiniteNumber(inputTokens) &&
    inputTokens >= 0
  ) {
    return inputTokens * JEV_1_13_INPUT_COST_PER_TOKEN;
  }
  return undefined;
}

function getMaxRetries(configured: unknown): number {
  const maxRetries = configured ?? getFetchRetryContextMaxRetries() ?? 4;
  if (!isFiniteNumber(maxRetries) || !Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new Error('TypeSafe `maxRetries` must be a non-negative integer');
  }
  return maxRetries;
}

function getThreshold(threshold: unknown): number {
  if (threshold === undefined) {
    return DEFAULT_THRESHOLD;
  }
  if (!isFiniteNumber(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(
      `TypeSafe \`threshold\` must be a number between 0 and 1, got ${JSON.stringify(threshold)}`,
    );
  }
  return threshold;
}

function getLevels(levels: unknown): TypeSafeEntry[] | undefined {
  if (levels === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(levels) ||
    levels.length < MIN_SCORE_LEVELS ||
    levels.length > MAX_SCORE_LEVELS
  ) {
    throw new Error(
      `TypeSafe \`levels\` must be an array of ${MIN_SCORE_LEVELS}–${MAX_SCORE_LEVELS} level descriptions, ordered low to high`,
    );
  }
  if (!levels.every(isEntry)) {
    throw new Error('TypeSafe `levels` entries must be strings, JSON objects, or arrays');
  }
  return levels;
}

function getChoiceCriteria(labels: unknown): Record<string, TypeSafeEntry | null> {
  let criteria: Record<string, TypeSafeEntry | null>;
  if (Array.isArray(labels)) {
    if (labels.some((label) => typeof label !== 'string' || label.trim() === '')) {
      throw new Error('TypeSafe `labels` must be non-empty strings');
    }
    if (new Set(labels).size !== labels.length) {
      throw new Error('TypeSafe `labels` must not contain duplicates');
    }
    criteria = Object.fromEntries(labels.map((label) => [label, null]));
  } else if (isPlainObject(labels)) {
    if (Object.keys(labels).some((label) => label.trim() === '')) {
      throw new Error('TypeSafe `labels` must be non-empty strings');
    }
    if (
      Object.values(labels).some((description) => description !== null && !isEntry(description))
    ) {
      throw new Error(
        'TypeSafe `labels` descriptions must be strings, JSON objects, arrays, or null',
      );
    }
    criteria = labels as Record<string, TypeSafeEntry | null>;
  } else {
    throw new Error(
      'TypeSafe classification requires `labels` in the provider config: a list of labels or a label → description map',
    );
  }

  const count = Object.keys(criteria).length;
  if (count < MIN_CHOICE_OPTIONS || count > MAX_CHOICE_OPTIONS) {
    throw new Error(
      `TypeSafe \`labels\` must have ${MIN_CHOICE_OPTIONS}–${MAX_CHOICE_OPTIONS} options, got ${count}`,
    );
  }
  return criteria;
}

function deriveNoul(answer: Record<string, unknown>, threshold: number) {
  const { noul } = answer as unknown as TypeSafeNoulAnswer;
  if (!isFiniteNumber(noul) || noul < 0 || noul > 1) {
    throw new Error(`TypeSafe Noul answer is not a probability: ${JSON.stringify(answer)}`);
  }
  const pass = noul >= threshold;
  return {
    pass,
    score: noul,
    reason: `Derived from Jev Noul p=${noul} ${pass ? '>=' : '<'} threshold ${threshold}`,
  };
}

function deriveScore(answer: Record<string, unknown>, levels: TypeSafeEntry[], threshold: number) {
  const { score: rawScore, legend } = answer as unknown as TypeSafeScoreAnswer;
  const topLevel = levels.length - 1;
  if (!isFiniteNumber(rawScore) || rawScore < 0 || rawScore > topLevel) {
    throw new Error(
      `TypeSafe Score answer is outside levels 0–${topLevel}: ${JSON.stringify(answer)}`,
    );
  }

  // Normalize the unrounded, probability-weighted score to 0–1 over the level range.
  const score = rawScore / topLevel;
  const pass = score >= threshold;
  const nearestLevel = Math.round(rawScore);
  const levelLabel =
    (isPlainObject(legend) ? legend[String(nearestLevel)] : undefined) ?? levels[nearestLevel];
  const levelText = ellipsize(
    typeof levelLabel === 'string' ? levelLabel : (JSON.stringify(levelLabel) ?? ''),
    200,
  );
  return {
    pass,
    score,
    reason: `Derived from Jev Score ${rawScore} on levels 0–${topLevel} (normalized ${score} ${
      pass ? '>=' : '<'
    } threshold ${threshold}); nearest level ${nearestLevel}: "${levelText}"`,
  };
}

export class TypeSafeProvider implements ApiClassificationProvider {
  modelName: string;
  config: Omit<TypeSafeConfig, 'apiKey'>;
  private apiKey?: string;
  // Transport retries finish before returning; do not repeat them in the scheduler.
  handlesOwnRetries = true;

  constructor(
    modelName: string,
    options: { config?: TypeSafeConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    const { apiKey, ...restConfig } = config ?? {};
    this.apiKey = apiKey || env?.TYPESAFE_API_KEY || getEnvString('TYPESAFE_API_KEY');
    this.config = restConfig;
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
    return this.apiKey;
  }

  private getApiBaseUrl(): string {
    return (this.config.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * As an `llm-rubric` grader, the rubric becomes the question and the graded output becomes
   * the state. Outside that context, the prompt is the state and `instructions` is the question.
   */
  private buildGradingRequest(prompt: string, context?: CallApiContextParams): TypeSafeRequest {
    const vars = context?.prompt?.label === 'llm-rubric' ? context.vars : undefined;
    const isRubricGrading = vars?.rubric !== undefined;
    const instructions = isRubricGrading ? vars?.rubric : this.config.instructions;
    if (!hasEntry(instructions)) {
      throw new Error(
        `TypeSafe provider ${this.id()} needs a question: use it as the llm-rubric grader, or set \`instructions\` in the provider config`,
      );
    }

    const levels = getLevels(this.config.levels);
    const question: TypeSafeQuestion = levels
      ? { type: 'score', instructions, criteria: levels }
      : { type: 'noul', instructions };
    return {
      state: isRubricGrading ? toEntry(vars?.output) : prompt,
      model: this.modelName,
      questions: { [GRADE_QUESTION_ID]: question },
    };
  }

  private async sendRequest(
    request: TypeSafeRequest,
    cacheKey: string,
    bust?: boolean,
    abortSignal?: AbortSignal,
  ): Promise<TypeSafeResult> {
    if (!this.apiKey) {
      return {
        error:
          'TypeSafe API key is not set. Set the TYPESAFE_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    logger.debug('[TypeSafe] Calling Jev', {
      model: this.modelName,
      questionTypes: Object.values(request.questions).map((question) => question.type),
    });

    try {
      const maxRetries = getMaxRetries(this.config.maxRetries);
      if (abortSignal?.aborted) {
        throw new DOMException('TypeSafe request aborted', 'AbortError');
      }
      const requestOptions: FetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
        retryableStatusCodes: [529],
        ...(abortSignal ? { signal: abortSignal } : {}),
      };
      // The shared transport owns one retry budget for 429, 529, and network errors.
      // Read text so non-JSON failures retain their HTTP status and request id.
      const response = await fetchWithCache<string>(
        `${this.getApiBaseUrl()}/v1/systemone`,
        requestOptions,
        getRequestTimeoutMs(),
        'text',
        { bust, cacheKey },
        maxRetries,
      );
      if (abortSignal?.aborted) {
        throw new DOMException('TypeSafe request aborted', 'AbortError');
      }
      const { status, statusText, headers, latencyMs, deleteFromCache } = response;
      const requestId = headers?.['x-typesafe-request-id'];
      if (status < 200 || status >= 300) {
        return {
          error: formatTypeSafeError(status, statusText, response.data, requestId, this.apiKey),
        };
      }
      let data: unknown;
      try {
        data = JSON.parse(response.data);
      } catch {
        await deleteFromCache?.();
        return {
          error: `TypeSafe API returned a malformed non-JSON response (HTTP ${status}${requestId ? `; request id ${safeErrorDetail(requestId, this.apiKey)}` : ''}): ${safeErrorDetail(response.data, this.apiKey)}`,
        };
      }
      if (!isPlainObject(data) || !isPlainObject(data.answers)) {
        await deleteFromCache?.();
        return {
          error: `TypeSafe API returned a malformed response: ${safeErrorDetail(data, this.apiKey)}`,
        };
      }
      return {
        data: data as unknown as TypeSafeResponse,
        cached: response.cached || response.coalesced === true,
        latencyMs,
        requestId,
        deleteFromCache,
      };
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      if (abortSignal?.aborted) {
        throw new DOMException('TypeSafe request aborted', 'AbortError');
      }
      if (err instanceof HttpRateLimitError) {
        return {
          error: formatTypeSafeError(
            err.status,
            err.statusText,
            err.body,
            err.headers?.['x-typesafe-request-id'],
            this.apiKey,
            err.kind === 'quota',
          ),
        };
      }
      return { error: `TypeSafe API call error: ${safeErrorDetail(String(err), this.apiKey)}` };
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let request: TypeSafeRequest;
    let threshold: number;
    try {
      threshold = getThreshold(this.config.threshold);
      request = this.buildGradingRequest(prompt, context);
    } catch (err) {
      return { error: (err as Error).message };
    }

    const result = await this.sendRequest(
      request,
      getTypeSafeCacheKey(this.getApiBaseUrl(), request),
      context?.bustCache ?? context?.debug,
      options?.abortSignal,
    );
    if ('error' in result) {
      return { error: result.error };
    }

    const { data, cached, latencyMs, requestId } = result;
    const question = request.questions[GRADE_QUESTION_ID];
    try {
      const answer = getAnswer(data, GRADE_QUESTION_ID, question.type);
      const cost = getCost(data, this.modelName, cached);
      const derived =
        question.type === 'score'
          ? deriveScore(answer, question.criteria, threshold)
          : deriveNoul(answer, threshold);
      return {
        output: JSON.stringify(derived),
        cached,
        latencyMs,
        tokenUsage: getTokenUsage(data, cached),
        cost,
        metadata: {
          // Jev's raw decision. `output.reason` is derived from it, not written by the model.
          typesafe: {
            model: data.model,
            questionType: question.type,
            answer,
            threshold,
            ...(cost === undefined ? {} : { estimatedCost: cost }),
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    } catch (err) {
      await result.deleteFromCache?.();
      return {
        error: safeErrorDetail((err as Error).message, this.apiKey),
        cached,
        tokenUsage: getTokenUsage(data, cached),
        cost: getCost(data, this.modelName, cached),
      };
    }
  }

  async callClassificationApi(prompt: string): Promise<ProviderClassificationResponse> {
    let request: TypeSafeRequest;
    try {
      const { instructions } = this.config;
      if (!hasEntry(instructions)) {
        throw new Error(
          'TypeSafe classification requires `instructions` in the provider config, for example "Which label best describes this text?"',
        );
      }
      request = {
        state: prompt,
        model: this.modelName,
        questions: {
          [CLASSIFICATION_QUESTION_ID]: {
            type: 'choice',
            instructions,
            criteria: getChoiceCriteria(this.config.labels),
          },
        },
      };
    } catch (err) {
      return { error: (err as Error).message };
    }

    const result = await this.sendRequest(
      request,
      getTypeSafeCacheKey(this.getApiBaseUrl(), request),
    );
    if ('error' in result) {
      return { error: result.error };
    }

    try {
      const answer = getAnswer(result.data, CLASSIFICATION_QUESTION_ID, 'choice');
      const { probabilities, choice, confidence } = answer as unknown as TypeSafeChoiceAnswer;
      const question = request.questions[CLASSIFICATION_QUESTION_ID];
      const labels = question.type === 'choice' ? Object.keys(question.criteria) : [];
      if (
        !isPlainObject(probabilities) ||
        Object.keys(probabilities).length !== labels.length ||
        labels.some((label) => !Object.prototype.hasOwnProperty.call(probabilities, label)) ||
        Object.values(probabilities).some((p) => !isFiniteNumber(p) || p < 0 || p > 1) ||
        Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) >
          PROBABILITY_SUM_TOLERANCE
      ) {
        throw new Error(
          `TypeSafe Choice answer has invalid probabilities: ${JSON.stringify(answer)}`,
        );
      }
      if (
        typeof choice !== 'string' ||
        !Object.prototype.hasOwnProperty.call(probabilities, choice) ||
        probabilities[choice] < Math.max(...Object.values(probabilities))
      ) {
        throw new Error('TypeSafe Choice answer has an invalid chosen option');
      }
      if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('TypeSafe Choice answer has invalid confidence');
      }
      return { classification: { ...probabilities } };
    } catch (err) {
      await result.deleteFromCache?.();
      return { error: safeErrorDetail((err as Error).message, this.apiKey) };
    }
  }
}
