import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterAssertionsByValidation,
  generateSampleOutputs,
  validateAssertions,
} from '../../../src/generation/assertions/assertionValidator';
import { runPythonCode } from '../../../src/python/wrapper';

import type { ApiProvider, Assertion } from '../../../src/types';
import type { AssertionValidationResult } from '../../../src/generation/types';

vi.mock('../../../src/python/wrapper', () => ({
  runPythonCode: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    child: vi.fn().mockReturnValue({}),
  },
}));

describe('assertionValidator', () => {
  let callApi: ReturnType<typeof vi.fn>;
  let provider: ApiProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    callApi = vi.fn();
    provider = {
      id: () => 'validator-provider',
      callApi,
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns early for empty assertions and marks assertions unusable without samples', async () => {
    await expect(validateAssertions([], [], provider)).resolves.toEqual([]);

    await expect(
      validateAssertions([{ type: 'contains', value: 'hello' }], [], provider),
    ).resolves.toEqual([
      expect.objectContaining({
        accuracy: 0,
        recommendation: 'keep',
        issues: ['No samples provided for validation'],
      }),
    ]);
  });

  it('classifies deterministic string and regex assertions across pass/fail cases', async () => {
    const assertions: Assertion[] = [
      { type: 'contains', value: 'hello' },
      { type: 'equals', value: 'exact match' },
      { type: 'icontains', value: 'WELCOME' },
      { type: 'regex', value: '^ticket-\\d+$' },
      { type: 'regex', value: '[' },
    ];

    const results = await validateAssertions(
      assertions,
      [
        { output: 'hello there', expectedPass: true },
        { output: 'not here', expectedPass: false },
      ],
      provider,
    );

    expect(results[0]).toMatchObject({
      accuracy: 1,
      truePositives: 1,
      trueNegatives: 1,
      recommendation: 'keep',
    });
    expect(results[1]).toMatchObject({
      falseNegatives: 1,
      recommendation: 'modify',
    });
    expect(results[2]).toMatchObject({
      falseNegatives: 1,
      recommendation: 'modify',
    });
    expect(results[3]).toMatchObject({
      falseNegatives: 1,
      recommendation: 'modify',
    });
    expect(results[4]).toMatchObject({
      trueNegatives: 1,
      falseNegatives: 1,
      recommendation: 'modify',
    });
  });

  it('executes Python assertions and falls back safely for unexpected Python outcomes', async () => {
    vi.mocked(runPythonCode)
      .mockResolvedValueOnce({ pass: true, score: 0.9 })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('unexpected' as never)
      .mockRejectedValueOnce(new Error('python failed'));

    const results = await validateAssertions(
      [
        { type: 'python', value: 'return {"pass": True, "score": 0.9}' },
        { type: 'python', value: 'return False' },
        { type: 'python', value: 'return "weird"' },
        { type: 'python', value: 'raise RuntimeError()' },
      ],
      [{ output: 'sample', expectedPass: true }],
      provider,
    );

    expect(results[0]).toMatchObject({ accuracy: 1, recommendation: 'keep' });
    expect(results[1]).toMatchObject({ falseNegatives: 1, recommendation: 'remove' });
    expect(results[2]).toMatchObject({ falseNegatives: 1, recommendation: 'remove' });
    expect(results[3]).toMatchObject({ falseNegatives: 1, recommendation: 'remove' });
  });

  it('evaluates LLM-backed assertions, unknown types, malformed JSON, and missing provider output', async () => {
    callApi
      .mockResolvedValueOnce({ output: JSON.stringify({ pass: true, score: 0.75 }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ pass: false, score: 0 }) })
      .mockResolvedValueOnce({ output: 'not-json' });

    const results = await validateAssertions(
      [
        { type: 'pi', value: 'Be helpful' },
        { type: 'custom-type' as Assertion['type'], value: 'Use fallback evaluator' },
        { type: 'llm-rubric', value: 'Return a crisp answer' },
      ],
      [{ output: 'sample', expectedPass: true }],
      provider,
    );

    expect(results[0]).toMatchObject({ accuracy: 1, recommendation: 'keep' });
    expect(results[1]).toMatchObject({ falseNegatives: 1, recommendation: 'remove' });
    expect(results[2]).toMatchObject({ falseNegatives: 1, recommendation: 'remove' });

    callApi.mockResolvedValueOnce({});
    await expect(
      validateAssertions([{ type: 'g-eval', value: 'Must be factual' }], [
        { output: 'sample', expectedPass: true },
      ], provider),
    ).rejects.toThrow('Provider response must have output');
  });

  it('generates and filters valid sample outputs while rejecting malformed provider responses', async () => {
    callApi
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ output: 'not-json' })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          samples: [
            { output: 'good', expectedPass: true, reason: 'clear' },
            { output: 'bad', expectedPass: false },
            null,
            { output: 'missing expectation' },
          ],
        }),
      });

    await expect(generateSampleOutputs(['Prompt'], provider)).rejects.toThrow(
      'Provider response must have output',
    );
    await expect(generateSampleOutputs(['Prompt'], provider)).resolves.toEqual([]);
    await expect(generateSampleOutputs(['Prompt'], provider, 4)).resolves.toEqual([
      { output: 'good', expectedPass: true, reason: 'clear' },
      { output: 'bad', expectedPass: false, reason: undefined },
    ]);
  });

  it('filters assertions by validation accuracy thresholds', () => {
    const assertions: Assertion[] = [
      { type: 'contains', value: 'keep' },
      { type: 'contains', value: 'drop' },
    ];
    const validation = [
      { accuracy: 0.9 },
      { accuracy: 0.2 },
    ] as AssertionValidationResult[];

    expect(filterAssertionsByValidation(assertions, validation)).toEqual([assertions[0]]);
    expect(filterAssertionsByValidation(assertions, validation, 0.1)).toEqual(assertions);
  });
});
