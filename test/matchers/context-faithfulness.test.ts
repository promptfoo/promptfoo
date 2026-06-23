import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesContextFaithfulness } from '../../src/matchers/rag';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesContextFaithfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    vi.spyOn(DefaultGradingProvider, 'callApi')
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3\n',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. No. Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when the faithfulness score is above the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3\n',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. No. Yes.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: true,
      reason: 'Faithfulness 0.67 is >= 0.5',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('should fail when the faithfulness score is below the threshold', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.7;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Final verdict for each statement in order: Yes. Yes. No.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.67 is < 0.7',
      score: expect.closeTo(0.67, 0.01),
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('tracks token usage for multiple API calls', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const result = await matchesContextFaithfulness(query, output, context, threshold);

    expect(result.tokensUsed).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      completionDetails: expect.any(Object),
      numRequests: 0,
    });
  });

  it('should fail when no verdict markers are returned', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output:
            'I apologize, but I cannot create statements or provide an analysis based on the given context.',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.00 is < 0.5',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('should clamp score when verdict count exceeds statement count', async () => {
    const query = 'Query text';
    const output = 'Output text';
    const context = 'Context text';
    const threshold = 0.5;

    const mockCallApi = vi
      .fn()
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'Statement 1\nStatement 2\nStatement 3',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      })
      .mockImplementationOnce(() => {
        return Promise.resolve({
          output: 'verdict: no\nverdict: no\nverdict: no\nverdict: no\nverdict: no',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
      });

    const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
    callApiSpy.mockReset();
    callApiSpy.mockImplementation(mockCallApi);

    await expect(matchesContextFaithfulness(query, output, context, threshold)).resolves.toEqual({
      pass: false,
      reason: 'Faithfulness 0.00 is < 0.5',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  describe('Array Context Support', () => {
    it('should handle array of context chunks', async () => {
      const query = 'What is the capital of France?';
      const output = 'Paris is the capital of France.';
      const contextChunks = [
        'Paris is the capital and largest city of France.',
        'France is located in Western Europe.',
        'The country has a rich cultural heritage.',
      ];
      const threshold = 0.5;

      const result = await matchesContextFaithfulness(query, output, contextChunks, threshold);

      // Should successfully process array context without errors
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.pass).toBe('boolean');
      expect(result.reason).toBeDefined();
    });

    it('should handle single string context (backward compatibility)', async () => {
      const query = 'What is the capital of France?';
      const output = 'Paris is the capital of France.';
      const context = 'Paris is the capital and largest city of France.';
      const threshold = 0.5;

      const result = await matchesContextFaithfulness(query, output, context, threshold);

      // Should successfully process string context without errors
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.pass).toBe('boolean');
      expect(result.reason).toBeDefined();
    });
  });

  describe('verdict format robustness', () => {
    const mockTwoCalls = (statementCount: number, verdicts: string) => {
      const mockCallApi = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            output: Array.from(
              { length: statementCount },
              (_, index) => `Statement ${index + 1}`,
            ).join('\n'),
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            output: verdicts,
            tokenUsage: { total: 10, prompt: 5, completion: 5 },
          }),
        );
      const callApiSpy = vi.spyOn(DefaultGradingProvider, 'callApi');
      callApiSpy.mockReset();
      callApiSpy.mockImplementation(mockCallApi);
    };

    type VerdictCase = [
      name: string,
      statementCount: number,
      verdicts: string,
      expectedScore: number,
      threshold: number,
    ];
    const marker = 'Final verdict for each statement in order:';
    const cases: VerdictCase[] = [
      [
        'enumerated period list',
        5,
        `${marker}\n1. Yes.\n2. Yes.\n3. Yes.\n4. Yes.\n5. Yes.`,
        1,
        0.5,
      ],
      ['inline numbered list', 3, `${marker} 1) Yes 2) No 3) Yes`, 2 / 3, 0.5],
      ['comma-separated list', 3, `${marker} Yes, No, Yes`, 2 / 3, 0.5],
      [
        'No explanation containing yes',
        2,
        `${marker} No, the context never mentions yes. No.`,
        0,
        0.5,
      ],
      [
        'Yes explanation containing no',
        2,
        `${marker} Yes, there is no contradiction. Yes.`,
        1,
        0.75,
      ],
      ['Yes explanation beginning with no', 2, `${marker} Yes, no contradiction. Yes.`, 1, 0.75],
      ['single-word comma explanation', 1, `${marker} Yes, indeed.`, 1, 0.5],
      ['unknown verdict slot', 2, `${marker} Yes. Maybe.`, 0.5, 0.75],
      ['compact unknown verdict slot', 2, `${marker} N/A. Yes.`, 0.5, 0.75],
      ['unknown verdict in comma list', 3, `${marker} Yes, Maybe, Yes`, 2 / 3, 0.5],
      ['wrapped unknown verdict in comma list', 3, `${marker} “Yes”, **N/A**, “Yes”`, 2 / 3, 0.5],
      [
        'annotated unknown verdict in comma list',
        3,
        `${marker} Yes: supported, Unknown: insufficient evidence, Yes: supported`,
        2 / 3,
        0.5,
      ],
      ['missing verdict slots', 3, `${marker} Yes.`, 1 / 3, 0.5],
      [
        'yes/no substrings in larger words',
        1,
        `${marker} Yesterday the report cannot be verified.`,
        0,
        0.5,
      ],
      ['more verdicts than statements', 2, `${marker} No. No. No.`, 0, 0.5],
      [
        'bullets, labels, wrappers, and alternate delimiters',
        3,
        `${marker} - **Yes**\n2) Verdict: No.\n• _Yes_`,
        2 / 3,
        0.5,
      ],
      [
        'comma-isolated verdict word in explanation',
        2,
        `${marker} No, the source says, yes, but only in a quote. No.`,
        0,
        0.5,
      ],
      ['unknown slot before extra verdict', 2, `${marker} Maybe. Yes. Yes.`, 0, 0.75],
      ['compact unknown before extra verdict', 2, `${marker} N/A. Yes. Yes.`, 0, 0.75],
      [
        'numbered multiword unknown before extra verdict',
        2,
        `${marker}\n1. Not sure.\n2. Yes.\n3. Yes.`,
        0,
        0.75,
      ],
      [
        'bulleted multiword unknown before extra verdict',
        2,
        `${marker}\n- Not sure.\n- Yes.\n- Yes.`,
        0,
        0.75,
      ],
      [
        'Unicode-dash bullet unknown before extra verdict',
        2,
        `${marker}\n— Not sure.\n– Yes.\n— Yes.`,
        0,
        0.75,
      ],
      ['repeated final-answer marker', 2, `${marker} No. No. ${marker} Yes. Yes.`, 0, 0.75],
      [
        'repeated final-answer marker with spacing variation',
        1,
        `${marker} Yes. Final verdict for each statement in order : No.`,
        0,
        0.5,
      ],
      [
        'final-answer marker words in explanation prose',
        1,
        `${marker} Yes. The final verdict for each statement in order was clear.`,
        1,
        0.5,
      ],
      ['extra positive verdicts', 2, `${marker} Yes. Yes. No. No.`, 0, 0.75],
      ['bold final-answer marker', 1, `**${marker}** Yes.`, 1, 0.5],
      ['smart-quoted verdicts', 2, `${marker} “Yes”. “No”.`, 0.5, 0.5],
      ['statement-labelled verdicts', 2, `${marker} Statement 1: Yes. Statement 2: Yes.`, 1, 0.75],
      [
        'period-delimited statement labels',
        2,
        `${marker} Statement 1. Yes. Statement 2. Yes.`,
        1,
        0.75,
      ],
      ['hyphen-labelled statements', 2, `${marker} Statement 1 - Yes. Statement 2 - Yes.`, 1, 0.75],
      [
        'Unicode-dash statement labels',
        2,
        `${marker} Statement 1 — Yes. Statement 2 — No.`,
        0.5,
        0.5,
      ],
      ['verdict followed by because', 1, `${marker} Yes because the context supports it.`, 1, 0.5],
      [
        'explanation containing dotted abbreviation',
        2,
        `${marker} Yes because the U.S. source supports it. No.`,
        0.5,
        0.5,
      ],
      ['parenthesized explanation', 1, `${marker} Yes (supported).`, 1, 0.5],
      ['trailing comma', 3, `${marker} Yes, No, Yes,`, 2 / 3, 0.5],
      [
        'annotated comma list',
        3,
        `${marker} Yes: supported, No: unsupported, Yes: supported`,
        2 / 3,
        0.5,
      ],
      [
        'semicolon inside explanation',
        2,
        `${marker}\n1) Yes; No, that wording does not contradict the context.\n2) Yes.`,
        1,
        0.75,
      ],
      ['unparseable final list', 2, `${marker} Maybe. Perhaps.`, 0, 0.5],
      ['duplicate statement label', 2, `${marker} Statement 1: Yes. Statement 1: Yes.`, 0, 0.5],
      ['out-of-range statement label', 2, `${marker} Statement 1: Yes. Statement 3: Yes.`, 0, 0.5],
      [
        'unique reordered statement labels',
        2,
        `${marker} Statement 2: No. Statement 1: Yes.`,
        0.5,
        0.5,
      ],
      ['excess inline numbered entries', 2, `${marker} 1) Yes 2) Yes 3) Yes`, 0, 0.5],
    ];

    it.each(cases)('%s', async (_name, statementCount, verdicts, expectedScore, threshold) => {
      mockTwoCalls(statementCount, verdicts);

      const result = await matchesContextFaithfulness('q', 'a', 'ctx', threshold);
      expect(result.score).toBeCloseTo(expectedScore, 5);
      expect(result.pass).toBe(expectedScore >= threshold - Number.EPSILON);
    });
  });
});
