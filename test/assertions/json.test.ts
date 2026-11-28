import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { handleContainsJson, handleIsJson } from '../../src/assertions/json';
import cliState from '../../src/cliState';
import { sanitizeResultForJsonlArtifact } from '../../src/evaluator/resultProcessing';
import { validateFunctionCall } from '../../src/providers/google/util';
import { resetAjv } from '../../src/util/json';
import { createMockProvider, createProviderResponse } from '../factories/provider';
import { createAtomicTestCase } from '../factories/testSuite';

import type { AssertionParams, AssertionValue } from '../../src/types/index';

const createNameSchema = () => ({
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' } },
});

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const makeParams = (overrides: Partial<AssertionParams>): AssertionParams =>
  ({
    baseType: 'is-json' as const,
    assertionValueContext: {
      vars: {},
      test: createAtomicTestCase(),
      prompt: 'test prompt',
      logProbs: undefined,
      provider: mockProvider,
      providerResponse: { output: '{}' },
    },
    output: '{}',
    providerResponse: { output: '{}' },
    test: createAtomicTestCase(),
    inverse: false,
    ...overrides,
  }) as AssertionParams;

const NAME_SCHEMA_YAML = [
  'type: object',
  'required:',
  '  - name',
  'properties:',
  '  name:',
  '    type: string',
].join('\n');

describe.each([
  { type: 'is-json' as const, handler: handleIsJson },
  { type: 'contains-json' as const, handler: handleContainsJson },
])('$type ordering annotations', ({ type, handler }) => {
  it.each(['false', 'true'])(
    'works before and after function validation (relaxed=%s)',
    (disabled) => {
      resetAjv();
      cliState.withEnv({ PROMPTFOO_DISABLE_AJV_STRICT_MODE: disabled }, () => {
        const params = makeParams({
          assertion: { type },
          renderedValue: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            property_ordering: ['name'],
          },
          outputString: '{"name":"fixture"}',
        });
        expect(handler(params).pass).toBe(true);
        expect(handler({ ...params, outputString: '{"name":1}' }).pass).toBe(false);
        validateFunctionCall(
          [{ functionCall: { name: 'fixture', args: { name: 'fixture' } } }],
          [
            {
              functionDeclarations: [
                {
                  name: 'fixture',
                  parameters: {
                    type: 'OBJECT',
                    properties: { name: { type: 'STRING' } },
                    required: ['name'],
                  },
                },
              ],
            },
          ],
        );
        expect(handler(params).pass).toBe(true);
        expect(handler({ ...params, outputString: '{"name":1}' }).pass).toBe(false);
      });
    },
  );
});

describe('handleIsJson', () => {
  it('passes for valid JSON with no schema', () => {
    const result = handleIsJson(
      makeParams({
        assertion: { type: 'is-json' },
        outputString: '{"a": 1}',
      }),
    );
    expect(result.pass).toBe(true);
  });

  it('rejects an encoded scheme instead of validating against the built-in JSON meta-schema', () => {
    const params = makeParams({
      assertion: { type: 'is-json' },
      renderedValue: '$ref: "%68ttp://json-schema.org/draft-07/schema#"',
      outputString: '{}',
    });
    expect(() => handleIsJson(params)).toThrow('URI scheme is malformed.');
  });

  it('validates against a YAML string schema', () => {
    const pass = handleIsJson(
      makeParams({
        assertion: { type: 'is-json', value: NAME_SCHEMA_YAML },
        renderedValue: NAME_SCHEMA_YAML as AssertionValue,
        outputString: '{"name": "promptfoo"}',
      }),
    );
    expect(pass.pass).toBe(true);

    const fail = handleIsJson(
      makeParams({
        assertion: { type: 'is-json', value: NAME_SCHEMA_YAML },
        renderedValue: NAME_SCHEMA_YAML as AssertionValue,
        outputString: '{"other": 1}',
      }),
    );
    expect(fail.pass).toBe(false);
    expect(fail.reason).toContain('JSON does not conform to the provided schema');
  });

  it('uses the schema exported by a file:// reference', () => {
    const result = handleIsJson(
      makeParams({
        assertion: { type: 'is-json', value: 'file://schema.json' },
        renderedValue: 'file://schema.json' as AssertionValue,
        valueFromScript: createNameSchema(),
        outputString: '{"name": "promptfoo"}',
      }),
    );
    expect(result.pass).toBe(true);
  });

  it('throws when a file:// reference does not export a schema', () => {
    expect(() =>
      handleIsJson(
        makeParams({
          assertion: { type: 'is-json', value: 'file://schema.json' },
          renderedValue: 'file://schema.json' as AssertionValue,
          valueFromScript: undefined,
          outputString: '{"name": "promptfoo"}',
        }),
      ),
    ).toThrow('is-json references a file that does not export a JSON schema');
  });

  it('throws for a non-string, non-object schema value', () => {
    expect(() =>
      handleIsJson(
        makeParams({
          assertion: { type: 'is-json' },
          renderedValue: 42 as unknown as AssertionValue,
          outputString: '{"a": 1}',
        }),
      ),
    ).toThrow('is-json assertion must have a string or object value');
  });
});

describe('handleContainsJson', () => {
  it('passes when the output contains JSON with no schema', () => {
    const result = handleContainsJson(
      makeParams({
        assertion: { type: 'contains-json' },
        outputString: 'Here is the result: {"a": 1}',
      }),
    );
    expect(result.pass).toBe(true);
  });

  it('validates contained JSON against a YAML string schema', () => {
    const pass = handleContainsJson(
      makeParams({
        assertion: { type: 'contains-json', value: NAME_SCHEMA_YAML },
        renderedValue: NAME_SCHEMA_YAML as AssertionValue,
        outputString: 'result: {"name": "promptfoo"}',
      }),
    );
    expect(pass.pass).toBe(true);

    const fail = handleContainsJson(
      makeParams({
        assertion: { type: 'contains-json', value: NAME_SCHEMA_YAML },
        renderedValue: NAME_SCHEMA_YAML as AssertionValue,
        outputString: 'result: {"other": 1}',
      }),
    );
    expect(fail.pass).toBe(false);
    expect(fail.reason).toContain('JSON does not conform to the provided schema');
  });

  it('uses the schema exported by a file:// reference', () => {
    const result = handleContainsJson(
      makeParams({
        assertion: { type: 'contains-json', value: 'file://schema.json' },
        renderedValue: 'file://schema.json' as AssertionValue,
        valueFromScript: createNameSchema(),
        outputString: 'result: {"name": "promptfoo"}',
      }),
    );
    expect(result.pass).toBe(true);
  });

  it('throws when a file:// reference does not export a schema', () => {
    expect(() =>
      handleContainsJson(
        makeParams({
          assertion: { type: 'contains-json', value: 'file://schema.json' },
          renderedValue: 'file://schema.json' as AssertionValue,
          valueFromScript: undefined,
          outputString: 'result: {"name": "promptfoo"}',
        }),
      ),
    ).toThrow('contains-json references a file that does not export a JSON schema');
  });

  it('throws for a non-string, non-object schema value', () => {
    expect(() =>
      handleContainsJson(
        makeParams({
          assertion: { type: 'contains-json' },
          renderedValue: 42 as unknown as AssertionValue,
          outputString: '{"a": 1}',
        }),
      ),
    ).toThrow('contains-json assertion must have a string or object value');
  });
});

describe('schema diagnostics', () => {
  it.each([handleIsJson, handleContainsJson])(
    'protects validation and YAML errors in %s',
    (handler) => {
      const renderedValue = {
        type: 'object',
        properties: { password: { type: 'string', pattern: '^opaque$' } },
      };
      const params = makeParams({
        renderedValue,
        assertion: { type: 'is-json', value: renderedValue },
        outputString: '{"password":"wrong"}',
      });
      const grade = handler(params);
      expect(grade.pass).toBe(false);
      expect(grade.reason).toContain('must match pattern');
      expect(grade.reason).not.toContain('opaque');
      expect(handler({ ...params, outputString: '{"password":"opaque"}' }).pass).toBe(true);
      expect(() =>
        handler({ ...params, renderedValue: 'properties:\n  password: {const: "opaque"' }),
      ).toThrow(/^Invalid inline assertion schema at line 2, column \d+$/);
    },
  );

  it.each([
    'properties:\n  password:\n    type: string\n    pattern: "^{{password}}$"',
    '{"properties":{"password":{"type":"string","pattern":"^{{password}}$"}}}',
  ])(
    'projects rendered inline schemas in grading metadata without changing the live result',
    async (value) => {
      const assertion = { type: 'is-json' as const, value };
      const testCase = { vars: { password: 'opaque' }, assert: [assertion] };
      const response = { output: '{"password":"wrong"}' };
      const gradingResult = await runAssertion({
        prompt: 'test',
        assertion,
        test: testCase,
        providerResponse: response,
        provider: mockProvider,
      });
      const artifact = sanitizeResultForJsonlArtifact({ testCase, gradingResult, response });
      expect(gradingResult.metadata?.renderedAssertionValue).toContain('opaque');
      expect(JSON.stringify(artifact)).not.toContain('opaque');
      expect(artifact.gradingResult.score).toBe(0);
      expect(artifact.response).toEqual(response);
    },
  );
});
