import { fetchWithCache } from '../../cache';
import { parseDataUrl } from '../../util/dataUrl';
import {
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isAbortError,
} from '../../util/fetch/errors';
import { renderVarsInObject } from '../../util/render';
import {
  type DecisionGradingConfig,
  decisionLabelEntries,
  gradeDecisionScore,
  makeNoulOrScoreQuestion,
  readTextDecisionRubric,
  resolveDecisionThreshold,
} from '../decisionGrading';
import { getRequestTimeoutMs } from '../shared';
import {
  type DecisionAnswers,
  decisionsQuestionsSchema,
  parseDecisionsResponse,
} from './decisionSchema';
import { calculateGoogleCost, getGoogleApiBaseUrl, getNativeGeminiApiKey } from './util';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderClassificationResponse,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import type { GoogleProviderConfig } from './types';

type DecisionsConfig = GoogleProviderConfig & DecisionGradingConfig & { questions?: unknown };
type DecisionsResult =
  | (Omit<ProviderResponse, 'output' | 'error'> & { output: DecisionAnswers })
  | { error: string; metadata?: ProviderResponse['metadata'] };

const mediaTypes = new Set(['image', 'audio', 'video', 'document']);

function isContentBlock(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  if (value.type === 'text') {
    return 'text' in value && typeof value.text === 'string';
  }
  return (
    typeof value.type === 'string' &&
    mediaTypes.has(value.type) &&
    (('uri' in value && typeof value.uri === 'string') ||
      ('data' in value && typeof value.data === 'string'))
  );
}

// Promptfoo loads image file vars as data URLs, but the API accepts only raw base64 `data`.
function toNativeBlock(block: Record<string, unknown>): Record<string, unknown> {
  const dataUrl = typeof block.data === 'string' ? parseDataUrl(block.data) : null;
  return dataUrl
    ? { ...block, data: dataUrl.base64Data, mime_type: block.mime_type ?? dataUrl.mimeType }
    : block;
}

// An ordinary JSON document can itself be the text being classified.
function parseDecisionInput(prompt: string): string | Record<string, unknown> | unknown[] {
  try {
    const value: unknown = JSON.parse(prompt);
    if (isContentBlock(value)) {
      return toNativeBlock(value);
    }
    if (Array.isArray(value) && value.length > 0 && value.every(isContentBlock)) {
      return value.map(toNativeBlock);
    }
  } catch {
    // Plain text is a native Decisions input.
  }
  return prompt;
}

export class GoogleDecisionsProvider implements ApiProvider {
  readonly config: DecisionsConfig;
  readonly handlesOwnRetries = true;

  constructor(
    readonly modelName: string,
    private readonly options: ProviderOptions<DecisionsConfig> = {},
  ) {
    this.config = options.config ?? {};
  }

  id(): string {
    return this.options.id ?? `google:decisions:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return getNativeGeminiApiKey(this.config, this.options.env);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (context?.isGrading) {
      return this.grade(prompt, context, options);
    }
    const questions = context?.prompt?.config?.questions ?? this.config.questions;
    return this.ask(
      parseDecisionInput(prompt),
      renderVarsInObject(questions, context?.vars),
      options,
    );
  }

  private async grade(
    prompt: string,
    context: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (context.prompt.label !== 'llm-rubric') {
      return {
        error: `Gemini Decisions cannot grade \`${context.prompt.label}\` assertions. Use llm-rubric or classifier.`,
      };
    }
    const rubric = readTextDecisionRubric(prompt, context.vars, 'Gemini Decisions');
    if ('error' in rubric) {
      return rubric;
    }
    const { levels, threshold: configuredThreshold } = { ...this.config, ...context.prompt.config };
    const threshold = resolveDecisionThreshold(configuredThreshold);
    if (threshold === undefined) {
      return { error: 'Gemini Decisions threshold must be a number from 0 to 1.' };
    }
    const question = makeNoulOrScoreQuestion(rubric.instructions, levels);
    const result = await this.ask(rubric.input, { grade: question }, options);
    if ('error' in result) {
      return result;
    }
    const answer = result.output.grade;
    if (answer.type === 'choice') {
      return { error: 'Missing Gemini Decisions rubric score.' };
    }
    const top = question.type === 'score' ? question.criteria.length - 1 : 1;
    const { pass, score } = gradeDecisionScore(
      answer.type === 'noul' ? answer.noul : answer.score,
      top,
      threshold,
    );
    return {
      ...result,
      output: {
        pass,
        score,
        ...(!pass && { reason: `Gemini Decisions score ${score} < threshold ${threshold}` }),
      },
    };
  }

  async callClassificationApi(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderClassificationResponse> {
    const { instructions, labels } = this.config;
    if (
      !instructions ||
      !labels ||
      typeof labels !== 'object' ||
      (Array.isArray(labels) &&
        (!labels.every((label) => typeof label === 'string') ||
          new Set(labels).size !== labels.length))
    ) {
      return { error: 'Gemini Decisions classifier requires instructions and distinct labels.' };
    }
    const criteria = Object.fromEntries(
      decisionLabelEntries(labels).map(([label, description]) => [label, description ?? '']),
    );
    const result = await this.ask(
      prompt,
      { classification: { type: 'choice', instructions, criteria } },
      options,
    );
    if ('error' in result) {
      return result;
    }
    const { output, ...response } = result;
    const answer = output.classification;
    return answer.type === 'choice'
      ? { ...response, classification: answer.probabilities }
      : { ...response, error: 'Missing Gemini Decisions classifier probabilities.' };
  }

  private async ask(
    input: ReturnType<typeof parseDecisionInput>,
    questions: unknown,
    options?: CallApiOptionsParams,
  ): Promise<DecisionsResult> {
    const signal = options?.abortSignal;
    signal?.throwIfAborted();
    if (this.config.vertexai) {
      return {
        error: 'Gemini Decisions requires the Gemini Developer API. Set vertexai to false.',
      };
    }
    const parsed = decisionsQuestionsSchema.safeParse(questions);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        error: `Invalid Gemini Decisions questions at ${['questions', ...issue.path].join('.')}: ${issue.message}`,
      };
    }
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'Gemini Decisions requires an API key. Set GOOGLE_API_KEY or GEMINI_API_KEY, or configure apiKey.',
      };
    }
    const baseUrl = getGoogleApiBaseUrl(this.config, this.options.env).replace(/\/+$/, '');
    const redactApiKey = (value: unknown) => String(value).split(apiKey).join('[REDACTED]');
    const headers = new Headers(this.config.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('x-goog-api-key', apiKey);
    headers.set('x-promptfoo-silent', 'true');
    try {
      const { data, status, statusText, latencyMs } = await fetchWithCache<{
        error?: { message?: unknown };
      } | null>(
        `${baseUrl}/v1beta/decisions`,
        {
          method: 'POST',
          redirect: 'error',
          headers,
          body: JSON.stringify({ model: this.modelName, input, questions: parsed.data }),
          signal,
        },
        this.config.timeoutMs ?? getRequestTimeoutMs(),
        'json',
        // Media URIs can contain temporary credentials. Keep the request out of the disk cache.
        true,
      );
      if (status < 200 || status >= 300 || data?.error) {
        return {
          error: `Gemini Decisions API error (HTTP ${status}): ${redactApiKey(data?.error?.message ?? statusText)}`,
        };
      }
      const response = parseDecisionsResponse(data, parsed.data);
      if (!response) {
        return {
          error:
            'Invalid Gemini Decisions API response: answers or usage do not match the request.',
        };
      }
      const { usage } = response;
      return {
        output: response.answers,
        tokenUsage: {
          prompt: usage?.total_input_tokens,
          completion: usage?.total_output_tokens,
          total: usage?.total_tokens,
          numRequests: 1,
        },
        cost: calculateGoogleCost(
          this.modelName,
          this.config,
          usage?.total_input_tokens,
          usage?.total_output_tokens,
        ),
        latencyMs,
        raw: response,
      };
    } catch (error) {
      signal?.throwIfAborted();
      if (isAbortError(error)) {
        throw error;
      }
      if (error instanceof HttpRateLimitError) {
        return {
          error: redactApiKey(formatRateLimitErrorMessage(error)),
          metadata: {
            rateLimitKind: error.kind,
            http: {
              status: error.status,
              statusText: redactApiKey(error.statusText),
              headers:
                error.retryAfterMs === undefined
                  ? {}
                  : { 'retry-after-ms': String(error.retryAfterMs) },
            },
          },
        };
      }
      return {
        error: `Gemini Decisions API call failed: ${redactApiKey(error)}`,
      };
    }
  }
}
