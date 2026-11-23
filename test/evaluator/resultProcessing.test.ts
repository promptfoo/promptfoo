import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResultIndexKey } from '../../src/evaluator/resultIndex';
import {
  persistTraceMetadata,
  projectResultSchemas,
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

  it.each([
    'file://schema.yaml',
    '[REDACTED]',
    { properties: { password: '[REDACTED]' } },
    { properties: { password: { $ref: 'external.json' } } },
  ])('protects old diagnostics when the original schema is unavailable (%s)', (value) => {
    const testCase = { assert: [{ type: 'is-json', value }] };
    for (const error of [
      'data/password must match pattern "^opaque$"',
      'SyntaxError: Invalid regular expression: /[opaque/u: Unterminated character class',
      "data must have required property 'https://example.test/?token=opaque'",
      'YAMLException: bad indentation (2:11)\n\n 2 | password: opaque',
      'bad indentation (2:11)\n\n 2 | password: opaque',
    ]) {
      const row = { testCase, error, gradingResult: null, response: { output: error } };
      const safe = projectResultSchemas(row);
      expect(safe.error).not.toContain('opaque');
      expect(safe.response.output).toBe(error);
      expect(row.error).toBe(error);
      if (typeof value === 'string') {
        expect(safe.testCase).toEqual(testCase);
      }
    }
  });

  it.each(['\ud800', '\n\udfff'])('redacts unencodable URL pointers in saved rows (%j)', (tail) => {
    const name = `https://example.test/${tail}?token=opaque`;
    const ref = '#/$defs/' + name;
    const value = {
      type: 'object',
      $defs: { [name]: { const: 'opaque' }, field: { type: 'integer' } },
      properties: { password: { $ref: ref }, public: { $ref: '#/$defs/field' } },
    };
    const row = {
      testCase: { assert: [{ type: 'is-json', value: JSON.stringify(value) }] },
      error: `can't resolve reference ${ref} from id #`,
    };
    const safe = projectResultSchemas(row);
    expect(JSON.stringify(safe)).not.toContain('opaque');
    const projected = JSON.parse(safe.testCase.assert[0].value);
    expect(projected.properties.password.$ref).toBe('#/[REDACTED]');
    expect(projected.properties.public).toEqual(value.properties.public);
    expect(projected.$defs.field).toEqual(value.$defs.field);
    expect(projectResultSchemas(safe)).toEqual(safe);
  });

  it('retains public diagnostics in nested results while protecting aggregate errors', () => {
    const assertion = {
      type: 'is-json',
      value: { properties: { password: { pattern: '^opaque$' }, code: { pattern: '^ok$' } } },
    };
    const reason =
      'data/password must match pattern "^opaque$", data/code must match pattern "^ok$"';
    const row = {
      error: reason,
      gradingResult: { reason, componentResults: [{ assertion, reason }] },
    };
    const safe = projectResultSchemas(row);
    expect(JSON.stringify(safe)).not.toContain('opaque');
    expect(safe.gradingResult.reason).toContain('^ok$');
    expect(safe.error).toBe(safe.gradingResult.componentResults[0].reason);
    expect(projectResultSchemas({ error: reason })).toEqual({ error: reason });
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
