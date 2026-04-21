/**
 * Adversarial Audio Provider Interface
 *
 * This module defines the interface for external adversarial audio models
 * that can be plugged into the Red Team audio evaluation pipeline.
 *
 * Users can implement their own adversarial audio providers to support:
 * - Background noise injection
 * - Tone manipulation
 * - Voice cloning
 * - Other custom adversarial transformations
 */

import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import { fetchWithProxy } from '../../util/fetch';

/**
 * Standard attack types supported by adversarial audio providers
 */
export type AdversarialAttackType =
  | 'noise-injection'
  | 'tone-manipulation'
  | 'voice-cloning'
  | 'speed-manipulation'
  | 'pitch-shift'
  | 'echo-injection'
  | 'compression-artifacts'
  | 'custom';

/**
 * Audio input for adversarial transformation
 */
export interface AudioInput {
  /** Base64 encoded audio data */
  data: string;
  /** Audio format (e.g., 'pcm16', 'wav', 'mp3') */
  format: string;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Optional text transcript of the audio */
  transcript?: string;
  /** Original text that was converted to audio (if applicable) */
  originalText?: string;
}

/**
 * Audio output from adversarial transformation
 */
export interface AudioOutput {
  /** Base64 encoded audio data */
  data: string;
  /** Audio format (e.g., 'pcm16', 'wav', 'mp3') */
  format: string;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Optional text transcript of the audio */
  transcript?: string;
  /** Metadata about the transformation applied */
  transformationMetadata?: {
    attackType: string;
    parameters?: Record<string, unknown>;
    /** Description of what was modified */
    description?: string;
  };
}

/**
 * Configuration for adversarial audio providers
 */
export interface AdversarialAudioConfig {
  /** Provider ID or HTTP endpoint URL */
  provider: string;
  /** Attack types to apply */
  attackTypes?: AdversarialAttackType[];
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Interface for adversarial audio providers.
 *
 * Implement this interface to create custom adversarial audio providers
 * that can transform clean audio into adversarial audio for red team testing.
 */
export interface AdversarialAudioProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /**
   * Transform clean audio into adversarial audio
   *
   * @param input - The input audio to transform
   * @param attackType - The type of adversarial attack to apply
   * @param config - Optional configuration for the transformation
   * @returns The transformed adversarial audio
   */
  generateAdversarialAudio(
    input: AudioInput,
    attackType: AdversarialAttackType | string,
    config?: Record<string, unknown>,
  ): Promise<AudioOutput>;

  /**
   * Get the list of attack types supported by this provider
   *
   * @returns Array of supported attack type identifiers
   */
  getSupportedAttacks(): (AdversarialAttackType | string)[];

  /**
   * Check if the provider is available and properly configured
   *
   * @returns True if the provider is ready to use
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Passthrough provider that returns audio unchanged.
 * Useful for baseline testing without adversarial modifications.
 */
export class PassthroughAdversarialProvider implements AdversarialAudioProvider {
  readonly id = 'passthrough';

  async generateAdversarialAudio(
    input: AudioInput,
    attackType: AdversarialAttackType | string,
  ): Promise<AudioOutput> {
    logger.debug(`Passthrough provider: returning audio unchanged (attack type: ${attackType})`);
    return {
      data: input.data,
      format: input.format,
      sampleRate: input.sampleRate,
      channels: input.channels,
      transcript: input.transcript,
      transformationMetadata: {
        attackType: 'passthrough',
        description: 'Audio passed through unchanged (baseline)',
      },
    };
  }

  getSupportedAttacks(): AdversarialAttackType[] {
    return ['noise-injection', 'tone-manipulation', 'voice-cloning', 'custom'];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * HTTP-based adversarial provider that calls an external API endpoint.
 *
 * The external API should accept POST requests with the following JSON body:
 * {
 *   "audio": { "data": "base64...", "format": "pcm16", ... },
 *   "attackType": "noise-injection",
 *   "config": { ... }
 * }
 *
 * And return a JSON response:
 * {
 *   "audio": { "data": "base64...", "format": "pcm16", ... },
 *   "transformationMetadata": { "attackType": "noise-injection", ... }
 * }
 */
export class HttpAdversarialProvider implements AdversarialAudioProvider {
  readonly id: string;
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;
  private supportedAttacks: (AdversarialAttackType | string)[] = [];

  constructor(config: {
    endpoint: string;
    timeout?: number;
    headers?: Record<string, string>;
    supportedAttacks?: (AdversarialAttackType | string)[];
  }) {
    this.endpoint = config.endpoint;
    this.timeout = config.timeout || REQUEST_TIMEOUT_MS;
    this.headers = config.headers || {};
    this.supportedAttacks = config.supportedAttacks || [
      'noise-injection',
      'tone-manipulation',
      'voice-cloning',
      'custom',
    ];
    this.id = `http:${new URL(this.endpoint).host}`;
  }

  async generateAdversarialAudio(
    input: AudioInput,
    attackType: AdversarialAttackType | string,
    config?: Record<string, unknown>,
  ): Promise<AudioOutput> {
    logger.debug(
      `HTTP adversarial provider: calling ${this.endpoint} with attack type: ${attackType}`,
    );

    interface AdversarialAudioResponse {
      error?: string;
      audio?: Partial<AudioOutput>;
      data?: string;
      format?: string;
      sampleRate?: number;
      channels?: number;
      transcript?: string;
      transformationMetadata?: {
        attackType: string;
        parameters?: Record<string, unknown>;
        description?: string;
      };
    }

    try {
      const response = await fetchWithCache<AdversarialAudioResponse>(
        this.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify({
            audio: input,
            attackType,
            config,
          }),
        },
        this.timeout,
      );

      if (response.data.error) {
        throw new Error(`Adversarial API error: ${response.data.error}`);
      }

      const audioOutput = response.data.audio || response.data;

      if (!audioOutput.data) {
        throw new Error('Adversarial API response missing required audio data');
      }

      return {
        data: audioOutput.data,
        format: audioOutput.format || input.format,
        sampleRate: audioOutput.sampleRate || input.sampleRate,
        channels: audioOutput.channels || input.channels,
        transcript: audioOutput.transcript,
        transformationMetadata: response.data.transformationMetadata || {
          attackType,
          description: `Applied via ${this.endpoint}`,
        },
      };
    } catch (error) {
      logger.error(`HTTP adversarial provider error: ${error}`);
      throw new Error(
        `Failed to generate adversarial audio via ${this.endpoint}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getSupportedAttacks(): (AdversarialAttackType | string)[] {
    return this.supportedAttacks;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try a simple health check
      const healthEndpoint = new URL('/health', this.endpoint).toString();
      const response = await fetchWithProxy(healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      // If health check fails, try the main endpoint with a minimal request
      try {
        const response = await fetchWithProxy(this.endpoint, {
          method: 'OPTIONS',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok || response.status === 405; // 405 Method Not Allowed is fine
      } catch {
        return false;
      }
    }
  }
}

/**
 * Create an adversarial audio provider from configuration
 *
 * @param config - Provider configuration
 * @returns An adversarial audio provider instance
 */
export function createAdversarialProvider(
  config: AdversarialAudioConfig,
): AdversarialAudioProvider {
  const providerId = config.provider.toLowerCase();

  // Built-in passthrough provider
  if (providerId === 'passthrough' || providerId === 'none') {
    return new PassthroughAdversarialProvider();
  }

  // HTTP endpoint
  if (providerId.startsWith('http://') || providerId.startsWith('https://')) {
    return new HttpAdversarialProvider({
      endpoint: config.provider,
      timeout: config.timeout,
      headers: config.config?.headers as Record<string, string>,
      supportedAttacks: config.attackTypes,
    });
  }

  // Custom provider ID - check if it's a known provider type
  // For now, default to passthrough with a warning
  logger.warn(
    `Unknown adversarial provider: ${config.provider}. Using passthrough provider instead.`,
  );
  return new PassthroughAdversarialProvider();
}

/**
 * Validate that an adversarial audio provider is properly configured
 *
 * @param provider - The provider to validate
 * @returns True if the provider is valid and available
 */
export async function validateAdversarialProvider(
  provider: AdversarialAudioProvider,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const available = await provider.isAvailable();
    if (!available) {
      return {
        valid: false,
        error: `Adversarial provider '${provider.id}' is not available`,
      };
    }

    const attacks = provider.getSupportedAttacks();
    if (!attacks || attacks.length === 0) {
      return {
        valid: false,
        error: `Adversarial provider '${provider.id}' does not support any attack types`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate adversarial provider '${provider.id}': ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
