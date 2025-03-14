// for reasoning models
export interface CompletionTokenDetails {
  reasoning?: number;
  acceptedPrediction?: number;
  rejectedPrediction?: number;
}

export interface TokenUsage {
  cached?: number;
  completion?: number;
  prompt?: number;
  total?: number;
  numRequests?: number;
  completionDetails?: CompletionTokenDetails;
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

/**
 * Metadata for media files (images, audio, video)
 */
export interface MediaMetadata {
  type: string;
  mime: string;
  extension: string;
  filename: string;
  transcript?: string; // Optional transcript for audio files
}
