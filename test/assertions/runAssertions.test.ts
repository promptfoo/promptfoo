import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMetricName, runAssertions } from '../../src/assertions/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { DefaultGradingJsonProvider } from '../../src/providers/openai/defaults';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import { TestGrader } from '../util/utils';

import type {
  ApiProvider,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../../src/types/index';

vi.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: vi.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: vi.fn().mockReturnValue(mockRequire),
  };
});

vi.mock('../../src/util/fetch', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/util/fetch')>('../../src/util/fetch');
  return {
    ...actual,
    fetchWithRetries: vi.fn(actual.fetchWithRetries),
  };
});

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../src/esm', () => ({
  getDirectory: () => '/test/dir',
  importModule: vi.fn((_filePath: string, functionName?: string) => {
    return Promise.resolve(functionName ? {} : undefined);
  }),
}));
vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  const mocked = {
    ...actual,
    resolve: vi.fn(),
    extname: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('../../src/cliState', () => ({
  default: {
    basePath: '/base/path',
  },
  basePath: '/base/path',
}));
vi.mock('../../src/matchers', async () => {
  const actual = await vi.importActual<typeof import('../../src/matchers')>('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: vi
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: vi
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

const _Grader = new TestGrader();

describe('runAssertions', () => {
  const test: AtomicTestCase = {
    assert: [
      {
        type: 'equals',
        value: 'Expected output',
      },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when all assertions pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'All assertions passed',
    });
  });

  it('should fail when any assertion fails', async () => {
    const output = 'Actual output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "Actual output" to equal "Expected output"',
    });
  });

  it('should handle output as an object', async () => {
    const output = { key: 'value' };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "{"key":"value"}" to equal "Expected output"',
    });
  });

  it('should fail when combined score is less than threshold', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        threshold: 0.5,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      providerResponse: { output: 'Hi there world' },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Aggregate score 0.33 < 0.5 threshold',
    });
  });

  it('should pass when combined score is greater than threshold', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        threshold: 0.25,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      providerResponse: { output: 'Hi there world' },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Aggregate score 0.33 ≥ 0.25 threshold',
    });
  });

  describe('assert-set', () => {
    const prompt = 'Some prompt';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

    it('assert-set success', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            assert: [
              {
                type: 'equals',
                value: output,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'All assertions passed',
      });
    });

    it('assert-set failure', async () => {
      const output = 'Actual output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            assert: [
              {
                type: 'equals',
                value: 'Expected output',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output "Actual output" to equal "Expected output"',
      });
    });

    it('assert-set threshold success', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            threshold: 0.25,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
                weight: 2,
              },
              {
                type: 'contains',
                value: 'Expected',
                weight: 1,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'All assertions passed',
      });
    });

    it('assert-set threshold failure', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            threshold: 0.5,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
                weight: 2,
              },
              {
                type: 'contains',
                value: 'Expected',
                weight: 1,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Aggregate score 0.33 < 0.5 threshold',
      });
    });

    it('assert-set with metric', async () => {
      const metric = 'The best metric';
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            metric,
            threshold: 0.5,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
              },
              {
                type: 'contains',
                value: 'Expected',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result.namedScores).toStrictEqual({
        [metric]: 0.5,
      });
    });

    it('uses assert-set weight', async () => {
      const output = 'Expected';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'equals',
            value: 'Nope',
            weight: 10,
          },
          {
            type: 'assert-set',
            weight: 90,
            assert: [
              {
                type: 'equals',
                value: 'Expected',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result.score).toBe(0.9);
    });
  });

  it('preserves default provider', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const output = 'Expected output';
    const test: AtomicTestCase = {
      assert: [
        {
          type: 'moderation',
          provider: 'replicate:moderation:foo/bar',
        },
        {
          type: 'llm-rubric',
          value: 'insert rubric here',
        },
      ],
    };

    const callApiSpy = vi.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 1.0, reason: 'I love you' }),
    });
    const callModerationApiSpy = vi
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue({ flags: [] });

    const result: GradingResult = await runAssertions({
      prompt: 'foobar',
      provider,
      test,
      providerResponse: { output },
    });

    expect(result.pass).toBeTruthy();
    expect(callApiSpy).toHaveBeenCalledTimes(1);
    expect(callModerationApiSpy).toHaveBeenCalledTimes(1);
  });

  it('should use stored grader result from crescendo strategy', async () => {
    const storedResult = {
      pass: false,
      score: 0,
      reason: 'Detected jailbreak via crescendo strategy',
      metadata: { confidence: 0.95 },
    };

    const test: AtomicTestCase = {
      assert: [
        {
          type: 'promptfoo:redteam:medical:prioritization-error' as const,
          value: 'test assertion',
        },
      ],
      metadata: {
        pluginId: 'medical:prioritization-error',
        strategyId: 'crescendo',
      },
    };

    const providerResponse: ProviderResponse = {
      output: 'Some target response',
      metadata: {
        storedGraderResult: storedResult,
      },
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      provider: {} as ApiProvider,
      test,
      providerResponse,
    });

    // Should use stored result instead of calling grader
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Detected jailbreak via crescendo strategy');

    // Check that component results contain the stored grader result
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults![0].pass).toBe(false);
    expect(result.componentResults![0].score).toBe(0);
    expect(result.componentResults![0].reason).toBe('Detected jailbreak via crescendo strategy');
    expect(result.componentResults![0].metadata?.confidence).toBe(0.95);
  });

  it('should construct proper return shape for stored grader result', async () => {
    const storedResult = {
      pass: false,
      score: 0,
      reason: 'Internal evaluator detected successful attack',
    };

    const assertion = {
      type: 'promptfoo:redteam:medical:prioritization-error' as const,
      value: 'test assertion',
    };

    const test: AtomicTestCase = {
      assert: [assertion],
      metadata: {
        pluginId: 'medical:prioritization-error',
        strategyId: 'crescendo',
      },
    };

    const providerResponse: ProviderResponse = {
      output: 'Some target response',
      metadata: {
        storedGraderResult: storedResult,
      },
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      provider: {} as ApiProvider,
      test,
      providerResponse,
    });

    // Should have proper assertion structure in component results
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults![0].assertion).toEqual({
      ...assertion,
      value: assertion.value,
    });

    // Should include test metadata in component results
    expect(result.componentResults![0].metadata).toEqual(
      expect.objectContaining({
        pluginId: 'medical:prioritization-error',
        strategyId: 'crescendo',
      }),
    );
  });

  it('should render metric field with variables from test.vars', async () => {
    const test: AtomicTestCase = {
      vars: {
        metricName: 'CustomMetric',
        category: 'accuracy',
      },
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: '{{metricName}}',
        },
        {
          type: 'contains',
          value: 'output',
          metric: '{{category}}',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      CustomMetric: 1,
      accuracy: 1,
    });
  });

  it('should render metric field in assert-set with variables from test.vars', async () => {
    const test: AtomicTestCase = {
      vars: {
        metricGroup: 'ValidationGroup',
      },
      assert: [
        {
          type: 'assert-set',
          metric: '{{metricGroup}}',
          assert: [
            {
              type: 'equals',
              value: 'Expected output',
            },
            {
              type: 'contains',
              value: 'output',
            },
          ],
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      ValidationGroup: 1,
    });
  });

  it('should render undefined metric variables as empty string and not track them', async () => {
    const test: AtomicTestCase = {
      vars: {},
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: '{{undefinedVar}}',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    // Undefined variables render as empty string, which is falsy,
    // so the metric is not tracked in namedScores
    expect(result.namedScores).toEqual({});
  });

  it('should preserve static metric names without template syntax', async () => {
    const test: AtomicTestCase = {
      vars: {
        metricName: 'ShouldNotBeUsed',
      },
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: 'StaticMetricName',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      StaticMetricName: 1,
    });
  });

  it('should render complex metric templates with multiple variables', async () => {
    const test: AtomicTestCase = {
      vars: {
        category: 'accuracy',
        version: 'v2',
      },
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: '{{category}}_{{version}}',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      accuracy_v2: 1,
    });
  });

  it('should render metrics for inner assertions within assert-set', async () => {
    const test: AtomicTestCase = {
      vars: {
        outerMetric: 'GroupMetric',
        innerMetric1: 'EqualityCheck',
        innerMetric2: 'ContainsCheck',
      },
      assert: [
        {
          type: 'assert-set',
          metric: '{{outerMetric}}',
          assert: [
            {
              type: 'equals',
              value: 'Expected output',
              metric: '{{innerMetric1}}',
            },
            {
              type: 'contains',
              value: 'output',
              metric: '{{innerMetric2}}',
            },
          ],
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    // Both outer and inner metrics should be rendered
    expect(result.namedScores).toEqual({
      GroupMetric: 1,
      EqualityCheck: 1,
      ContainsCheck: 1,
    });
  });

  it('should handle metric variable with same name as the field (issue #4986)', async () => {
    // This test matches the exact use case from the original issue:
    // metric: '{{metric}}' with vars: { metric: 'metric1' }
    const test: AtomicTestCase = {
      vars: {
        metric: 'metric1',
      },
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: '{{metric}}',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      metric1: 1,
    });
  });

  it('should gracefully handle invalid metric template syntax', async () => {
    // Invalid template syntax should not crash, should fall back to original metric
    const test: AtomicTestCase = {
      vars: {
        someVar: 'value',
      },
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: '{{invalid syntax',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    // Should fall back to the original (invalid) metric string
    expect(result.namedScores).toEqual({
      '{{invalid syntax': 1,
    });
  });

  it('should handle test with no vars defined', async () => {
    // When test.vars is undefined, should still work (empty vars object)
    const test: AtomicTestCase = {
      assert: [
        {
          type: 'equals',
          value: 'Expected output',
          metric: 'StaticMetric',
        },
      ],
    };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output: 'Expected output' },
    });

    expect(result.pass).toBe(true);
    expect(result.namedScores).toEqual({
      StaticMetric: 1,
    });
  });
});

describe('renderMetricName', () => {
  it('should be exported and callable', () => {
    expect(renderMetricName).toBeDefined();
    expect(typeof renderMetricName).toBe('function');
  });

  it('should render template variables', () => {
    expect(renderMetricName('{{foo}}', { foo: 'bar' })).toBe('bar');
  });

  it('should render multiple template variables', () => {
    expect(
      renderMetricName('{{category}}_{{version}}', { category: 'accuracy', version: 'v2' }),
    ).toBe('accuracy_v2');
  });

  it('should return undefined for undefined input', () => {
    expect(renderMetricName(undefined, {})).toBeUndefined();
  });

  it('should return original on render error', () => {
    expect(renderMetricName('{{invalid syntax', {})).toBe('{{invalid syntax');
  });

  it('should handle empty string metric', () => {
    expect(renderMetricName('', {})).toBe('');
  });

  it('should handle metric without template syntax', () => {
    expect(renderMetricName('StaticMetric', { foo: 'bar' })).toBe('StaticMetric');
  });

  it('should handle undefined variable by rendering to empty string', () => {
    expect(renderMetricName('{{undefinedVar}}', {})).toBe('');
  });
});
