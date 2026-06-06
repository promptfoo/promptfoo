/**
 * Types for the Media Library page
 */

import type {
  EvalOption as ApiEvalOption,
  GraderResult as ApiGraderResult,
  MediaItemContext as ApiMediaContext,
  MediaItem as ApiMediaItem,
  MediaLibraryResponse as ApiMediaLibraryResponse,
} from '@app/utils/api';
import type { MediaKind } from '@app/utils/media';

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
