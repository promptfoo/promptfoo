/**
 * Types for the Media Library page
 */

// Re-export MediaKind from the shared utility to avoid duplication
export type { MediaKind } from '@app/utils/media';

export interface GraderResult {
  name: string;
  pass: boolean;
  score: number;
  reason?: string;
}

export interface MediaContext {
  evalId: string;
  evalDescription?: string;
  testIdx?: number;
  promptIdx?: number;
  location?: string;
  provider?: string;
  prompt?: string;
  // Evaluation results
  pass?: boolean;
  score?: number;
  variables?: Record<string, string>;
  graderResults?: GraderResult[];
  latencyMs?: number;
  cost?: number;
}

export interface MediaItem {
  hash: string;
  mimeType: string;
  sizeBytes: number;
  kind: MediaKind;
  createdAt: string;
  url: string;
  context: MediaContext;
}

export interface MediaLibraryResponse {
  items: MediaItem[];
  total: number;
  hasMore: boolean;
}

export interface EvalOption {
  evalId: string;
  description: string;
  createdAt?: string;
}

export type MediaTypeFilter = 'all' | MediaKind;

export type MediaSortField = 'createdAt' | 'sizeBytes';
export type MediaSortOrder = 'asc' | 'desc';

export interface MediaSort {
  field: MediaSortField;
  order: MediaSortOrder;
}
