import { fetchWithCache } from '../../cache';
import {
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isAbortError,
} from '../../util/fetch/errors';
import { renderVarsInObject } from '../../util/render';
import { getNunjucksEngine } from '../../util/templates';
import { resolveProviderApiKey } from '../credentials';
import { getRequestTimeoutMs } from '../shared';
import { classifyDecision, type DecisionGradingConfig, gradeDecision } from './decisionGrading';
import { decisionsQuestionsSchema, parseDecisionsResponse } from './decisionSchema';
import { calculateGoogleCost, getGoogleApiBaseUrl } from './util';

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

// An ordinary JSON document can itself be the text being classified.
function parseDecisionInput(prompt: string): string | Record<string, unknown> | unknown[] {
  try {
    const value: unknown = JSON.parse(prompt);
    if (
      isContentBlock(value) ||
      (Array.isArray(value) && value.length > 0 && value.every(isContentBlock))
    ) {
      return value;
    }
  } catch {
    // Plain text is a native Decisions input.
  }
  return prompt;
}

export class GoogleDecisionsProvider implements ApiProvider {
  readonly config: DecisionsConfig;

  constructor(
    readonly modelName: string,
    private readonly options: ProviderOptions<DecisionsConfig> = {},
  ) {
    this.config = options.config ?? {};
  }

  id(): string {
    return this.options.id ?? `google:decisions:${this.modelName}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (context?.isGrading) {
      return gradeDecision(prompt, context, this.config, (input, questions) =>
        this.ask(input, questions, options),
      );
    }
    const questions = context?.prompt?.config?.questions ?? this.config.questions;
    return this.ask(
      parseDecisionInput(prompt),
      renderVarsInObject(questions, context?.vars),
      options,
    );
  }

  async callClassificationApi(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderClassificationResponse> {
    return classifyDecision(prompt, this.config, (input, questions) =>
      this.ask(input, questions, options),
    );
  }

  private async ask(
    input: ReturnType<typeof parseDecisionInput>,
    questions: unknown,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
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
    const rawKey = resolveProviderApiKey(this.config, this.options.env, [
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'PALM_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ]);
    const apiKey = rawKey && getNunjucksEngine().renderString(rawKey, {});
    if (!apiKey) {
      return {
        error:
          'Gemini Decisions requires an API key. Set GOOGLE_API_KEY or GEMINI_API_KEY, or configure apiKey.',
      };
    }
    const baseUrl = getGoogleApiBaseUrl(this.config, this.options.env).replace(/\/+$/, '');
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
          error: `Gemini Decisions API error (HTTP ${status}): ${String(data?.error?.message ?? statusText).replaceAll(apiKey, '[REDACTED]')}`,
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
          error: formatRateLimitErrorMessage(error).replaceAll(apiKey, '[REDACTED]'),
          metadata: {
            rateLimitKind: error.kind,
            http: {
              status: error.status,
              statusText: error.statusText.replaceAll(apiKey, '[REDACTED]'),
              headers:
                error.retryAfterMs === undefined
                  ? {}
                  : { 'retry-after-ms': String(error.retryAfterMs) },
            },
          },
        };
      }
      return {
        error: `Gemini Decisions API call failed: ${String(error).replaceAll(apiKey, '[REDACTED]')}`,
      };
    }
  }
}
