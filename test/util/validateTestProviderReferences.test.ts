import { describe, expect, it } from 'vitest';
import {
  ProviderReferenceValidationError,
  validateTestProviderReferences,
} from '../../src/util/validateTestProviderReferences';

import type { Scenario, TestCase } from '../../src/types/index';
import type { ApiProvider } from '../../src/types/providers';

describe('validateTestProviderReferences', () => {
  const createProvider = (id: string, label?: string): ApiProvider =>
    ({
      id: () => id,
      label,
    }) as ApiProvider;

  const providers = [
    createProvider('openai:gpt-4', 'smart-model'),
    createProvider('openai:gpt-3.5-turbo', 'fast-model'),
  ];

  it('passes with no providers filter', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' } }];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('passes with valid provider label', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: ['smart-model'] }];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('passes with valid provider id', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: ['openai:gpt-4'] }];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('passes with wildcard match', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: ['openai:*'] }];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('passes with legacy prefix match', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: ['openai'] }];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('throws for invalid provider reference', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: ['nonexistent'] }];
    expect(() => validateTestProviderReferences(tests, providers)).toThrow(
      ProviderReferenceValidationError,
    );
    expect(() => validateTestProviderReferences(tests, providers)).toThrow(
      /does not exist.*Available providers/,
    );
  });

  it('throws for invalid provider reference with description', () => {
    const tests: TestCase[] = [
      { description: 'My test case', vars: { foo: 'bar' }, providers: ['nonexistent'] },
    ];
    expect(() => validateTestProviderReferences(tests, providers)).toThrow(/My test case/);
  });

  it('validates defaultTest providers', () => {
    const tests: TestCase[] = [];
    const defaultTest = { providers: ['smart-model'] };
    expect(() => validateTestProviderReferences(tests, providers, defaultTest)).not.toThrow();
  });

  it('throws for invalid defaultTest provider reference', () => {
    const tests: TestCase[] = [];
    const defaultTest = { providers: ['nonexistent'] };
    expect(() => validateTestProviderReferences(tests, providers, defaultTest)).toThrow(
      /defaultTest references provider/,
    );
  });

  it('throws for non-array providers field', () => {
    const tests: TestCase[] = [{ vars: { foo: 'bar' }, providers: 'not-an-array' as any }];
    expect(() => validateTestProviderReferences(tests, providers)).toThrow(/must be an array/);
  });

  it('validates multiple tests', () => {
    const tests: TestCase[] = [
      { vars: { foo: 'bar' }, providers: ['smart-model'] },
      { vars: { baz: 'qux' }, providers: ['fast-model'] },
    ];
    expect(() => validateTestProviderReferences(tests, providers)).not.toThrow();
  });

  it('throws for second invalid test', () => {
    const tests: TestCase[] = [
      { vars: { foo: 'bar' }, providers: ['smart-model'] },
      { vars: { baz: 'qux' }, providers: ['nonexistent'] },
    ];
    expect(() => validateTestProviderReferences(tests, providers)).toThrow(/Test #2/);
  });

  describe('scenario validation', () => {
    it('passes with valid scenario tests', () => {
      const tests: TestCase[] = [];
      const scenarios: Scenario[] = [
        {
          config: [{}],
          tests: [{ vars: { foo: 'bar' }, providers: ['smart-model'] }],
        },
      ];
      expect(() =>
        validateTestProviderReferences(tests, providers, undefined, scenarios),
      ).not.toThrow();
    });

    it('throws for invalid scenario test provider', () => {
      const tests: TestCase[] = [];
      const scenarios: Scenario[] = [
        {
          config: [{}],
          tests: [{ vars: { foo: 'bar' }, providers: ['nonexistent'] }],
        },
      ];
      expect(() => validateTestProviderReferences(tests, providers, undefined, scenarios)).toThrow(
        /Scenario #1 test #1 references provider "nonexistent"/,
      );
    });

    it('throws for invalid scenario config provider', () => {
      const tests: TestCase[] = [];
      const scenarios: Scenario[] = [
        {
          config: [{ providers: ['nonexistent'] }],
          tests: [],
        },
      ];
      expect(() => validateTestProviderReferences(tests, providers, undefined, scenarios)).toThrow(
        /Scenario #1 config\[0\] references provider "nonexistent"/,
      );
    });

    it('includes scenario description in error', () => {
      const tests: TestCase[] = [];
      const scenarios: Scenario[] = [
        {
          description: 'My scenario',
          config: [{}],
          tests: [{ vars: { foo: 'bar' }, providers: ['nonexistent'] }],
        },
      ];
      expect(() => validateTestProviderReferences(tests, providers, undefined, scenarios)).toThrow(
        /Scenario #1 \("My scenario"\)/,
      );
    });

    it('validates multiple scenarios', () => {
      const tests: TestCase[] = [];
      const scenarios: Scenario[] = [
        {
          config: [{}],
          tests: [{ vars: { foo: 'bar' }, providers: ['smart-model'] }],
        },
        {
          config: [{}],
          tests: [{ vars: { foo: 'bar' }, providers: ['nonexistent'] }],
        },
      ];
      expect(() => validateTestProviderReferences(tests, providers, undefined, scenarios)).toThrow(
        /Scenario #2/,
      );
    });
  });
});
