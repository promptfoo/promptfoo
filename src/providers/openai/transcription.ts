import fs from 'fs/promises';
import path from 'path';

import OpenAI from 'openai';
import logger from '../../logger';
import { OpenAiGenericProvider } from './';
import { createJsonCachedOpenAiClient, unwrapOpenAiTransportError } from './client';
import { OPENAI_TRANSCRIPTION_MODELS } from './util';

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
  // Diarization options (for gpt-4o-transcribe-diarize)
  num_speakers?: number;
  speaker_labels?: string[];
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

  private calculateTranscriptionCost(durationSeconds: number | undefined): number | undefined {
    const model = OPENAI_TRANSCRIPTION_MODELS.find((m) => m.id === this.modelName);
    if (!model || !model.cost || durationSeconds === undefined) {
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
    if (!this.getApiKey()) {
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

      const requestBody = {
        file,
        model: this.modelName,
        ...(config.language ? { language: config.language } : {}),
        ...(config.prompt ? { prompt: config.prompt } : {}),
        ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
        ...(config.timestamp_granularities && config.timestamp_granularities.length > 0
          ? { timestamp_granularities: config.timestamp_granularities }
          : {}),
        ...(this.modelName.includes('diarize')
          ? {
              response_format: 'diarized_json',
              ...(config.num_speakers === undefined ? {} : { num_speakers: config.num_speakers }),
              ...(config.speaker_labels && config.speaker_labels.length > 0
                ? { speaker_labels: config.speaker_labels }
                : {}),
            }
          : {
              // Use json for gpt-4o models (verbose_json not supported), verbose_json for others.
              response_format: this.modelName.startsWith('gpt-4o-') ? 'json' : 'verbose_json',
            }),
      };

      let data: any;
      let status = 200;
      let statusText = 'OK';
      let cached = false;
      const { client, requestMetadata } = createJsonCachedOpenAiClient({
        apiKey: this.getApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        bustCache: context?.bustCache ?? context?.debug,
        maxRetries: this.config.maxRetries,
      });

      try {
        data = await client.audio.transcriptions.create(
          requestBody as OpenAI.Audio.TranscriptionCreateParamsNonStreaming,
        );
        cached = requestMetadata.cached;
        status = requestMetadata.status ?? status;
        statusText = requestMetadata.statusText ?? statusText;

        if (status < 200 || status >= 300) {
          return {
            error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          };
        }
      } catch (err) {
        const apiCallError = unwrapOpenAiTransportError(err);
        const errorData = requestMetadata.data;
        const statusFromError = requestMetadata.status;
        const statusTextFromError = requestMetadata.statusText ?? 'Error';

        if (statusFromError && statusFromError >= 400) {
          return {
            error: `API error: ${statusFromError} ${statusTextFromError}\n${
              typeof errorData === 'string' ? errorData : JSON.stringify(errorData)
            }`,
          };
        }

        logger.error('API call error', { error: apiCallError });
        return {
          error: `API call error: ${String(apiCallError)}`,
        };
      }

      if (data.error) {
        return {
          error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
        };
      }

      // Calculate cost based on audio duration
      const durationSeconds = typeof data.duration === 'number' ? data.duration : undefined;
      const cost = cached ? 0 : this.calculateTranscriptionCost(durationSeconds);

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
      } else if (data.text) {
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
