import { describe, expect, it } from 'vitest';
import {
  EVAL_RUNTIME_VAR_KEYS,
  getEvalRuntimeVars,
  omitEvalRuntimeVars,
  PER_RUN_EVAL_RUNTIME_VAR_KEYS,
} from '../../src/util/evalRuntimeVars';

describe('getEvalRuntimeVars', () => {
  it('includes the per-run id when an eval id is present', () => {
    expect(
      getEvalRuntimeVars({
        evalId: 'eval-runtime-vars',
        promptIndex: 1,
        repeatIndex: 2,
        testIndex: 3,
      }),
    ).toEqual({
      __evalId: 'eval-runtime-vars',
      __evalStepId: 'test-3-prompt-1-repeat-2',
      __repeatIndex: 2,
    });
  });

  it('omits __evalId when the eval id is absent and still sets stable step vars', () => {
    expect(
      getEvalRuntimeVars({
        promptIndex: 0,
        repeatIndex: 0,
        testIndex: 0,
      }),
    ).toEqual({
      __evalStepId: 'test-0-prompt-0-repeat-0',
      __repeatIndex: 0,
    });
  });
});

describe('omitEvalRuntimeVars', () => {
  const vars = {
    name: 'world',
    _conversation: 'kept',
    __evalId: 'eval-FYA-2026-11-05T00:08:12',
    __evalStepId: 'test-0-prompt-0-repeat-0',
    __repeatIndex: 0,
  };

  it('strips every eval runtime var by default and leaves user vars in place', () => {
    expect(EVAL_RUNTIME_VAR_KEYS).toEqual(['__evalId', '__evalStepId', '__repeatIndex']);

    const result = omitEvalRuntimeVars(vars);

    expect(result).toEqual({ name: 'world', _conversation: 'kept' });
    expect(result).not.toBe(vars);
    expect(vars).toMatchObject({
      __evalId: 'eval-FYA-2026-11-05T00:08:12',
      __evalStepId: 'test-0-prompt-0-repeat-0',
      __repeatIndex: 0,
    });
  });

  it('cache-key omission drops only the per-run id', () => {
    expect(PER_RUN_EVAL_RUNTIME_VAR_KEYS).toEqual(['__evalId']);

    const first = omitEvalRuntimeVars(vars, PER_RUN_EVAL_RUNTIME_VAR_KEYS);
    const differentUser = omitEvalRuntimeVars(
      { ...vars, name: 'mars' },
      PER_RUN_EVAL_RUNTIME_VAR_KEYS,
    );

    expect(first).toEqual({
      name: 'world',
      _conversation: 'kept',
      __evalStepId: 'test-0-prompt-0-repeat-0',
      __repeatIndex: 0,
    });
    expect(differentUser.name).toBe('mars');
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(differentUser));
    expect(vars.__evalId).toBe('eval-FYA-2026-11-05T00:08:12');
  });
});
