import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResultIndexKey } from '../../src/evaluator/resultIndex';
import {
  persistTraceMetadata,
  sanitizeResultForJsonlArtifact,
  surfaceTraceMetadata,
} from '../../src/evaluator/resultProcessing';
import { sanitizeRedactionResult } from '../../src/util/verifierPrivacy';
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

  it('snapshots class-based graders before projecting non-private verifier results', () => {
    class Grader {
      state = 'client-internals';
      config = { apiKey: 'fixture-key', temperature: 0 };
      id() {
        return 'echo';
      }
      callApi = vi.fn();
      toJSON = vi.fn();
    }
    const provider = new Grader();
    const assertion = { type: 'promptfoo:redteam:coding-agent:mcp-confused-deputy', provider };
    const row = sanitizeRedactionResult({
      testCase: { options: { provider: { text: provider } }, assert: [assertion] },
      prompt: { config: { provider } },
      gradingResult: { componentResults: [{ assertion }] },
    });
    const expected = { id: 'echo', config: { apiKey: '[REDACTED]', temperature: 0 } };
    const saved = sanitizeResultForJsonlArtifact(row);
    expect(saved.testCase.options.provider.text).toEqual(expected);
    expect(saved.testCase.assert[0].provider).toEqual(expected);
    expect(saved.prompt.config.provider).toEqual(expected);
    expect(saved.gradingResult.componentResults[0].assertion.provider).toEqual(expected);
    expect(JSON.stringify(row)).not.toContain('client-internals');
    expect(provider.toJSON).not.toHaveBeenCalled();
  });

  it('omits private grading providers without invoking their methods', () => {
    const provider = { id: vi.fn(), callApi: vi.fn(), toJSON: vi.fn() };
    const saved = sanitizeResultForJsonlArtifact({
      testCase: { assert: [{ type: 'promptfoo:redteam:harness:artifact-redaction', provider }] },
    });
    expect(saved.testCase.assert[0]).not.toHaveProperty('provider');
    expect(provider.id).not.toHaveBeenCalled();
    expect(provider.toJSON).not.toHaveBeenCalled();
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
