import { loadCallbackFromFileUrl } from '../../util/functions/loadFunction';
import { providerRegistry } from '../providerRegistry';
import { getRequestTimeoutMs } from '../shared';
import { hasHeaderOverride, OpenAiGenericProvider } from './index';
import { getLiveBytesPerSecond, LIVE_MAX_CAPTURE_MS, prepareLiveInput } from './liveInput';
import { isLiveCredentialHeader, LIVE_FRAME_MS, LiveSession } from './liveSession';
import { appendOpenAiApiPath } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { LiveAudioFormat } from './liveInput';
import type { OpenAiLiveOptions } from './liveTypes';

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

/** Decode URL userinfo as Node's HTTP client does, keeping a malformed escape as written. */
function decodeUserinfo(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
      const reason = new Error('GPT-Live provider shut down.');
      reason.name = 'AbortError';
      controller.abort(reason);
    }
  }

  async shutdown(): Promise<void> {
    this.cleanup();
    providerRegistry.unregister(this);
  }

  /** Resolve the socket URL and upgrade headers, sending each credential only where it belongs. */
  private getConnection(config: OpenAiLiveOptions): {
    url: string;
    headers: Record<string, string>;
  } {
    // A prompt-level apiBaseUrl or apiHost selects this call's endpoint, which then decides the
    // host-dependent headers and which credentials may be sent.
    const url = new URL(appendOpenAiApiPath(this.getApiUrl(config), 'live/sessions'));
    url.protocol = ['http:', 'ws:'].includes(url.protocol) ? 'ws:' : 'wss:';
    if (url.search) {
      throw new Error('GPT-Live session URLs do not accept query parameters.');
    }
    // Send URL userinfo as an explicit Basic credential, which diagnostics redact, instead of
    // leaving it in the socket URL.
    const userinfo =
      url.username || url.password
        ? `${decodeUserinfo(url.username)}:${decodeUserinfo(url.password)}`
        : undefined;
    url.username = '';
    url.password = '';
    // A prompt-level apiKey or apiKeyEnvar selects this call's credential.
    const apiKey = this.getApiKey(config);
    const headers = this.getOpenAiRequestHeaders(config.headers, config);
    const credentialHeaders = Object.entries(headers).filter(
      ([name, value]) => isLiveCredentialHeader(name) && String(value).trim().length > 0,
    );
    if (!apiKey && this.requiresApiKey() && !credentialHeaders.length && !userinfo) {
      throw new Error(this.getMissingApiKeyErrorMessage(config));
    }
    // Don't forward an ambient OPENAI_API_KEY to a gateway that authenticates with its own
    // credential header or URL userinfo; an explicit apiKey or apiKeyEnvar still sends it.
    const sendApiKey =
      Boolean(config.apiKey || config.apiKeyEnvar) ||
      url.hostname.toLowerCase() === 'api.openai.com' ||
      (!userinfo && !credentialHeaders.some(([name]) => name.toLowerCase() !== 'authorization'));
    const authorization =
      apiKey && sendApiKey
        ? `Bearer ${apiKey}`
        : userinfo && `Basic ${Buffer.from(userinfo).toString('base64')}`;
    return {
      url: url.toString(),
      headers: {
        ...(authorization && !hasHeaderOverride(headers, 'Authorization')
          ? { Authorization: authorization }
          : {}),
        ...headers,
      },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const controller = new AbortController();
    // Rethrow the caller's reason so eval cancellation is reported accurately.
    const abort = () => controller.abort(options?.abortSignal?.reason);
    options?.abortSignal?.addEventListener('abort', abort, { once: true });
    this.activeSessions.add(controller);
    providerRegistry.register(this);
    try {
      const promptConfig = context?.prompt?.config;
      const config: OpenAiLiveOptions = {
        ...this.config,
        ...(promptConfig?.apiBaseUrl !== undefined && { apiHost: undefined }),
        ...(promptConfig?.apiHost !== undefined && { apiBaseUrl: undefined }),
        ...(promptConfig?.apiKeyEnvar !== undefined && { apiKey: undefined }),
        ...(promptConfig?.apiKey !== undefined && { apiKeyEnvar: undefined }),
        ...promptConfig,
      };
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
        config.responseWindowMs ?? 30_000,
        'responseWindowMs',
      );
      const websocketTimeout = positiveTimeout(
        config.websocketTimeout ?? 30_000,
        'websocketTimeout',
      );
      const closeTimeoutMs = positiveTimeout(config.closeTimeoutMs ?? 15_000, 'closeTimeoutMs');
      const input = prepareLiveInput(prompt, format);
      const bytesPerSecond = getLiveBytesPerSecond(format);
      const captureDurationMs =
        Math.ceil(
          ((input.audio.length / bytesPerSecond) * 1000 + responseWindowMs) / LIVE_FRAME_MS,
        ) * LIVE_FRAME_MS;
      if (captureDurationMs > LIVE_MAX_CAPTURE_MS) {
        throw new Error('GPT-Live input audio plus response window must not exceed five minutes.');
      }
      const requestTimeoutMs = getRequestTimeoutMs();
      if (websocketTimeout + captureDurationMs + closeTimeoutMs > requestTimeoutMs) {
        throw new Error(
          'GPT-Live startup, audio capture, and close timeouts exceed REQUEST_TIMEOUT_MS. Increase REQUEST_TIMEOUT_MS or shorten the capture window.',
        );
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
      const session = new LiveSession({
        ...this.getConnection(config),
        model: this.modelName,
        config,
        format,
        ...input,
        responseWindowMs,
        websocketTimeout,
        closeTimeoutMs,
        requestTimeoutMs,
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
      if (!this.activeSessions.size) {
        providerRegistry.unregister(this);
      }
      options?.abortSignal?.removeEventListener('abort', abort);
    }
  }
}
