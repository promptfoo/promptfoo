import type { CacheStatus, SourceStatus } from './types';

export type InspectionCode =
  | 'invalid-row'
  | 'invalid-context'
  | 'missing-identity'
  | 'invalid-identity'
  | 'invalid-repeat-index'
  | 'invalid-repeat-group'
  | 'duplicate-slot'
  | 'conflicting-repeat-group'
  | 'conflicting-group-identity'
  | 'conflicting-prompt-identity'
  | 'invalid-response';
export interface InspectionDiagnostic {
  code: InspectionCode;
  count: number;
  /** Row offsets identify input evidence without retaining raw content. */
  rowIndices: number[];
  omittedRowIndices: number;
}
export interface InspectionStatusCounts {
  passed: number;
  assertionFailed: number;
  executionFailed: number;
  unknown: number;
  cached: number;
  fresh: number;
  cacheUnknown: number;
}
export interface VariantInventory {
  familyId: string;
  variantId: string;
  rows: number;
  explicitRepeatIndices: number[];
  rowsWithoutRepeatIndex: number;
  repeatedSlots: number;
  repeatGroupCount: number;
  rowsWithoutRepeatGroup: number;
  status: InspectionStatusCounts;
  outputPresent: number;
  outputStripped: number;
  outputAbsent: number;
}
export interface ContextInventory {
  /** Local inventory ordinal, not a generated logical plan identity. */
  index: number;
  promptIdx: number;
  providerLabelPresent: boolean;
  selector?: { promptIdx: number; providerId: string; providerLabel?: string };
  rows: number;
  taggedRows: number;
  unidentifiedRows: number;
  invalidRows: number;
  status: InspectionStatusCounts;
  variants: VariantInventory[];
}
export interface NativeInspection {
  version: 1;
  nativeSummaryVersion: number;
  includesContextSelectors: boolean;
  rows: number;
  contexts: ContextInventory[];
  diagnostics: InspectionDiagnostic[];
  limitations: string[];
}
export interface InspectionRowState {
  sourceStatus: SourceStatus;
  cache: CacheStatus;
  output: 'present' | 'stripped' | 'absent';
}
