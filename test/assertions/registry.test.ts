import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defaultAssertionRegistry } from '../../src/assertions/defaultRegistry';
import { runAssertion, runAssertions } from '../../src/assertions/index';
import { runPureAssertion } from '../../src/assertions/pure';
import {
  createPureAssertionRegistry,
  pureAssertionRegistry,
} from '../../src/assertions/pureRegistry';
import { AssertionRegistry } from '../../src/assertions/registry';
import { BaseAssertionTypesSchema } from '../../src/types/index';

import type { PureAssertionType } from '../../src/assertions/pureRegistry';
import type { AssertionCapabilityPack, AssertionHandler } from '../../src/assertions/registryTypes';
import type {
  Assertion,
  AssertionParams,
  AtomicTestCase,
  GradingResult,
} from '../../src/types/index';

vi.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

// Causes a SIGSEGV in GitHub Actions.
vi.mock('libsql');

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const passingHandler: AssertionHandler<AssertionParams, GradingResult> = ({ assertion }) => ({
  pass: true,
  score: 1,
  reason: 'handled',
  assertion,
});
type TestAssertionPack = AssertionCapabilityPack<AssertionParams, GradingResult>;

const pureAssertionTypes = [
  'bleu',
  'contains',
  'contains-all',
  'contains-any',
  'cost',
  'equals',
  'finish-reason',
  'gleu',
  'icontains',
  'icontains-all',
  'icontains-any',
  'latency',
  'perplexity',
  'perplexity-score',
  'regex',
  'starts-with',
  'tool-call-f1',
  'word-count',
] as const;

const nonPureAssertionTypes = [
  // Model-graded
  'agent-rubric',
  'answer-relevance',
  'classifier',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'conversation-relevance',
  'factuality',
  'g-eval',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'moderation',
  'pi',
  'search-rubric',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  // Scripts
  'javascript',
  'python',
  'ruby',
  // Trace-aware
  'skill-used',
  'trace-error-spans',
  'trace-span-count',
  'trace-span-duration',
  'trajectory:goal-success',
  'trajectory:step-count',
  'trajectory:tool-args-match',
  'trajectory:tool-sequence',
  'trajectory:tool-used',
  // Host callback
  'webhook',
] as const;

describe('AssertionRegistry', () => {
  it('registers every canonical exact assertion type in the default registry', () => {
    expect([...defaultAssertionRegistry.registeredTypes].sort()).toEqual(
      [...BaseAssertionTypesSchema.options].sort(),
    );
  });

  it('rejects duplicate exact and prefix registrations across capability packs', () => {
    const repeatedPack = {
      name: 'repeated',
      handlers: { equals: passingHandler },
    } satisfies TestAssertionPack;
    const exactPacks = [
      { name: 'first', handlers: { equals: passingHandler } },
      { name: 'second', handlers: { equals: passingHandler } },
    ] satisfies TestAssertionPack[];
    const prefixPacks = [
      {
        name: 'first',
        prefixes: [{ prefix: 'custom:', handler: passingHandler }],
      },
      {
        name: 'second',
        prefixes: [{ prefix: 'custom:', handler: passingHandler }],
      },
    ] satisfies TestAssertionPack[];

    expect(
      () => new AssertionRegistry<AssertionParams, GradingResult>([repeatedPack, repeatedPack]),
    ).toThrow('Assertion type "equals" is registered by both "repeated" and "repeated"');
    expect(() => new AssertionRegistry<AssertionParams, GradingResult>(exactPacks)).toThrow(
      'Assertion type "equals" is registered by both "first" and "second"',
    );
    expect(() => new AssertionRegistry<AssertionParams, GradingResult>(prefixPacks)).toThrow(
      'Assertion prefix "custom:" is registered by both "first" and "second"',
    );
  });

  it('prefers exact matches and resolves the longest matching prefix', () => {
    const exactHandler: AssertionHandler<AssertionParams, GradingResult> = () => ({
      pass: true,
      score: 1,
      reason: 'exact',
    });
    const broadPrefixHandler: AssertionHandler<AssertionParams, GradingResult> = () => ({
      pass: true,
      score: 1,
      reason: 'broad',
    });
    const narrowPrefixHandler: AssertionHandler<AssertionParams, GradingResult> = () => ({
      pass: true,
      score: 1,
      reason: 'narrow',
    });
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'test',
        handlers: { equals: exactHandler },
        prefixes: [
          { prefix: 'equal', handler: broadPrefixHandler },
          { prefix: 'promptfoo:redteam:', handler: broadPrefixHandler },
          { prefix: 'promptfoo:redteam:coding-agent:', handler: narrowPrefixHandler },
        ],
      },
    ]);

    expect(registry.resolve('equals')).toBe(exactHandler);
    expect(registry.resolve('promptfoo:redteam:plugin')).toBe(broadPrefixHandler);
    expect(registry.resolve('promptfoo:redteam:coding-agent:system-prompt-override')).toBe(
      narrowPrefixHandler,
    );
  });

  it('continues registering packs after an exact-only pack skips prefix sorting', () => {
    const prefixHandler: AssertionHandler<AssertionParams, GradingResult> = () => ({
      pass: true,
      score: 1,
      reason: 'prefix',
    });
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      { name: 'exact-only', handlers: { equals: passingHandler } },
      {
        name: 'prefix',
        prefixes: [{ prefix: 'custom:', handler: prefixHandler }],
      },
    ]);

    expect(registry.resolve('equals')).toBe(passingHandler);
    expect(registry.resolve('custom:assertion')).toBe(prefixHandler);
  });
});

describe('pure assertion registry', () => {
  it.each(pureAssertionTypes)('supports the basic %s handler', (type) => {
    expect(pureAssertionRegistry.resolve(type)).toBeTypeOf('function');
  });

  it.each(nonPureAssertionTypes)('excludes the non-pure %s handler', (type) => {
    expect(pureAssertionRegistry.resolve(type)).toBeUndefined();
  });

  it('excludes redteam prefix handlers', () => {
    expect(
      pureAssertionRegistry.resolve('promptfoo:redteam:harmful:violent-crime'),
    ).toBeUndefined();
    expect(pureAssertionRegistry.registeredPrefixes).toEqual([]);
  });

  it.each([
    {
      assertion: { type: 'equals', value: 'expected' } satisfies Assertion,
      output: 'expected',
    },
    {
      assertion: { type: 'contains', value: 'needle' } satisfies Assertion,
      output: 'a needle in a haystack',
    },
  ])('runs $assertion.type through the pure registry', async ({ assertion, output }) => {
    const result = await runAssertion({
      assertion,
      providerResponse: { output },
      registry: createPureAssertionRegistry(),
      test: {} as AtomicTestCase,
    });

    expect(result.pass).toBe(true);
  });

  it('runs through the host-free pure runner', async () => {
    await expect(
      runPureAssertion({
        assertion: { type: 'contains', value: 'needle' },
        providerResponse: { output: 'a needle in a haystack' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 1 });
    await expect(
      runPureAssertion({
        assertion: { type: 'not-contains', value: 'missing' },
        providerResponse: { output: 'a needle in a haystack' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 1 });
  });

  it('rejects templated values that require host rendering', async () => {
    for (const value of ['{{ expected }}', ['{{ expected }}'], { answer: '{{ expected }}' }]) {
      await expect(
        runPureAssertion({
          assertion: { type: 'equals', value },
          providerResponse: { output: 'expected' },
        }),
      ).rejects.toThrow(
        'Pure assertion values must be fully rendered. Use runAssertion() for templated values.',
      );
    }
  });

  it('rejects unsupported assertion types at compile time', () => {
    expectTypeOf<'llm-rubric'>().not.toMatchTypeOf<PureAssertionType>();
    expectTypeOf<'not-cost'>().not.toMatchTypeOf<PureAssertionType>();
  });

  it('rejects unsupported inverse assertion types at runtime', async () => {
    await expect(
      runPureAssertion({
        assertion: { type: 'not-cost', threshold: 1 },
        providerResponse: { output: 'response', cost: 0 },
      } as never),
    ).rejects.toThrow('Unsupported pure inverse assertion type: not-cost');
  });

  it('preserves strict equality for enumerable symbol and array properties', async () => {
    const symbol = Symbol('extra');
    const objectWithSymbol = { [symbol]: 'value' };
    const arrayWithProperty: unknown[] & { extra?: string } = [];
    arrayWithProperty.extra = 'value';

    await expect(
      runPureAssertion({
        assertion: { type: 'equals', value: objectWithSymbol },
        providerResponse: { output: '{}' },
      }),
    ).resolves.toMatchObject({ pass: false, score: 0 });
    await expect(
      runPureAssertion({
        assertion: { type: 'equals', value: arrayWithProperty },
        providerResponse: { output: '[]' },
      }),
    ).resolves.toMatchObject({ pass: false, score: 0 });
  });
});

describe('assertion registry injection', () => {
  it('uses an injected registry in runAssertion', async () => {
    const fakeHandler = vi.fn((params: AssertionParams): GradingResult => {
      return {
        pass: true,
        score: 0.75,
        reason: 'fake registry handler',
        assertion: params.assertion,
      };
    });
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'fake',
        handlers: { equals: fakeHandler },
      },
    ]);

    const result = await runAssertion({
      assertion: { type: 'equals', value: 'ignored' },
      providerResponse: { output: 'actual output' },
      registry,
      test: {} as AtomicTestCase,
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.75,
      reason: 'fake registry handler',
    });
    expect(fakeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        baseType: 'equals',
        output: 'actual output',
        outputString: 'actual output',
      }),
    );
  });

  it('forwards an injected registry through runAssertions', async () => {
    const fakeHandler = vi.fn((params: AssertionParams): GradingResult => {
      return {
        pass: true,
        score: 1,
        reason: 'batch fake registry handler',
        assertion: params.assertion,
      };
    });
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'fake',
        handlers: { equals: fakeHandler },
      },
    ]);

    const result = await runAssertions({
      providerResponse: { output: 'actual output' },
      registry,
      test: {
        assert: [{ type: 'equals', value: 'ignored' }],
      } as AtomicTestCase,
    });

    expect(fakeHandler).toHaveBeenCalledTimes(1);
    expect(result.componentResults).toEqual([
      expect.objectContaining({ reason: 'batch fake registry handler' }),
    ]);
  });

  it('preserves the unknown assertion error message', async () => {
    const registry = new AssertionRegistry<AssertionParams, GradingResult>();
    for (const type of ['custom-unknown', 'not-custom-unknown']) {
      const assertion = { type } as unknown as Assertion;

      await expect(
        runAssertion({
          assertion,
          providerResponse: { output: 'actual output' },
          registry,
          test: {} as AtomicTestCase,
        }),
      ).rejects.toThrow(`Unknown assertion type: ${type}`);
    }
  });

  it('rejects invalid grading results from runtime-provided registries', async () => {
    const invalidRegistry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'invalid',
        handlers: {
          equals: (() => 'not a grading result') as unknown as AssertionHandler<
            AssertionParams,
            GradingResult
          >,
        },
      },
    ]);

    await expect(
      runAssertion({
        assertion: { type: 'equals', value: 'expected' },
        providerResponse: { output: 'expected' },
        registry: invalidRegistry,
        test: {} as AtomicTestCase,
      }),
    ).rejects.toThrow('Assertion handler for "equals" returned an invalid grading result');
  });

  it('enriches frozen handler results without mutating them', async () => {
    const result = Object.freeze({
      pass: true,
      score: 1,
      reason: 'frozen',
      metadata: Object.freeze({ existing: true }),
    }) satisfies GradingResult;
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'frozen',
        handlers: { equals: () => result },
      },
    ]);

    await expect(
      runAssertion({
        assertion: { type: 'equals', value: '{{ expected }}' },
        providerResponse: { output: 'expected' },
        registry,
        test: { vars: { expected: 'expected' } } as AtomicTestCase,
      }),
    ).resolves.toMatchObject({
      metadata: { existing: true, renderedAssertionValue: 'expected' },
    });
    expect(result.metadata).toEqual({ existing: true });
  });

  it('rejects malformed metadata from runtime-provided registries', async () => {
    const registry = new AssertionRegistry<AssertionParams, GradingResult>([
      {
        name: 'invalid-metadata',
        handlers: {
          equals: () =>
            ({
              pass: true,
              score: 1,
              reason: 'invalid metadata',
              metadata: 'invalid',
            }) as unknown as GradingResult,
        },
      },
    ]);

    await expect(
      runAssertion({
        assertion: { type: 'equals', value: 'expected' },
        providerResponse: { output: 'expected' },
        registry,
        test: {} as AtomicTestCase,
      }),
    ).rejects.toThrow('Assertion handler for "equals" returned invalid metadata');
  });

  it('rejects incompatible handlers at compile time', () => {
    type IncompatiblePack = {
      name: 'invalid';
      handlers: { equals: () => string };
    };

    expectTypeOf<IncompatiblePack>().not.toMatchTypeOf<TestAssertionPack>();
  });
});
