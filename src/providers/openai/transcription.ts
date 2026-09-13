import fs from 'fs/promises';
import path from 'path';

import logger from '../../logger';
import { isAbortError } from '../../util/fetch/errors';
import { OpenAiGenericProvider } from './';
import { callJsonCachedOpenAi, unwrapOpenAiTransportError } from './client';
import { getTokenUsage, OPENAI_TRANSCRIPTION_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

function getAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const error = new Error(reason instanceof Error ? reason.message : 'Request was aborted');
  error.name = 'AbortError';
  return error;
}

export interface OpenAiTranscriptionOptions extends OpenAiSharedOptions {
  language?: string;
  languages?: string[];
  keywords?: string[];
  prompt?: string;
  temperature?: number;
  timestamp_granularities?: ('word' | 'segment')[];
  chunking_strategy?:
    | 'auto'
    | {
        type: 'server_vad';
        threshold?: number;
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
      };
  known_speaker_names?: string[];
  known_speaker_references?: string[];
}

export class OpenAiTranscriptionProvider extends OpenAiGenericProvider {
  static OPENAI_TRANSCRIPTION_MODEL_NAMES = OPENAI_TRANSCRIPTION_MODELS.map((model) => model.id);

  config: OpenAiTranscriptionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiTranscriptionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiTranscriptionProvider.OPENAI_TRANSCRIPTION_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown transcription model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};
  }

  id(): string {
    return `openai:transcription:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Transcription Provider ${this.modelName}]`;
  }

  private calculateTranscriptionCost(
    durationSeconds: number | undefined,
    usage:
      | {
          type?: string;
          input_tokens?: number;
          input_token_details?: { text_tokens?: number; audio_tokens?: number };
          output_tokens?: number;
        }
      | undefined,
  ): number | undefined {
    const model = OPENAI_TRANSCRIPTION_MODELS.find((m) => m.id === this.modelName);
    if (!model?.cost) {
      return undefined;
    }

    // Transcription input is mostly audio tokens, billed at a higher rate than text
    // tokens, so token-based billing requires the text/audio split from the API.
    const inputTokenDetails = usage?.input_token_details;
    if (
      usage?.type === 'tokens' &&
      typeof inputTokenDetails?.text_tokens === 'number' &&
      typeof inputTokenDetails?.audio_tokens === 'number' &&
      typeof usage.output_tokens === 'number' &&
      model.cost.input !== undefined &&
      model.cost.audioInput !== undefined &&
      model.cost.output !== undefined
    ) {
      return (
        inputTokenDetails.text_tokens * model.cost.input +
        inputTokenDetails.audio_tokens * model.cost.audioInput +
        usage.output_tokens * model.cost.output
      );
    }

    // Without the audio/text split, duration-based billing is more accurate than
    // pricing all input tokens at the text rate.
    if (durationSeconds === undefined) {
      return undefined;
    }
    const durationMinutes = durationSeconds / 60;
    return durationMinutes * model.cost.perMinute;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const abortSignal = callApiOptions?.abortSignal;
    if (abortSignal?.aborted) {
      throw getAbortError(abortSignal);
    }
    const apiKey = this.getApiKey();
    if (!apiKey && this.requiresApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as OpenAiTranscriptionOptions;

    const isGptTranscribe = this.modelName === 'gpt-transcribe';
    if (isGptTranscribe && config.language !== undefined) {
      return { error: 'gpt-transcribe uses languages (an array) instead of language.' };
    }
    if (config.languages !== undefined || config.keywords !== undefined) {
      if (!isGptTranscribe) {
        return {
          error: 'languages and keywords require the gpt-transcribe file transcription model.',
        };
      }
      if (
        config.languages !== undefined &&
        (!Array.isArray(config.languages) ||
          config.languages.some(
            (language) =>
              typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(language.trim()),
          ))
      ) {
        return { error: 'languages must be an array of language codes such as en, eng, or zh-cn.' };
      }
      if (
        config.keywords !== undefined &&
        (!Array.isArray(config.keywords) ||
          config.keywords.some(
            (keyword) => typeof keyword !== 'string' || !keyword.trim() || /[<>\r\n]/.test(keyword),
          ))
      ) {
        return {
          error: 'keywords must be an array of non-empty, single-line strings without < or >.',
        };
      }
    }

    // The prompt should be a file path to an audio file
    const audioFilePath = prompt.trim();

    let fileBuffer: Awaited<ReturnType<typeof fs.readFile>>;
    try {
      fileBuffer = await fs.readFile(audioFilePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { error: `Audio file not found: ${audioFilePath}` };
      }
      logger.error('Failed to read audio file', { error: err, audioFilePath });
      return { error: `Failed to read audio file ${audioFilePath}: ${String(err)}` };
    }

    try {
      // Create a File object for native FormData from the loaded buffer
      const fileName = path.basename(audioFilePath);
      const file = new File([fileBuffer], fileName);

      const isDiarizationModel = this.modelName.includes('diarize');
      const requestBody = {
        file,
        model: this.modelName,
        ...(config.language ? { language: config.language } : {}),
        ...(config.languages ? { languages: config.languages.map((value) => value.trim()) } : {}),
        ...(config.keywords ? { keywords: config.keywords.map((value) => value.trim()) } : {}),
        ...(config.prompt && !isDiarizationModel ? { prompt: config.prompt } : {}),
        ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
        ...(this.modelName === 'whisper-1' && config.timestamp_granularities
          ? { timestamp_granularities: config.timestamp_granularities }
          : {}),
        chunking_strategy: config.chunking_strategy ?? (isDiarizationModel ? 'auto' : undefined),
        ...(isDiarizationModel
          ? {
              response_format: 'diarized_json',
              known_speaker_names: config.known_speaker_names,
              known_speaker_references: config.known_speaker_references,
            }
          : isGptTranscribe
            ? {}
            : { response_format: this.modelName.startsWith('gpt-4o-') ? 'json' : 'verbose_json' }),
      };
      const headers = this.getOpenAiRequestHeaders(config.headers);
      for (const header of Object.keys(headers)) {
        if (header.toLowerCase() === 'content-type') {
          delete headers[header];
        }
      }

      let data: any, status: number, statusText: string;
      let cached = false;

      try {
        const request = await callJsonCachedOpenAi(
          {
            apiKey,
            allowMissingApiKey: !this.requiresApiKey(),
            organization: this.getOrganization(),
            baseURL: this.getApiUrl(),
            headers,
            bustCache: context?.bustCache ?? context?.debug,
            maxRetries: config.maxRetries,
          },
          (client) =>
            client.audio.transcriptions.create(
              requestBody as OpenAI.Audio.TranscriptionCreateParamsNonStreaming,
              { signal: abortSignal },
            ),
        );
        cached = request.requestMetadata.cached;
        status = request.requestMetadata.status ?? 200;
        statusText = request.requestMetadata.statusText ?? 'OK';
        data = request.ok ? request.data : request.requestMetadata.data;
        if (!request.ok && status >= 200 && status < 300) {
          throw unwrapOpenAiTransportError(request.error);
        }

        if (status < 200 || status >= 300) {
          return {
            error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          };
        }
      } catch (err) {
        if (abortSignal?.aborted) {
          throw getAbortError(abortSignal);
        }
        if (isAbortError(err)) {
          throw err;
        }
        logger.error('API call error', { error: err });
        return {
          error: `API call error: ${String(err)}`,
        };
      }

      if (data.error) {
        return {
          error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
        };
      }

      // Prefer the billed duration ledger when the API returns both values.
      const durationSeconds =
        data.usage?.type === 'duration' && typeof data.usage.seconds === 'number'
          ? data.usage.seconds
          : typeof data.duration === 'number'
            ? data.duration
            : undefined;
      const cost = cached ? 0 : this.calculateTranscriptionCost(durationSeconds, data.usage);
      const tokenUsage =
        data.usage?.type === 'tokens'
          ? getTokenUsage(
              {
                usage: {
                  total_tokens: data.usage.total_tokens,
                  prompt_tokens: data.usage.input_tokens,
                  completion_tokens: data.usage.output_tokens,
                },
              },
              cached,
            )
          : undefined;

      // Calculate average quality metrics from segments
      const segments = data.segments || [];
      const averageMetric = (key: 'avg_logprob' | 'compression_ratio' | 'no_speech_prob') => {
        const values = segments
          .map((segment: any) => segment[key])
          .filter((value: unknown): value is number => typeof value === 'number');
        return values.length > 0
          ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length
          : undefined;
      };
      const avgLogprob = averageMetric('avg_logprob');
      const avgCompressionRatio = averageMetric('compression_ratio');
      const avgNoSpeechProb = averageMetric('no_speech_prob');

      // Format output based on response format
      let output: string;
      if (this.modelName.includes('diarize') && data.segments) {
        // Format diarized output with speaker labels
        output = data.segments
          .map((segment: any) => {
            const speaker = segment.speaker || 'Unknown';
            const text = segment.text || '';
            const start = segment.start?.toFixed(2) || '0.00';
            const end = segment.end?.toFixed(2) || '0.00';
            return `[${start}s - ${end}s] ${speaker}: ${text}`;
          })
          .join('\n');
      } else if (typeof data.text === 'string') {
        // Standard transcription
        output = data.text;
      } else {
        return {
          error: 'No transcription returned from API',
        };
      }

      return {
        output,
        cached,
        cost,
        ...(tokenUsage ? { tokenUsage } : {}),
        metadata: {
          task: data.task,
          ...(durationSeconds === undefined ? {} : { duration: durationSeconds }),
          language: data.language,
          ...(Array.isArray(data.languages) ? { languages: data.languages } : {}),
          segments: data.segments?.length || 0,
          ...(avgLogprob === undefined ? {} : { avgLogprob }),
          ...(avgCompressionRatio === undefined ? {} : { avgCompressionRatio }),
          ...(avgNoSpeechProb === undefined ? {} : { avgNoSpeechProb }),
          ...(this.modelName.includes('diarize') && data.speakers
            ? { speakers: data.speakers }
            : {}),
        },
      };
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      logger.error('Transcription error', { error: err });
      return {
        error: `Transcription error: ${String(err)}`,
      };
    }
  }
}
