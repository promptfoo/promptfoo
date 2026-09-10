import { loadCallbackFromFileUrl } from '../../util/functions/loadFunction';
import { hasHeaderOverride, OpenAiGenericProvider } from './index';
import { prepareLiveInput } from './liveInput';
import { LiveSession } from './liveSession';
import { appendOpenAiApiPath } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { LiveAudioFormat, LiveInputMessage } from './liveInput';
import type { OpenAiSharedOptions } from './types';

export interface LiveTranscriptDelta {
  role: 'user' | 'assistant';
  delta: string;
  start_ms: number;
  end_ms: number;
}

type ResponsesBackend = Pick<
  OpenAI.Responses.ResponseCreateParamsNonStreaming,
  | 'instructions'
  | 'max_output_tokens'
  | 'parallel_tool_calls'
  | 'reasoning'
  | 'service_tier'
  | 'text'
  | 'tool_choice'
> & {
  model: string;
  tools?: (OpenAI.Responses.FunctionTool | { type: 'web_search' })[];
};

export type LiveDelegationHandler = (
  request: {
    id: string;
    offsetMs: number;
    input: LiveInputMessage[];
    transcript: LiveTranscriptDelta[];
  },
  signal: AbortSignal,
) => Promise<string>;
export type LiveFunctionCallHandler = (
  name: string,
  args: string,
  signal: AbortSignal,
) => Promise<string>;

export interface OpenAiLiveOptions extends OpenAiSharedOptions {
  instructions?: string;
  audio?: { format?: LiveAudioFormat; output?: { voice?: string | { id: string } } };
  delegation?: { type: 'client' } | { type: 'responses'; responses: ResponsesBackend };
  delegationHandler?: LiveDelegationHandler | string;
  functionCallHandler?: LiveFunctionCallHandler | string;
  /** Silence streamed after the input clip (or for the entire text-seeded eval). */
  responseWindowMs?: number;
  websocketTimeout?: number;
  closeTimeoutMs?: number;
  costPerMinute?: number;
}

async function resolveHandler<T extends Function>(
  handler: T | string | undefined,
): Promise<T | undefined> {
  if (typeof handler === 'string') {
    return (await loadCallbackFromFileUrl(handler)) as T;
  }
  if (handler !== undefined && typeof handler !== 'function') {
    throw new Error('GPT-Live handlers must be functions or file:// callback paths.');
  }
  return handler;
}

function positiveTimeout(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 300_000) {
    throw new Error(`${name} must be a positive integer no greater than 300000 ms.`);
  }
  return value;
}

/** One independent, finite capture per eval. Live has no authoritative voice-turn-done event. */
export class OpenAiLiveProvider extends OpenAiGenericProvider {
  declare config: OpenAiLiveOptions;
  private activeSessions = new Set<AbortController>();

  constructor(
    modelName: string,
    options: { config?: OpenAiLiveOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  id(): string {
    return `openai:live:${this.modelName}`;
  }

  getAudioInputFormat(): 'openai' {
    return 'openai';
  }

  cleanup(): void {
    for (const controller of this.activeSessions) {
      controller.abort();
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options?.abortSignal?.addEventListener('abort', abort, { once: true });
    this.activeSessions.add(controller);
    try {
      const config: OpenAiLiveOptions = { ...this.config, ...context?.prompt?.config };
      const format: LiveAudioFormat = config.audio?.format ?? { type: 'audio/pcm', rate: 24_000 };
      if (
        !(format.type === 'audio/pcm' && [16_000, 24_000].includes(format.rate)) &&
        !(['audio/pcmu', 'audio/pcma'].includes(format.type) && format.rate === 8_000)
      ) {
        throw new Error(
          'GPT-Live audio.format must be PCM16 at 16000/24000 Hz or G.711 at 8000 Hz.',
        );
      }
      const responseWindowMs = positiveTimeout(
        config.responseWindowMs ?? 10_000,
        'responseWindowMs',
      );
      const websocketTimeout = positiveTimeout(
        config.websocketTimeout ?? 30_000,
        'websocketTimeout',
      );
      const closeTimeoutMs = positiveTimeout(config.closeTimeoutMs ?? 15_000, 'closeTimeoutMs');
      const input = prepareLiveInput(prompt, format);
      const bytesPerSecond = format.rate * (format.type === 'audio/pcm' ? 2 : 1);
      if ((input.audio.length / bytesPerSecond) * 1000 + responseWindowMs > 300_000) {
        throw new Error('GPT-Live input audio plus response window must not exceed five minutes.');
      }
      if (
        config.costPerMinute !== undefined &&
        (!Number.isFinite(config.costPerMinute) || config.costPerMinute < 0)
      ) {
        throw new Error('costPerMinute must be a finite nonnegative number.');
      }
      if (config.delegation && !['client', 'responses'].includes(config.delegation.type)) {
        throw new Error('GPT-Live delegation.type must be client or responses.');
      }
      if (config.delegation?.type === 'responses' && !config.delegation.responses?.model?.trim()) {
        throw new Error('GPT-Live Responses delegation requires a backend model.');
      }
      const delegationHandler = await resolveHandler(config.delegationHandler);
      const functionCallHandler = await resolveHandler(config.functionCallHandler);
      controller.signal.throwIfAborted();
      const apiKey = this.getApiKey();
      const headers = this.getOpenAiRequestHeaders();
      if (!apiKey && this.requiresApiKey() && !hasHeaderOverride(headers, 'Authorization')) {
        throw new Error(this.getMissingApiKeyErrorMessage());
      }
      const url = new URL(appendOpenAiApiPath(this.getApiUrl(), 'live/sessions'));
      url.protocol = ['http:', 'ws:'].includes(url.protocol) ? 'ws:' : 'wss:';
      if (url.search) {
        throw new Error('GPT-Live session URLs do not accept query parameters.');
      }
      const session = new LiveSession({
        url: url.toString(),
        headers: {
          ...(apiKey && !hasHeaderOverride(headers, 'Authorization')
            ? { Authorization: `Bearer ${apiKey}` }
            : {}),
          ...headers,
        },
        model: this.modelName,
        config,
        format,
        ...input,
        responseWindowMs,
        websocketTimeout,
        closeTimeoutMs,
        delegationHandler,
        functionCallHandler,
        signal: controller.signal,
      });
      const result = await session.run();
      controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      controller.signal.throwIfAborted();
      return { error: error instanceof Error ? error.message : 'GPT-Live request failed.' };
    } finally {
      controller.abort();
      this.activeSessions.delete(controller);
      options?.abortSignal?.removeEventListener('abort', abort);
    }
  }
}
