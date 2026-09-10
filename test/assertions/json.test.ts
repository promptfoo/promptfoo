import { describe, expect, it } from 'vitest';
import { handleContainsJson, handleIsJson } from '../../src/assertions/json';
import { createMockProvider, createProviderResponse } from '../factories/provider';
import { createAtomicTestCase } from '../factories/testSuite';

import type { AssertionParams, AssertionValue } from '../../src/types/index';

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
        valueFromScript: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
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
        valueFromScript: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
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
