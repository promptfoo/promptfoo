/**
 * Types for the Media Library page
 */

import type { MediaKind } from '@app/utils/media';
import type {
  EvalOption as ApiEvalOption,
  GraderResult as ApiGraderResult,
  MediaItem as ApiMediaItem,
} from '@promptfoo/contracts';

export type { MediaKind };

export type GraderResult = ApiGraderResult;
export type MediaItem = ApiMediaItem;
export type EvalOption = ApiEvalOption;

export type MediaTypeFilter = 'all' | MediaKind;

export type MediaSortField = 'createdAt' | 'sizeBytes';
export type MediaSortOrder = 'asc' | 'desc';

export interface MediaSort {
  field: MediaSortField;
  order: MediaSortOrder;
}
