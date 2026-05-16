import fs from 'fs/promises';
import path from 'path';

import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from './';
import { OPENAI_TRANSCRIPTION_MODELS } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export interface OpenAiTranscriptionOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
  organization?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  timestamp_granularities?: ('word' | 'segment')[];
  // Diarization options (for gpt-4o-transcribe-diarize)
  num_speakers?: number;
  speaker_labels?: string[];
}

type TranscriptionFetchResult =
  | { ok: true; data: any; cached: boolean }
  | { ok: false; response: ProviderResponse };

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

  private async readAudioFile(audioFilePath: string): Promise<Buffer | ProviderResponse> {
    try {
      return await fs.readFile(audioFilePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { error: `Audio file not found: ${audioFilePath}` };
      }
      logger.error('Failed to read audio file', { error: err, audioFilePath });
      return { error: `Failed to read audio file ${audioFilePath}: ${String(err)}` };
    }
  }

  private buildTranscriptionFormData(
    audioFilePath: string,
    fileBuffer: Buffer,
    config: OpenAiTranscriptionOptions,
  ) {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(fileBuffer)], path.basename(audioFilePath)));
    formData.append('model', this.modelName);

    if (config.language) {
      formData.append('language', config.language);
    }
    if (config.prompt) {
      formData.append('prompt', config.prompt);
    }
    if (config.temperature !== undefined) {
      formData.append('temperature', config.temperature.toString());
    }
    if (config.timestamp_granularities?.length) {
      formData.append('timestamp_granularities', JSON.stringify(config.timestamp_granularities));
    }

    if (this.modelName.includes('diarize')) {
      formData.append('response_format', 'diarized_json');
      if (config.num_speakers !== undefined) {
        formData.append('num_speakers', config.num_speakers.toString());
      }
      if (config.speaker_labels?.length) {
        formData.append('speaker_labels', JSON.stringify(config.speaker_labels));
      }
    } else {
      formData.append(
        'response_format',
        this.modelName.startsWith('gpt-4o-') ? 'json' : 'verbose_json',
      );
    }

    return formData;
  }

  private async fetchTranscription(
    formData: FormData,
    context?: CallApiContextParams,
  ): Promise<TranscriptionFetchResult> {
    const headers = {
      Authorization: `Bearer ${this.getApiKey()}`,
      ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
    };

    try {
      const { data, cached, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}/audio/transcriptions`,
        {
          method: 'POST',
          headers,
          body: formData,
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
      );
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          response: {
            error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          },
        };
      }
      const responseData = data as any;
      if (responseData.error) {
        return {
          ok: false,
          response: {
            error:
              typeof responseData.error === 'string'
                ? responseData.error
                : JSON.stringify(responseData.error),
          },
        };
      }
      return { ok: true, data: responseData, cached };
    } catch (err) {
      logger.error('API call error', { error: err });
      return { ok: false, response: { error: `API call error: ${String(err)}` } };
    }
  }

  private getSegmentMetrics(segments: any[]) {
    const validSegments = segments.filter(
      (segment) =>
        segment.avg_logprob !== undefined ||
        segment.compression_ratio !== undefined ||
        segment.no_speech_prob !== undefined,
    );
    if (validSegments.length === 0) {
      return {};
    }
    const average = (key: 'avg_logprob' | 'compression_ratio' | 'no_speech_prob') =>
      validSegments.some((segment) => segment[key] !== undefined)
        ? validSegments.reduce((sum, segment) => sum + (segment[key] || 0), 0) /
          validSegments.length
        : undefined;
    return {
      avgLogprob: average('avg_logprob'),
      avgCompressionRatio: average('compression_ratio'),
      avgNoSpeechProb: average('no_speech_prob'),
    };
  }

  private formatTranscriptionOutput(data: any): string | ProviderResponse {
    if (this.modelName.includes('diarize') && data.segments) {
      return data.segments
        .map((segment: any) => {
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

  private buildTranscriptionResponse(data: any, cached: boolean): ProviderResponse {
    const durationSeconds = typeof data.duration === 'number' ? data.duration : undefined;
    const output = this.formatTranscriptionOutput(data);
    if (typeof output !== 'string') {
      return output;
    }
    const segments = data.segments || [];
    const metrics = this.getSegmentMetrics(segments);
    return {
      output,
      cached,
      cost: cached ? 0 : this.calculateTranscriptionCost(durationSeconds),
      metadata: {
        task: data.task,
        ...(durationSeconds === undefined ? {} : { duration: durationSeconds }),
        language: data.language,
        segments: segments.length || 0,
        ...(metrics.avgLogprob === undefined ? {} : { avgLogprob: metrics.avgLogprob }),
        ...(metrics.avgCompressionRatio === undefined
          ? {}
          : { avgCompressionRatio: metrics.avgCompressionRatio }),
        ...(metrics.avgNoSpeechProb === undefined
          ? {}
          : { avgNoSpeechProb: metrics.avgNoSpeechProb }),
        ...(this.modelName.includes('diarize') && data.speakers ? { speakers: data.speakers } : {}),
      },
    };
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

    const fileBuffer = await this.readAudioFile(audioFilePath);
    if (!Buffer.isBuffer(fileBuffer)) {
      return fileBuffer;
    }

    try {
      const transcription = await this.fetchTranscription(
        this.buildTranscriptionFormData(audioFilePath, fileBuffer, config),
        context,
      );
      if (!transcription.ok) {
        return transcription.response;
      }
      return this.buildTranscriptionResponse(transcription.data, transcription.cached);
    } catch (err) {
      logger.error('Transcription error', { error: err });
      return {
        error: `Transcription error: ${String(err)}`,
      };
    }
  }
}
