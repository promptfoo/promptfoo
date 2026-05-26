import { describe, expect, it } from 'vitest';
import {
  findTestsWithoutAssertions,
  findUnknownTopLevelKeys,
} from '../../../src/util/config/strictValidation';

import type { TestCase } from '../../../src/types/index';

describe('findUnknownTopLevelKeys', () => {
  it('returns [] for a config with only known keys', () => {
    const config = {
      description: 'My eval',
      prompts: ['hello'],
      providers: ['openai:gpt-4o-mini'],
      tests: [{ vars: { name: 'world' } }],
      defaultTest: { assert: [{ type: 'contains', value: 'world' }] },
    };

    expect(findUnknownTopLevelKeys(config)).toEqual([]);
  });

  it('detects a typo where assert was placed at the top level', () => {
    // This is the exact failure mode reported in issue #4321.
    const config = {
      prompts: ['hello'],
      providers: ['openai:gpt-4o-mini'],
      tests: [{ vars: { name: 'world' } }],
      assert: [{ type: 'contains', value: 'world' }], // typo: should be defaultTest.assert
    };

    expect(findUnknownTopLevelKeys(config)).toEqual(['assert']);
  });

  it('detects multiple unknown keys and preserves insertion order', () => {
    const config = {
      junk: 'value',
      prompts: ['hello'],
      thisIsTypoed: { nested: 1 },
      providers: ['openai:gpt-4o-mini'],
      another: 'one',
    };

    expect(findUnknownTopLevelKeys(config)).toEqual(['junk', 'thisIsTypoed', 'another']);
  });

  it('accepts the deprecated plugins/strategies aliases since the loader auto-migrates them', () => {
    const config = {
      providers: ['openai:gpt-4o-mini'],
      prompts: ['hi'],
      plugins: ['harmful'],
      strategies: ['jailbreak'],
    };

    expect(findUnknownTopLevelKeys(config)).toEqual([]);
  });

  it('accepts evaluateOptions/commandLineOptions/targets from UnifiedConfigSchema', () => {
    const config = {
      providers: ['openai:gpt-4o-mini'],
      prompts: ['hi'],
      evaluateOptions: { repeat: 3 },
      commandLineOptions: { verbose: true },
      targets: ['openai:gpt-4o-mini'],
    };

    expect(findUnknownTopLevelKeys(config)).toEqual([]);
  });

  it('accepts the conventional $schema metadata key', () => {
    expect(findUnknownTopLevelKeys({ $schema: './config-schema.json', prompts: ['hi'] })).toEqual(
      [],
    );
  });

  it('returns [] for an empty config', () => {
    expect(findUnknownTopLevelKeys({})).toEqual([]);
  });
});

describe('findTestsWithoutAssertions', () => {
  it('returns [] when every test has assertions', () => {
    const tests: TestCase[] = [
      { assert: [{ type: 'contains', value: 'a' }] },
      { assert: [{ type: 'equals', value: 'b' }] },
    ];

    expect(findTestsWithoutAssertions(tests)).toEqual([]);
  });

  it('flags tests with no assert field', () => {
    const tests: TestCase[] = [
      { vars: { x: 1 } },
      { assert: [{ type: 'contains', value: 'b' }] },
      { vars: { x: 2 } },
    ];

    expect(findTestsWithoutAssertions(tests)).toEqual([0, 2]);
  });

  it('flags tests with an empty assert array', () => {
    const tests: TestCase[] = [{ assert: [] }, { assert: [{ type: 'is-json' }] }];

    expect(findTestsWithoutAssertions(tests)).toEqual([0]);
  });

  it('returns [] when defaultTest provides assertions for all tests', () => {
    const tests: TestCase[] = [{ vars: { x: 1 } }, { vars: { x: 2 } }];
    const defaultTest = { assert: [{ type: 'contains' as const, value: 'foo' }] };

    expect(findTestsWithoutAssertions(tests, defaultTest)).toEqual([]);
  });

  it('flags tests that disable inherited default assertions', () => {
    const tests: TestCase[] = [{ options: { disableDefaultAsserts: true } }];
    const defaultTest = { assert: [{ type: 'contains' as const, value: 'foo' }] };

    expect(findTestsWithoutAssertions(tests, defaultTest)).toEqual([0]);
  });

  it('requires a runnable leaf inside assertion sets', () => {
    const tests: TestCase[] = [
      { assert: [{ type: 'assert-set', assert: [] }] },
      {
        assert: [
          {
            type: 'assert-set',
            assert: [{ type: 'contains', value: 'ok' }],
          },
        ],
      },
    ];

    expect(findTestsWithoutAssertions(tests)).toEqual([0]);
  });

  it('does not treat an empty defaultTest.assert as a covering set', () => {
    const tests: TestCase[] = [{ vars: { x: 1 } }];

    expect(findTestsWithoutAssertions(tests, { assert: [] })).toEqual([0]);
  });

  it('returns [] for an empty test list', () => {
    expect(findTestsWithoutAssertions([])).toEqual([]);
  });

  it('ignores nullish entries defensively', () => {
    // The loader can occasionally produce sparse arrays during merges.
    const tests = [
      undefined as unknown as TestCase,
      { assert: [{ type: 'contains' as const, value: 'a' }] },
    ];

    expect(findTestsWithoutAssertions(tests)).toEqual([]);
  });
});
