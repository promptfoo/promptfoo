import type { EvaluateResult } from '../types';

export const REPEAT_PASS_RATE_GROUP_METADATA_KEY = '__promptfooRepeatGroupTestIdx';
export const REPEAT_PASS_RATE_GROUP_RESULT_KEY = Symbol('promptfooRepeatGroupTestIdx');

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

export function addStoredRepeatPassRateMetadata(
  metadata: Record<string, any> | undefined,
  result: EvaluateResult,
) {
  const repeatGroupTestIdx = (result as EvaluateResult & TaggedRepeatResult)[
    REPEAT_PASS_RATE_GROUP_RESULT_KEY
  ];
  return repeatGroupTestIdx === undefined
    ? metadata
    : { ...metadata, [REPEAT_PASS_RATE_GROUP_METADATA_KEY]: repeatGroupTestIdx };
}

export function removeStoredRepeatPassRateMetadata(metadata: Record<string, any> | undefined) {
  if (!metadata || !(REPEAT_PASS_RATE_GROUP_METADATA_KEY in metadata)) {
    return metadata;
  }
  const { [REPEAT_PASS_RATE_GROUP_METADATA_KEY]: _internalTestIdx, ...publicMetadata } = metadata;
  return publicMetadata;
}
