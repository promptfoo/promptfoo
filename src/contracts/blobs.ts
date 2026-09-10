/**
 * Portable blob reference format used across API/UI boundaries.
 * Example URI: promptfoo://blob/<hash>
 */
export interface BlobRef {
  uri: string;
  hash: string;
  mimeType: string;
  sizeBytes: number;
  provider: string;
}
