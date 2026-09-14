import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResultIndexKey } from '../../src/evaluator/resultIndex';
import {
  persistTraceMetadata,
  sanitizeResultForJsonlArtifact,
  surfaceTraceMetadata,
} from '../../src/evaluator/resultProcessing';
import { mockProcessEnv } from '../util/utils';

describe('model-independent result processing', () => {
  let restoreEnv: (() => void) | undefined;
  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
  });

  it('projects artifacts without changing live provider values', () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true' });
    const result = {
      testIdx: 0,
      promptIdx: 2,
      response: { output: 'live output', metadata: { headers: { authorization: 'fixture' } } },
      provider: { id: 'fixture', config: { apiKey: 'fixture-key' } },
    };
    const artifact = sanitizeResultForJsonlArtifact(result);
    expect(artifact.response.output).toBe('[output stripped]');
    expect(artifact.provider.config.apiKey).toBe('[REDACTED]');
    expect(result.response.output).toBe('live output');
    expect(result.provider.config.apiKey).toBe('fixture-key');
    expect(getResultIndexKey(artifact)).toBe('0:2');
  });

  it('round-trips trace linkage while preserving user metadata', () => {
    const metadata = { value: 0, __promptfoo: { retained: false } };
    const persisted = persistTraceMetadata(metadata, 'trace-fixture', 'evaluation-fixture');
    expect(surfaceTraceMetadata(JSON.parse(JSON.stringify(persisted)))).toEqual({
      traceId: 'trace-fixture',
      evaluationId: 'evaluation-fixture',
      metadata,
    });
    expect(metadata).toEqual({ value: 0, __promptfoo: { retained: false } });
  });

  it.each([undefined, null, {}, { __promptfoo: 'legacy' }])(
    'accepts legacy metadata %j',
    (metadata) => {
      expect(surfaceTraceMetadata(metadata)).toEqual({
        traceId: undefined,
        evaluationId: undefined,
        metadata: metadata ?? {},
      });
    },
  );
});
