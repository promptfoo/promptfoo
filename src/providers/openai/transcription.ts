import fs from 'fs/promises';
import path from 'path';

import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from './';
import { appendOpenAiApiPath, getTokenUsage, OPENAI_TRANSCRIPTION_MODELS } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

export interface OpenAiTranscriptionOptions extends OpenAiSharedOptions {
  language?: string;
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
    usage: { type?: string; input_tokens?: number; output_tokens?: number } | undefined,
  ): number | undefined {
    const model = OPENAI_TRANSCRIPTION_MODELS.find((m) => m.id === this.modelName);
    if (!model?.cost) {
      return undefined;
    }

    if (
      usage?.type === 'tokens' &&
      typeof usage.input_tokens === 'number' &&
      typeof usage.output_tokens === 'number' &&
      model.cost.input !== undefined &&
      model.cost.output !== undefined
    ) {
      return usage.input_tokens * model.cost.input + usage.output_tokens * model.cost.output;
    }

    if (durationSeconds === undefined) {
      return undefined;
    }
    const durationMinutes = durationSeconds / 60;
    return durationMinutes * model.cost.perMinute;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey && this.requiresApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as OpenAiTranscriptionOptions;

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

      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', this.modelName);

      // Add optional parameters
      if (config.language) {
        formData.append('language', config.language);
      }
      if (config.prompt && !this.modelName.includes('diarize')) {
        formData.append('prompt', config.prompt);
      }
      if (config.temperature !== undefined) {
        formData.append('temperature', config.temperature.toString());
      }
      if (this.modelName === 'whisper-1' && config.timestamp_granularities) {
        for (const granularity of config.timestamp_granularities) {
          formData.append('timestamp_granularities[]', granularity);
        }
      }

      const isDiarizationModel = this.modelName.includes('diarize');
      const chunkingStrategy =
        config.chunking_strategy ?? (isDiarizationModel ? 'auto' : undefined);
      if (typeof chunkingStrategy === 'string') {
        formData.append('chunking_strategy', chunkingStrategy);
      } else if (chunkingStrategy) {
        for (const [key, value] of Object.entries(chunkingStrategy)) {
          if (value !== undefined) {
            formData.append(`chunking_strategy[${key}]`, String(value));
          }
        }
      }

      // Diarization-specific options (for gpt-4o-transcribe-diarize)
      if (isDiarizationModel) {
        formData.append('response_format', 'diarized_json');
        for (const name of config.known_speaker_names || []) {
          formData.append('known_speaker_names[]', name);
        }
        for (const reference of config.known_speaker_references || []) {
          formData.append('known_speaker_references[]', reference);
        }
      } else {
        // Use json for gpt-4o models (verbose_json not supported), verbose_json for others
        const responseFormat = this.modelName.startsWith('gpt-4o-') ? 'json' : 'verbose_json';
        formData.append('response_format', responseFormat);
      }

      const customHeaders = this.getOpenAiRequestHeaders(config.headers);
      const hasAuthorizationOverride = Object.keys(customHeaders).some(
        (header) => header.toLowerCase() === 'authorization',
      );
      const headers: Record<string, string> = {
        ...(apiKey && !hasAuthorizationOverride ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...customHeaders,
      };
      for (const header of Object.keys(headers)) {
        if (header.toLowerCase() === 'content-type') {
          delete headers[header];
        }
      }

      let data: any, status: number, statusText: string;
      let cached = false;

      try {
        ({ data, cached, status, statusText } = await fetchWithCache(
          appendOpenAiApiPath(this.getApiUrl(), 'audio/transcriptions'),
          {
            method: 'POST',
            headers,
            body: formData,
          },
          getRequestTimeoutMs(),
          'json',
          context?.bustCache ?? context?.debug,
          config.maxRetries,
        ));

        if (status < 200 || status >= 300) {
          return {
            error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          };
        }
      } catch (err) {
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
      let avgLogprob: number | undefined;
      let avgCompressionRatio: number | undefined;
      let avgNoSpeechProb: number | undefined;

      if (segments.length > 0) {
        const validSegments = segments.filter(
          (s: any) =>
            s.avg_logprob !== undefined ||
            s.compression_ratio !== undefined ||
            s.no_speech_prob !== undefined,
        );

        if (validSegments.length > 0) {
          const sumLogprob = validSegments.reduce(
            (sum: number, s: any) => sum + (s.avg_logprob || 0),
            0,
          );
          const sumCompressionRatio = validSegments.reduce(
            (sum: number, s: any) => sum + (s.compression_ratio || 0),
            0,
          );
          const sumNoSpeechProb = validSegments.reduce(
            (sum: number, s: any) => sum + (s.no_speech_prob || 0),
            0,
          );

          avgLogprob = validSegments.some((s: any) => s.avg_logprob !== undefined)
            ? sumLogprob / validSegments.length
            : undefined;
          avgCompressionRatio = validSegments.some((s: any) => s.compression_ratio !== undefined)
            ? sumCompressionRatio / validSegments.length
            : undefined;
          avgNoSpeechProb = validSegments.some((s: any) => s.no_speech_prob !== undefined)
            ? sumNoSpeechProb / validSegments.length
            : undefined;
        }
      }

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
      logger.error('Transcription error', { error: err });
      return {
        error: `Transcription error: ${String(err)}`,
      };
    }
  }
}
