/**
 * ElevenLabs Forced Alignment Provider
 *
 * Time-aligns transcripts to audio for subtitle generation
 */

import { promises as fs } from 'fs';

import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { ElevenLabsClient } from '../client';

import type {
  ApiProvider,
  CallApiContextParams,
  EnvOverrides,
  ProviderResponse,
} from '../../../types';
import type { AlignmentResponse, ForcedAlignmentConfig } from './types';

/**
 * Provider for forced alignment (subtitle generation)
 *
 * Usage:
 * - Generate word-level timestamps for audio
 * - Create subtitles (SRT, VTT formats)
 * - Sync translations to original audio timing
 * - Karaoke-style text highlighting
 */
export class ElevenLabsAlignmentProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private env?: EnvOverrides;
  config: ForcedAlignmentConfig;

  constructor(
    modelName: string,
    options: {
      config?: Partial<ForcedAlignmentConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    this.env = options.env;
    this.config = this.parseConfig(modelName, options);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs Forced Alignment.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout || 120000, // 2 minutes for processing
    });
  }

  id(): string {
    return this.config.label || 'elevenlabs:alignment';
  }

  toString(): string {
    return '[ElevenLabs Forced Alignment Provider]';
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Parse inputs - need both audio file and transcript
    const audioFileVar = context?.vars?.audioFile;
    const audioFile = typeof audioFileVar === 'string' ? audioFileVar : undefined;
    const transcriptVar = context?.vars?.transcript;
    const transcript = typeof transcriptVar === 'string' ? transcriptVar : prompt.trim();

    if (!audioFile) {
      return {
        error: 'Audio file path is required. Provide it via context.vars.audioFile',
      };
    }

    if (!transcript || transcript.length === 0) {
      return {
        error: 'Transcript is required. Provide it via prompt or context.vars.transcript',
      };
    }

    logger.debug('[ElevenLabs Alignment] Aligning transcript to audio', {
      audioFile,
      transcriptLength: transcript.length,
    });

    try {
      // Read audio file
      const audioBuffer = await fs.readFile(audioFile);
      const filename = audioFile.split('/').pop() || 'audio.mp3';

      logger.debug('[ElevenLabs Alignment] Uploading audio for alignment', {
        filename,
        sizeBytes: audioBuffer.length,
      });

      // Upload and process alignment
      const response = await this.client.upload<AlignmentResponse>(
        '/forced-alignment',
        audioBuffer,
        filename,
        {
          text: transcript,
          include_character_alignments: context?.vars?.includeCharacterAlignments || false,
        },
      );

      const latency = Date.now() - startTime;

      // Format alignment data
      const output = this.formatAlignmentOutput(
        response,
        context?.vars?.format as string | object | undefined,
      );

      logger.debug('[ElevenLabs Alignment] Alignment completed successfully', {
        wordCount: response.words.length,
        duration: response.duration_seconds,
        latency,
      });

      return {
        output,
        metadata: {
          sourceFile: audioFile,
          wordCount: response.words.length,
          characterCount: response.characters?.length || 0,
          durationSeconds: response.duration_seconds,
          latency,
        },
      };
    } catch (error) {
      logger.error('[ElevenLabs Alignment] Failed to align audio', {
        audioFile,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        error: `Failed to align audio: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Format alignment output based on requested format
   */
  private formatAlignmentOutput(response: AlignmentResponse, format?: string | object): string {
    const formatStr = typeof format === 'string' ? format : undefined;
    switch (formatStr?.toLowerCase()) {
      case 'srt':
        return this.formatAsSRT(response);
      case 'vtt':
        return this.formatAsVTT(response);
      case 'json':
      default:
        return JSON.stringify(response, null, 2);
    }
  }

  /**
   * Format as SRT subtitle format
   */
  private formatAsSRT(response: AlignmentResponse): string {
    const lines: string[] = [];
    let subtitleNumber = 1;

    for (let i = 0; i < response.words.length; i++) {
      const word = response.words[i];
      const nextWord = response.words[i + 1];

      // Group words into subtitle chunks (max 10 words or 2 seconds)
      const chunkWords: (typeof word)[] = [word];
      let j = i + 1;

      while (
        j < response.words.length &&
        chunkWords.length < 10 &&
        response.words[j].start - word.start < 2.0
      ) {
        chunkWords.push(response.words[j]);
        j++;
      }

      // Format timestamp
      const start = this.formatSRTTimestamp(word.start);
      const end = this.formatSRTTimestamp(
        nextWord ? nextWord.start : chunkWords[chunkWords.length - 1].end,
      );

      // Add subtitle entry
      lines.push(`${subtitleNumber}`);
      lines.push(`${start} --> ${end}`);
      lines.push(
        chunkWords
          .map((w) => w.text.trim())
          .filter((t) => t)
          .join(' '),
      );
      lines.push(''); // Empty line between entries

      subtitleNumber++;
      i = j - 1;
    }

    return lines.join('\n');
  }

  /**
   * Format as WebVTT subtitle format
   */
  private formatAsVTT(response: AlignmentResponse): string {
    // Start with a valid VTT header and blank line
    const vttLines: string[] = ['WEBVTT', ''];

    // Reuse the SRT formatter and convert to valid VTT:
    // - Drop numeric cue indices
    // - Convert timestamp commas to dots
    if (!response.words || response.words.length === 0) {
      return vttLines.join('\n');
    }

    const srtContent = this.formatAsSRT(response);
    const convertedLines = srtContent
      .split('\n')
      .filter((line) => !/^\s*\d+\s*$/.test(line))
      .map((line) => (line.includes('-->') ? line.replace(/,/g, '.') : line));

    vttLines.push(...convertedLines);

    return vttLines.join('\n');
  }

  /**
   * Format timestamp for WebVTT format (HH:MM:SS.mmm)
   */
  private formatVTTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  /**
   * Format timestamp for SRT format (HH:MM:SS,mmm)
   */
  private formatSRTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config.apiKeyEnvar && this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]) ||
      (this.config.apiKeyEnvar && getEnvString(this.config.apiKeyEnvar as any)) ||
      this.env?.ELEVENLABS_API_KEY ||
      getEnvString('ELEVENLABS_API_KEY')
    );
  }

  /**
   * Parse configuration from constructor options
   */
  private parseConfig(
    _modelName: string,
    options: {
      config?: Partial<ForcedAlignmentConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): ForcedAlignmentConfig {
    const { config } = options;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 120000,
      label: options.label || config?.label || options.id,
    };
  }
}
