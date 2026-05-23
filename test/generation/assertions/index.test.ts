import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAssertions, synthesize } from '../../../src/generation/assertions';
import {
  generateSampleOutputs,
  validateAssertions,
} from '../../../src/generation/assertions/assertionValidator';
import {
  analyzeCoverage,
  extractRequirements,
} from '../../../src/generation/assertions/coverageAnalyzer';
import { generateNegativeTests } from '../../../src/generation/assertions/negativeTestGenerator';
import { getDefaultProviders } from '../../../src/providers/defaults';
import { loadApiProvider } from '../../../src/providers/index';

import type { ApiProvider } from '../../../src/types';

vi.mock('../../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

vi.mock('../../../src/providers/index', () => ({
  loadApiProvider: vi.fn(),
}));

vi.mock('../../../src/generation/assertions/assertionValidator', () => ({
  filterAssertionsByValidation: vi.fn(),
  generateSampleOutputs: vi.fn(),
  validateAssertions: vi.fn(),
}));

vi.mock('../../../src/generation/assertions/coverageAnalyzer', () => ({
  analyzeCoverage: vi.fn(),
  extractRequirements: vi.fn(),
  suggestAssertions: vi.fn(),
}));

vi.mock('../../../src/generation/assertions/negativeTestGenerator', () => ({
  createLengthLimitAssertion: vi.fn(),
  createNotContainsAssertion: vi.fn(),
  createPiiCheckAssertion: vi.fn(),
  generateNegativeTests: vi.fn(),
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

describe('generation assertions index', () => {
  let callApi: ReturnType<typeof vi.fn>;
  let provider: ApiProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    callApi = vi.fn();
    provider = {
      id: () => 'assertion-provider',
      callApi,
      config: {},
    } as unknown as ApiProvider;
    vi.mocked(getDefaultProviders).mockResolvedValue({
      synthesizeProvider: provider,
    } as never);
    vi.mocked(loadApiProvider).mockResolvedValue(provider);
    vi.mocked(extractRequirements).mockResolvedValue([{ text: 'Return JSON' }] as never);
    vi.mocked(analyzeCoverage)
      .mockResolvedValueOnce({
        requirements: [],
        overallScore: 0.25,
        gaps: ['Missing JSON assertion'],
      } as never)
      .mockResolvedValue({
        requirements: [],
        overallScore: 1,
        gaps: [],
      } as never);
    vi.mocked(generateSampleOutputs).mockResolvedValue([
      { output: '{"ok":true}', expectedPass: true },
    ] as never);
    vi.mocked(validateAssertions).mockResolvedValue([{ accuracy: 1 }] as never);
    vi.mocked(generateNegativeTests).mockResolvedValue([
      { type: 'not-contains', value: 'secret' },
    ] as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects empty prompt input', async () => {
    await expect(generateAssertions([], [])).rejects.toThrow(
      'Assertion generation requires at least one prompt',
    );
  });

  it('generates mixed Python and LLM assertions with coverage, validation, and negative tests', async () => {
    callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          questions: [
            { label: 'JSON', question: 'Return JSON?' },
            { label: 'Tone', question: 'Sound helpful?' },
          ],
        }),
      })
      .mockImplementation((prompt: string) =>
        Promise.resolve({
          output: prompt.includes('Return JSON?')
            ? '```python\nreturn {"pass": True, "score": 1.0, "reason": "Valid JSON"}\n```'
            : 'None',
        }),
      );

    const progress = vi.fn();
    const result = await generateAssertions(
      [{ raw: 'Return JSON', label: 'Prompt' }],
      [{ assert: [{ type: 'contains', value: 'existing' }] }],
      {
        coverage: { enabled: true, extractRequirements: true, minCoverageScore: 0.8 },
        validation: { enabled: true, autoGenerateSamples: true, sampleCount: 1 },
        negativeTests: { enabled: true, types: ['should-not-contain'], count: 1 },
        numAssertions: 2,
        type: 'llm-rubric',
      },
      { onProgress: progress, jobId: 'assertions-job' },
    );

    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'python',
          metric: 'JSON',
          value: 'return {"pass": True, "score": 1.0, "reason": "Valid JSON"}\n',
        }),
        expect.objectContaining({ type: 'llm-rubric', metric: 'Tone' }),
      ]),
    );
    expect(result.validation).toEqual([{ accuracy: 1 }]);
    expect(result.negativeTests).toEqual([{ type: 'not-contains', value: 'secret' }]);
    expect(result.coverage).toEqual({
      requirements: [],
      overallScore: 1,
      gaps: [],
    });
    expect(provider.config?.maxTokens).toBe(3000);
    expect(progress).toHaveBeenCalled();
    expect(extractRequirements).toHaveBeenCalled();
    expect(analyzeCoverage).toHaveBeenCalledTimes(2);
  });

  it('uses an explicitly requested provider and keeps supplied validation samples', async () => {
    callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          questions: [{ label: 'Exactness', question: 'Match exactly?' }],
        }),
      })
      .mockResolvedValueOnce({ output: 'return {"pass": True, "score": 1.0}' });

    const result = await generateAssertions([{ raw: 'Return exactly', label: 'Prompt' }], [], {
      provider: 'custom-provider',
      validation: {
        enabled: true,
        autoGenerateSamples: false,
        sampleCount: 5,
        sampleOutputs: [{ output: 'exact', expectedPass: true }],
      },
      numQuestions: 1,
    });

    expect(loadApiProvider).toHaveBeenCalledWith('custom-provider', expect.any(Object));
    expect(generateSampleOutputs).not.toHaveBeenCalled();
    expect(validateAssertions).toHaveBeenCalledWith(
      result.assertions,
      [{ output: 'exact', expectedPass: true }],
      provider,
    );
  });

  it('surfaces malformed question responses and supports the backward-compatible synthesize wrapper', async () => {
    callApi.mockResolvedValueOnce({ output: 'not-json' });
    await expect(
      generateAssertions([{ raw: 'Prompt', label: 'Prompt' }], [], { numAssertions: 1 }),
    ).rejects.toThrow('Expected at least one JSON object in questions response');

    callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          questions: [{ label: 'Only', question: 'Use JSON?' }],
        }),
      })
      .mockResolvedValueOnce({ output: '"None"' });

    await expect(
      synthesize({
        prompts: ['Prompt'],
        tests: [],
        numQuestions: 1,
      }),
    ).resolves.toEqual([expect.objectContaining({ metric: 'Only', type: 'pi' })]);
  });
});
