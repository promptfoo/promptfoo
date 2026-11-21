import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EvalTableQuerySchema,
  EVAL_TABLE_MAX_PAGE_SIZE as legacyPageSize,
} from '../../src/types/api/eval';
import { EVAL_TABLE_MAX_PAGE_SIZE } from '../../src/types/evalConstants';
import {
  isResultFailureReason as legacyGuard,
  ResultFailureReason as legacyReasons,
} from '../../src/types/index';
import { isResultFailureReason, ResultFailureReason } from '../../src/types/results';

import type { SpanData } from '../../src/tracing/store';
import type { StandaloneEval } from '../../src/types/standaloneEval';
import type { TraceSpan } from '../../src/types/tracing';
import type { StandaloneEval as DatabaseStandaloneEval } from '../../src/util/database';
import type { StandaloneEval as CacheStandaloneEval } from '../../src/util/standaloneEvalCache';

describe('browser symbols and source compatibility', () => {
  it('preserves failure reason identity and serialized values', () => {
    expect(legacyReasons).toBe(ResultFailureReason);
    expect(legacyGuard).toBe(isResultFailureReason);
    expect(ResultFailureReason).toEqual({ NONE: 0, ASSERT: 1, ERROR: 2 });
    expect(JSON.stringify(ResultFailureReason)).toBe('{"NONE":0,"ASSERT":1,"ERROR":2}');
    for (const reason of Object.values(ResultFailureReason)) {
      expect(isResultFailureReason(reason)).toBe(true);
    }
    for (const value of [-1, 3, 0.5, NaN, Infinity]) {
      expect(isResultFailureReason(value)).toBe(false);
    }
  });

  it('shares the existing page limit with API validation', () => {
    expect(legacyPageSize).toBe(EVAL_TABLE_MAX_PAGE_SIZE);
    expect(EVAL_TABLE_MAX_PAGE_SIZE).toBe(1000);
    expect(EvalTableQuerySchema.safeParse({ limit: EVAL_TABLE_MAX_PAGE_SIZE }).success).toBe(true);
    expect(EvalTableQuerySchema.safeParse({ limit: EVAL_TABLE_MAX_PAGE_SIZE + 1 }).success).toBe(
      false,
    );
    expect(
      EvalTableQuerySchema.safeParse({ limit: EVAL_TABLE_MAX_PAGE_SIZE + 1, format: 'json' })
        .success,
    ).toBe(true);
  });

  it('preserves cache/database DTOs and the trace view shape', () => {
    expectTypeOf<StandaloneEval>().toEqualTypeOf<DatabaseStandaloneEval>();
    expectTypeOf<StandaloneEval>().toEqualTypeOf<CacheStandaloneEval>();
    expectTypeOf<TraceSpan>().toEqualTypeOf<SpanData>();
  });
});
