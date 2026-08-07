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

/**
 * Read the repeat-stable group identity off a result. Prefers the in-memory symbol tag
 * (set by `tagRepeatPassRateResult` on raw evaluator rows), falling back to the stored
 * metadata key for rows reconstructed from the database. Returns `undefined` for rows
 * that were never part of a repeat group (e.g. a test opting out with `options.repeat: 1`
 * inside a globally repeated run).
 */
export function getRepeatPassRateGroupTestIdx(
  result: EvaluateResult | { metadata?: Record<string, unknown> },
): number | undefined {
  const symbolTag = (result as EvaluateResult & TaggedRepeatResult)[REPEAT_PASS_RATE_GROUP_RESULT_KEY];
  if (typeof symbolTag === 'number' && Number.isSafeInteger(symbolTag)) {
    return symbolTag;
  }
  const metadataTag = result.metadata?.[REPEAT_PASS_RATE_GROUP_METADATA_KEY];
  return typeof metadataTag === 'number' && Number.isSafeInteger(metadataTag)
    ? metadataTag
    : undefined;
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
