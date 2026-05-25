/**
 * Types for the Media Library page
 */

import type { MediaKind } from '@app/utils/media';
import type {
  EvalOption as ApiEvalOption,
  GraderResult as ApiGraderResult,
  MediaItemContext as ApiMediaContext,
  MediaItem as ApiMediaItem,
  MediaLibraryResponse as ApiMediaLibraryResponse,
} from '@promptfoo/types/api/blobs';

export type { MediaKind };

export type GraderResult = ApiGraderResult;
export type MediaContext = ApiMediaContext;
export type MediaItem = ApiMediaItem;
export type MediaLibraryResponse = ApiMediaLibraryResponse['data'];
export type EvalOption = ApiEvalOption;

export type MediaTypeFilter = 'all' | MediaKind;

export type MediaSortField = 'createdAt' | 'sizeBytes';
export type MediaSortOrder = 'asc' | 'desc';

export interface MediaSort {
  field: MediaSortField;
  order: MediaSortOrder;
}
