import fs from 'fs/promises';
import path from 'path';

import OpenAI from 'openai';
import logger from '../../logger';
import { OpenAiGenericProvider } from './';
import { callJsonCachedOpenAi, unwrapOpenAiTransportError } from './client';
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

type TranscriptionData = {
  duration?: number;
  error?: unknown;
  language?: string;
  segments?: Array<Record<string, any>>;
  speakers?: unknown;
  task?: string;
  text?: string;
};

type TranscriptionQualityMetrics = {
  avgCompressionRatio?: number;
  avgLogprob?: number;
  avgNoSpeechProb?: number;
};

type TranscriptionRequestResult =
  | { ok: false; response: ProviderResponse }
  | {
      ok: true;
      cached: boolean;
      data: TranscriptionData;
      status: number;
      statusText: string;
    };

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

  private createRequestBody(file: File, config: OpenAiTranscriptionOptions) {
    return {
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
            response_format: this.modelName.startsWith('gpt-4o-') ? 'json' : 'verbose_json',
          }),
    };
  }

  private async loadAudioFile(audioFilePath: string): Promise<File | ProviderResponse> {
    try {
      const fileBuffer = await fs.readFile(audioFilePath);
      return new File([fileBuffer], path.basename(audioFilePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { error: `Audio file not found: ${audioFilePath}` };
      }
      logger.error('Failed to read audio file', { error: err, audioFilePath });
      return { error: `Failed to read audio file ${audioFilePath}: ${String(err)}` };
    }
  }

  private async executeRequest(
    requestBody: ReturnType<OpenAiTranscriptionProvider['createRequestBody']>,
    context?: CallApiContextParams,
  ): Promise<TranscriptionRequestResult> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const request = await callJsonCachedOpenAi<any>(
      {
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: config.headers,
        bustCache: context?.bustCache ?? context?.debug,
        maxRetries: this.config.maxRetries,
      },
      (client) =>
        client.audio.transcriptions.create(
          requestBody as OpenAI.Audio.TranscriptionCreateParamsNonStreaming,
        ) as Promise<any>,
    );
    const { requestMetadata } = request;

    if (!request.ok) {
      const apiCallError = unwrapOpenAiTransportError(request.error);
      const errorData = requestMetadata.data;
      const status = requestMetadata.status;
      const statusText = requestMetadata.statusText ?? 'Error';

      if (status && status >= 400) {
        return {
          ok: false,
          response: {
            error: `API error: ${status} ${statusText}\n${
              typeof errorData === 'string' ? errorData : JSON.stringify(errorData)
            }`,
          },
        };
      }

      logger.error('API call error', { error: apiCallError });
      return {
        ok: false,
        response: {
          error: `API call error: ${String(apiCallError)}`,
        },
      };
    }

    const data = request.data as TranscriptionData;
    const status = requestMetadata.status ?? 200;
    const statusText = requestMetadata.statusText ?? 'OK';
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        response: {
          error: `API error: ${status} ${statusText}\n${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`,
        },
      };
    }

    if (data.error) {
      return {
        ok: false,
        response: {
          error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
        },
      };
    }

    return {
      ok: true,
      cached: requestMetadata.cached,
      data,
      status,
      statusText,
    };
  }

  private getQualityMetrics(data: TranscriptionData): TranscriptionQualityMetrics {
    const segments = data.segments ?? [];
    const validSegments = segments.filter(
      (segment) =>
        segment.avg_logprob !== undefined ||
        segment.compression_ratio !== undefined ||
        segment.no_speech_prob !== undefined,
    );

    if (validSegments.length === 0) {
      return {};
    }

    const sumLogprob = validSegments.reduce((sum, segment) => sum + (segment.avg_logprob || 0), 0);
    const sumCompressionRatio = validSegments.reduce(
      (sum, segment) => sum + (segment.compression_ratio || 0),
      0,
    );
    const sumNoSpeechProb = validSegments.reduce(
      (sum, segment) => sum + (segment.no_speech_prob || 0),
      0,
    );

    return {
      ...(validSegments.some((segment) => segment.avg_logprob !== undefined)
        ? { avgLogprob: sumLogprob / validSegments.length }
        : {}),
      ...(validSegments.some((segment) => segment.compression_ratio !== undefined)
        ? { avgCompressionRatio: sumCompressionRatio / validSegments.length }
        : {}),
      ...(validSegments.some((segment) => segment.no_speech_prob !== undefined)
        ? { avgNoSpeechProb: sumNoSpeechProb / validSegments.length }
        : {}),
    };
  }

  private getOutput(data: TranscriptionData): string | ProviderResponse {
    if (this.modelName.includes('diarize') && data.segments) {
      return data.segments
        .map((segment) => {
          const speaker = segment.speaker || 'Unknown';
          const text = segment.text || '';
          const start = segment.start?.toFixed(2) || '0.00';
          const end = segment.end?.toFixed(2) || '0.00';
          return `[${start}s - ${end}s] ${speaker}: ${text}`;
        })
        .join('\n');
    }

    if (data.text) {
      return data.text;
    }

    return { error: 'No transcription returned from API' };
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
    const file = await this.loadAudioFile(audioFilePath);
    if (!(file instanceof File)) {
      return file;
    }

    try {
      const requestBody = this.createRequestBody(file, config);
      const request = await this.executeRequest(requestBody, context);
      if (!request.ok) {
        return request.response;
      }
      const { cached, data } = request;

      // Calculate cost based on audio duration
      const durationSeconds = typeof data.duration === 'number' ? data.duration : undefined;
      const cost = cached ? 0 : this.calculateTranscriptionCost(durationSeconds);
      const qualityMetrics = this.getQualityMetrics(data);
      const output = this.getOutput(data);
      if (typeof output !== 'string') {
        return output;
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
          ...qualityMetrics,
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
