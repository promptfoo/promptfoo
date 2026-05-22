import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLengthLimitAssertion,
  createNotContainsAssertion,
  createPiiCheckAssertion,
  generateNegativeTests,
} from '../../../src/generation/assertions/negativeTestGenerator';

import type { ApiProvider } from '../../../src/types';

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

describe('negativeTestGenerator', () => {
  let mockProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCallApi = vi.fn();
    mockProvider = {
      id: () => 'mock-provider',
      callApi: mockCallApi,
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects negative test generation without prompts', async () => {
    await expect(generateNegativeTests([], mockProvider)).rejects.toThrow(
      'At least one prompt is required for negative test generation',
    );
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('throws when provider output is missing', async () => {
    mockCallApi.mockResolvedValue({});

    await expect(generateNegativeTests(['Prompt'], mockProvider)).rejects.toThrow(
      'Provider response must have output',
    );
  });

  it('falls back to defaults when parsing fails or assertions are malformed', async () => {
    mockCallApi
      .mockResolvedValueOnce({ output: 'not-json' })
      .mockResolvedValueOnce({ output: JSON.stringify({ assertions: 'invalid' }) });

    await expect(
      generateNegativeTests(['Prompt'], mockProvider, {
        types: [
          'should-not-contain',
          'should-not-expose',
          'should-not-repeat',
          'should-not-exceed-length',
        ],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'not-icontains' }),
        expect.objectContaining({ type: 'javascript', metric: 'No PII Exposure' }),
        expect.objectContaining({ type: 'javascript', metric: 'No Repetition' }),
        expect.objectContaining({ type: 'javascript', metric: 'Length Limit' }),
      ]),
    );

    await expect(
      generateNegativeTests(['Prompt'], mockProvider, {
        types: ['should-not-contain'],
      }),
    ).resolves.toEqual([expect.objectContaining({ type: 'not-icontains' })]);
  });

  it('converts valid generated negative tests and skips unusable items', async () => {
    mockCallApi.mockResolvedValue({
      output: {
        assertions: [
          {
            type: 'should-not-contain',
            metric: 'No forbidden phrase',
            value: 'classified',
          },
          {
            type: 'should-not-hallucinate',
            metric: 'No fabricated data',
            value: 'Claims must be sourced',
          },
          {
            type: 'should-not-expose',
            metric: 'No secrets',
            value: 'API key, password',
          },
          {
            type: 'should-not-repeat',
            metric: 'No repetition',
            value: '',
          },
          {
            type: 'should-not-exceed-length',
            value: '120 words, 600 characters',
          },
          null,
          {
            type: 'should-not-contain',
            metric: 42,
            value: 123,
          },
          {
            type: 'ignored-type',
            metric: 'Ignored',
            value: 'Ignored',
          },
        ],
      },
    });

    const assertions = await generateNegativeTests(['Prompt'], mockProvider, {
      types: [
        'should-not-contain',
        'should-not-hallucinate',
        'should-not-expose',
        'should-not-repeat',
        'should-not-exceed-length',
      ],
      count: 5,
    });

    expect(assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'not-contains',
          metric: 'No forbidden phrase',
          value: 'classified',
        }),
        expect.objectContaining({
          type: 'llm-rubric',
          metric: 'No fabricated data',
        }),
        expect.objectContaining({
          type: 'javascript',
          metric: 'No secrets',
        }),
        expect.objectContaining({
          type: 'javascript',
          metric: 'No repetition',
        }),
        expect.objectContaining({
          type: 'javascript',
          metric: 'should-not-exceed-length check',
        }),
        expect.objectContaining({
          type: 'not-contains',
          metric: 'should-not-contain check',
          value: '',
        }),
      ]),
    );
  });

  it('keeps generated exposure criteria as JavaScript data instead of comment source', async () => {
    mockCallApi.mockResolvedValue({
      output: {
        assertions: [
          {
            type: 'should-not-expose',
            metric: 'No token leaks',
            value: 'session token\nreturn { pass: true }',
          },
        ],
      },
    });

    const assertions = await generateNegativeTests(['Prompt'], mockProvider, {
      types: ['should-not-expose'],
      count: 1,
    });
    const generatedCode = String(assertions[0].value);

    expect(generatedCode).toContain(
      'const criteriaTerms = ["session token","return { pass: true }"];',
    );
    expect(generatedCode).not.toContain(
      '// Check for sensitive data exposure: session token\nreturn { pass: true }',
    );
  });

  it('creates explicit convenience assertions with default and custom metric names', () => {
    expect(createNotContainsAssertion('classified details')).toEqual({
      type: 'not-contains',
      metric: 'Should not contain: classified details',
      value: 'classified details',
    });
    expect(createNotContainsAssertion('classified details', 'Custom metric')).toMatchObject({
      metric: 'Custom metric',
    });
    expect(createPiiCheckAssertion()).toMatchObject({
      type: 'javascript',
      metric: 'No PII Exposure',
    });
    expect(createPiiCheckAssertion('Custom PII')).toMatchObject({
      metric: 'Custom PII',
    });
  });

  it('creates word-only and word-plus-character length limit assertions', () => {
    const wordsOnly = createLengthLimitAssertion(120);
    const wordsAndChars = createLengthLimitAssertion(120, 600, 'Length');

    expect(wordsOnly).toMatchObject({
      type: 'javascript',
      metric: 'Length Limit',
    });
    expect(String(wordsOnly.value)).toContain('const maxWords = 120;');
    expect(String(wordsOnly.value)).toContain('const maxChars = 5000;');

    expect(wordsAndChars).toMatchObject({
      type: 'javascript',
      metric: 'Length',
    });
    expect(String(wordsAndChars.value)).toContain('const maxChars = 600;');
  });
});
