/**
 * ElevenLabs Audio Isolation Types
 */

import type { ElevenLabsBaseConfig } from '../types';
import type { OutputFormat } from '../tts/types';

/**
 * Configuration for audio isolation provider
 */
export interface AudioIsolationConfig extends ElevenLabsBaseConfig {
  outputFormat?: OutputFormat; // Format for isolated audio (default: mp3_44100_128)
  label?: string; // Provider label
}
