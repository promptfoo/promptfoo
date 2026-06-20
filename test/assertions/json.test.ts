import { describe, expect, it } from 'vitest';
import { handleContainsJson, handleIsJson } from '../../src/assertions/json';

import type { AssertionParams } from '../../src/types/index';

function params(overrides: Partial<AssertionParams>): AssertionParams {
  return {
    assertion: { type: 'is-json' },
    renderedValue: undefined,
    outputString: '',
    inverse: false,
    valueFromScript: undefined,
    ...overrides,
  } as AssertionParams;
}

const objectSchema = { type: 'object', required: ['foo'], properties: { foo: { type: 'string' } } };
const yamlSchema = 'type: object\nrequired: [foo]\nproperties:\n  foo:\n    type: string';

describe('handleIsJson', () => {
  it('passes on valid JSON without a schema', () => {
    const r = handleIsJson(params({ outputString: '{"foo": "bar"}' }));
    expect(r.pass).toBe(true);
    expect(r.reason).toBe('Assertion passed');
  });

  it('fails on invalid JSON without a schema', () => {
    const r = handleIsJson(params({ outputString: 'not json' }));
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('Expected output to be valid JSON');
  });

  it('inverse passes when the output is not JSON', () => {
    const r = handleIsJson(params({ outputString: 'not json', inverse: true }));
    expect(r.pass).toBe(true);
  });

  it('passes when JSON conforms to an object schema', () => {
    const r = handleIsJson(params({ outputString: '{"foo": "bar"}', renderedValue: objectSchema }));
    expect(r.pass).toBe(true);
  });

  it('fails with a schema-error message when JSON does not conform', () => {
    const r = handleIsJson(params({ outputString: '{"foo": 1}', renderedValue: objectSchema }));
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('JSON does not conform to the provided schema');
  });

  it('inverse fails when JSON conforms to the schema', () => {
    const r = handleIsJson(
      params({ outputString: '{"foo": "bar"}', renderedValue: objectSchema, inverse: true }),
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('Output is JSON that conforms to the provided schema');
  });

  it('accepts a YAML string schema', () => {
    const r = handleIsJson(params({ outputString: '{"foo": "bar"}', renderedValue: yamlSchema }));
    expect(r.pass).toBe(true);
  });

  it('reads a file:// schema from valueFromScript', () => {
    const r = handleIsJson(
      params({
        outputString: '{"foo": "bar"}',
        renderedValue: 'file://schema.json',
        valueFromScript: objectSchema,
      }),
    );
    expect(r.pass).toBe(true);
  });

  it('throws when the schema value is neither string nor object', () => {
    expect(() =>
      handleIsJson(params({ outputString: '{"foo": "bar"}', renderedValue: 123 as never })),
    ).toThrow('is-json assertion must have a string or object value');
  });
});

describe('handleContainsJson', () => {
  it('passes when embedded JSON conforms to an object schema', () => {
    const r = handleContainsJson(
      params({
        assertion: { type: 'contains-json' },
        outputString: 'prefix {"foo": "bar"} suffix',
        renderedValue: objectSchema,
      }),
    );
    expect(r.pass).toBe(true);
  });

  it('fails with a schema-error message when embedded JSON does not conform', () => {
    const r = handleContainsJson(
      params({
        assertion: { type: 'contains-json' },
        outputString: '{"foo": 1}',
        renderedValue: objectSchema,
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('JSON does not conform to the provided schema');
  });

  it('inverse reports when embedded JSON conforms to the schema', () => {
    const r = handleContainsJson(
      params({
        assertion: { type: 'not-contains-json' },
        outputString: '{"foo": "bar"}',
        renderedValue: objectSchema,
        inverse: true,
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('Output contains JSON conforming to the provided schema');
  });

  it('accepts a YAML string schema', () => {
    const r = handleContainsJson(
      params({
        assertion: { type: 'contains-json' },
        outputString: '{"foo": "bar"}',
        renderedValue: yamlSchema,
      }),
    );
    expect(r.pass).toBe(true);
  });

  it('reads a file:// schema from valueFromScript', () => {
    const r = handleContainsJson(
      params({
        assertion: { type: 'contains-json' },
        outputString: '{"foo": "bar"}',
        renderedValue: 'file://schema.json',
        valueFromScript: objectSchema,
      }),
    );
    expect(r.pass).toBe(true);
  });

  it('throws when the schema value is neither string nor object', () => {
    expect(() =>
      handleContainsJson(
        params({
          assertion: { type: 'contains-json' },
          outputString: '{"foo": "bar"}',
          renderedValue: 123 as never,
        }),
      ),
    ).toThrow('contains-json assertion must have a string or object value');
  });
});
