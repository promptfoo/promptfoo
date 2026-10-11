import { sha256 } from '../../util/createHash';
import { resolveProviderApiKey } from '../credentials';
import { resolveOpenAiApiUrl } from '../openai';
import { createOpenAiCredentialRedactor } from '../openai/credentialRedaction';
import { prepareLiveInput } from '../openai/liveInput';
import { OpenAiTtsProvider } from '../openai/tts';
import { decodeUrlComponent } from '../urlEncoding';

import type { EnvOverrides } from '../../contracts/env';
import type { ProviderResponse } from '../../contracts/providers';
import type { CallApiContextParams } from '../../types/providers';
import type {
  SimulatedVoiceUserConfig,
  VoiceInterventionConfig,
  VoiceParticipantOptions,
} from './types';

const SAMPLE_RATE = 24000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
const MAX_CLIP_MS = 30000;
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';

/** Preserve cancellation classification without carrying credential-bearing diagnostics or causes. */
function redactPreparationFailure(error: unknown, redact: (text: string) => string): Error {
  if (!(error instanceof Error)) {
    return new Error(redact(String(error)));
  }
  const message = redact(error.message);
  const stack = error.stack === undefined ? undefined : redact(error.stack);
  const hasCause = 'cause' in error && error.cause !== undefined;
  if (message === error.message && stack === error.stack && !hasCause) {
    return error;
  }
  const safe = new Error(message);
  safe.name = error.name;
  safe.stack = stack;
  return safe;
}

export interface PreparedVoiceIntervention extends VoiceInterventionConfig {
  audio?: Buffer;
  clipSha256?: string;
  trimmedLeadingSilenceMs?: number;
}

function assertClipFits(
  entry: VoiceInterventionConfig,
  next: VoiceInterventionConfig | undefined,
  durationMs: number,
  clipMs: number,
): void {
  const end = Math.ceil(entry.atMs / 20) * 20 + Math.ceil(clipMs / 20) * 20;
  if (clipMs > MAX_CLIP_MS || end > durationMs) {
    throw new Error('Scheduled caller speech must fit within 30 seconds and the capture window.');
  }
  if (next && end > Math.ceil(next.atMs / 20) * 20) {
    throw new Error('Scheduled caller speech clips must finish before the next intervention.');
  }
}

/** Trim only leading quiet 10 ms blocks, retaining 20 ms before detected speech. */
function trimLeadingSilence(audio: Buffer): { audio: Buffer; trimmedMs: number } {
  const blockBytes = 10 * BYTES_PER_MS;
  let firstActive = 0;
  for (; firstActive < audio.length; firstActive += blockBytes) {
    const end = Math.min(firstActive + blockBytes, audio.length);
    let energy = 0;
    for (let offset = firstActive; offset < end; offset += 2) {
      energy += audio.readInt16LE(offset) ** 2;
    }
    if (Math.sqrt(energy / ((end - firstActive) / 2)) >= 100) {
      break;
    }
  }
  if (firstActive >= audio.length) {
    throw new Error('Scheduled caller speech contains no audible PCM samples.');
  }
  const start = Math.max(0, firstActive - 20 * BYTES_PER_MS);
  return { audio: audio.subarray(start), trimmedMs: start / BYTES_PER_MS };
}

/**
 * Prepare complete caller utterances before opening the media clock. Network/model latency
 * cannot then postpone their scheduled playback. The target still hears and reacts to real
 * audio; the supplied text is never inserted into its listener transcript.
 */
export async function prepareVoiceInterventions(
  entries: VoiceInterventionConfig[],
  caller: VoiceParticipantOptions | undefined,
  options: SimulatedVoiceUserConfig['interventionTts'],
  durationMs: number,
  env: EnvOverrides | undefined,
  signal: AbortSignal,
  onResponse: (response: ProviderResponse) => void,
  context?: Pick<CallApiContextParams, 'bustCache' | 'debug'>,
): Promise<PreparedVoiceIntervention[]> {
  signal.throwIfAborted();
  if (!entries.some((entry) => entry.text)) {
    return [...entries];
  }
  // Every nonempty clip needs at least one frame. Reject schedules whose rounded
  // start cannot fit even that frame before paying to discover the rendered length.
  for (const [index, entry] of entries.entries()) {
    if (entry.text) {
      assertClipFits(entry, entries[index + 1], durationMs, 20);
    }
  }
  // Resolve env-selected gateways too, then pin the HTTP equivalent of the caller's
  // actual Live endpoint. TTS must not forward ambient OpenAI keys to a custom host.
  const url = new URL(resolveOpenAiApiUrl(caller, env));
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('Scheduled caller speech URLs require HTTP(S) or WS(S).');
  }
  if (url.search || url.hash) {
    throw new Error('Scheduled caller speech URLs do not accept query parameters or fragments.');
  }
  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  }
  if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }
  const customEndpoint = url.hostname !== 'api.openai.com';
  const useDefaultApiKey = customEndpoint ? false : caller?.useDefaultApiKey;
  const apiKey = resolveProviderApiKey(
    caller,
    env,
    useDefaultApiKey === false ? [] : ['OPENAI_API_KEY'],
  );
  // Match Live's HTTP conversion before validating or collecting YAML credentials.
  const headers = Object.fromEntries(
    Object.entries(caller?.headers ?? {}).map(([name, value]) => [name, String(value)]),
  );
  if (
    !apiKey &&
    (url.username || url.password) &&
    !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')
  ) {
    const userinfo = `${decodeUrlComponent(url.username)}:${decodeUrlComponent(url.password)}`;
    headers.Authorization = `Basic ${Buffer.from(userinfo).toString('base64')}`;
  }
  url.username = '';
  url.password = '';
  const provider = new OpenAiTtsProvider(options?.model ?? DEFAULT_TTS_MODEL, {
    env,
    config: {
      apiKey: caller?.apiKey,
      apiKeyEnvar: caller?.apiKeyEnvar,
      apiKeyRequired: caller?.apiKeyRequired,
      useDefaultApiKey,
      apiBaseUrl: url.toString(),
      organization: caller?.organization,
      headers,
      maxRetries: caller?.maxRetries,
      voice: options?.voice ?? caller?.audio?.output?.voice ?? 'cedar',
      instructions: options?.instructions,
      speed: options?.speed,
      response_format: 'pcm',
    },
  });
  const redact = createOpenAiCredentialRedactor(
    provider.getOpenAiRequestHeaders(),
    apiKey ? [String(apiKey)] : [],
  );
  const prepared: PreparedVoiceIntervention[] = [];
  for (const [index, entry] of entries.entries()) {
    signal.throwIfAborted();
    if (!entry.text) {
      prepared.push(entry);
      continue;
    }
    let response: ProviderResponse;
    try {
      response = await provider.callApi(
        entry.text,
        {
          prompt: { raw: entry.text, label: 'Scheduled caller speech' },
          vars: {},
          bustCache: context?.bustCache,
          debug: context?.debug,
        },
        { abortSignal: signal },
      );
    } catch (error) {
      // The renderer can throw on cancellation after sending a billable request. Keep
      // the attempted operation visible, without inventing its unreported usage/cost.
      onResponse({ error: 'Speech preparation ended without a response; usage is unconfirmed.' });
      throw redactPreparationFailure(error, redact);
    }
    if (response.error) {
      const metadata = response.metadata;
      const http = metadata?.http;
      response = {
        ...response,
        error: redact(response.error),
        // Retain standard failure signals for the outer scheduler's retry policy,
        // but never expose arbitrary gateway headers or metadata as diagnostics.
        ...(metadata
          ? {
              metadata: {
                ...(metadata?.rateLimitKind === 'quota' || metadata?.rateLimitKind === 'rate_limit'
                  ? { rateLimitKind: metadata.rateLimitKind }
                  : {}),
                ...(typeof metadata?.rateLimitRetryable === 'boolean'
                  ? { rateLimitRetryable: metadata.rateLimitRetryable }
                  : {}),
                ...(http
                  ? {
                      http: {
                        status: http.status,
                        statusText: redact(http.statusText),
                        headers: Object.fromEntries(
                          Object.entries(http.headers ?? {})
                            .filter(([name]) =>
                              /^(?:retry-after(?:-ms)?|(?:x-)?ratelimit-(?:limit|remaining|reset)(?:-(?:requests|tokens))?)$/i.test(
                                name,
                              ),
                            )
                            .map(([name, value]) => [name.toLowerCase(), redact(value)]),
                        ),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };
    }
    onResponse(response);
    signal.throwIfAborted();
    if (response.error || !response.audio?.data) {
      throw new Error(response.error ?? 'Scheduled caller speech returned no audio.');
    }
    const decoded = prepareLiveInput(
      JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'input_audio', input_audio: response.audio }],
        },
      ]),
      { type: 'audio/pcm', rate: SAMPLE_RATE },
    ).audio;
    const trimmed = trimLeadingSilence(decoded);
    const clipMs = trimmed.audio.length / BYTES_PER_MS;
    assertClipFits(entry, entries[index + 1], durationMs, clipMs);
    prepared.push({
      ...entry,
      audio: trimmed.audio,
      clipSha256: sha256(trimmed.audio),
      trimmedLeadingSilenceMs: trimmed.trimmedMs,
    });
  }
  return prepared;
}
