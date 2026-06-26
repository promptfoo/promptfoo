import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCitationFaithfulness } from '../../src/assertions/citationFaithfulness';
import * as contextUtils from '../../src/assertions/contextUtils';
import * as matchers from '../../src/matchers/rag';

vi.mock('../../src/matchers/rag');
vi.mock('../../src/assertions/contextUtils');

describe('handleCitationFaithfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseParams = (overrides: Record<string, unknown> = {}) =>
    ({
      assertion: { type: 'citation-faithfulness' },
      test: {
        vars: {
          query: 'How tall is the Eiffel Tower and when was it completed?',
          context: [
            'The Eiffel Tower stands 330 metres tall in Paris.',
            'The Eiffel Tower was completed in 1889.',
          ],
        },
        options: {},
      },
      output: 'The Eiffel Tower was completed in 1889 [1].',
      prompt: 'test prompt',
      baseType: 'citation-faithfulness',
      inverse: false,
      outputString: 'The Eiffel Tower was completed in 1889 [1].',
      providerResponse: null,
      ...overrides,
    }) as any;

  it('passes when the citation is correctly attributed', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Citations are correctly attributed.' };
    vi.mocked(matchers.matchesCitationFaithfulness).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue(['p1', 'p2']);

    const result = await handleCitationFaithfulness(baseParams());

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.metadata!.context).toEqual(['p1', 'p2']);
    // Default threshold for citation-faithfulness is 1 (require a faithful verdict).
    expect(matchers.matchesCitationFaithfulness).toHaveBeenCalledWith(
      'How tall is the Eiffel Tower and when was it completed?',
      'The Eiffel Tower was completed in 1889 [1].',
      ['p1', 'p2'],
      1,
      {},
      expect.any(Object),
      undefined,
    );
  });

  it('fails on the misattribution case', async () => {
    const mockResult = {
      pass: false,
      score: 0,
      reason: 'Claim cited to passage [1] which does not support it.',
    };
    vi.mocked(matchers.matchesCitationFaithfulness).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue(['p1', 'p2']);

    const result = await handleCitationFaithfulness(baseParams());

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('passage [1]');
  });

  it('throws when test.vars is undefined', async () => {
    await expect(
      handleCitationFaithfulness(baseParams({ test: { vars: undefined, options: {} } })),
    ).rejects.toThrow('citation-faithfulness assertion requires a test with variables');
  });

  it('throws when query is not a string', async () => {
    await expect(
      handleCitationFaithfulness(baseParams({ test: { vars: { query: 123 }, options: {} } })),
    ).rejects.toThrow(
      'citation-faithfulness assertion requires a "query" variable with the user question',
    );
  });

  it('throws when output is not a string', async () => {
    await expect(handleCitationFaithfulness(baseParams({ output: 123 }))).rejects.toThrow(
      'citation-faithfulness assertion requires string output from the provider',
    );
  });
});
