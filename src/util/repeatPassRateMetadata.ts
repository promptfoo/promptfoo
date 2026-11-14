import type { EvaluateResult } from '../types';

export const REPEAT_PASS_RATE_GROUP_METADATA_KEY = 'repeatGroupTestIdx';
const REPEAT_PASS_RATE_GROUP_RESULT_KEY = Symbol('promptfooRepeatGroupTestIdx');

type TaggedRepeatResult = {
  [REPEAT_PASS_RATE_GROUP_RESULT_KEY]?: number;
};

export function tagRepeatPassRateResult(result: EvaluateResult, testIdx: number | undefined) {
  if (testIdx !== undefined) {
    Object.defineProperty(result, REPEAT_PASS_RATE_GROUP_RESULT_KEY, {
      configurable: false,
      enumerable: false,
      value: testIdx,
      writable: false,
    });
  }
  return result;
}

// Raw rows carry a symbol set by the evaluator. Only persisted metadata in the
// reserved __promptfoo namespace may supply a group after a database round trip.
export function getTaggedRepeatPassRateGroupTestIdx(result: object): number | undefined {
  return (result as TaggedRepeatResult)[REPEAT_PASS_RATE_GROUP_RESULT_KEY];
}

type ResultMetadata = Record<string, unknown>;

function internalMetadata(metadata: ResultMetadata | undefined) {
  const value = metadata?.__promptfoo;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ResultMetadata)
    : undefined;
}

export function getRepeatPassRateGroupTestIdx(result: { metadata?: ResultMetadata }) {
  const testIdx =
    getTaggedRepeatPassRateGroupTestIdx(result) ??
    internalMetadata(result.metadata)?.[REPEAT_PASS_RATE_GROUP_METADATA_KEY];
  return typeof testIdx === 'number' && Number.isSafeInteger(testIdx) ? testIdx : undefined;
}

export function addStoredRepeatPassRateMetadata(
  metadata: ResultMetadata | undefined,
  result: EvaluateResult,
): EvaluateResult['metadata'] {
  const testIdx = getTaggedRepeatPassRateGroupTestIdx(result);
  if (testIdx === undefined) {
    return removeStoredRepeatPassRateMetadata(metadata);
  }
  return {
    ...metadata,
    __promptfoo: { ...internalMetadata(metadata), [REPEAT_PASS_RATE_GROUP_METADATA_KEY]: testIdx },
  };
}

export function removeStoredRepeatPassRateMetadata(metadata: ResultMetadata | undefined) {
  const internal = internalMetadata(metadata);
  if (!metadata || !internal || !(REPEAT_PASS_RATE_GROUP_METADATA_KEY in internal)) {
    return metadata;
  }
  const { [REPEAT_PASS_RATE_GROUP_METADATA_KEY]: _group, ...siblings } = internal;
  const { __promptfoo: _internal, ...userMetadata } = metadata;
  return Object.keys(siblings).length ? { ...userMetadata, __promptfoo: siblings } : userMetadata;
}
