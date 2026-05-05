import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { generatePrompts } from '../../src/suggestions';
import { promptYesNo } from '../../src/util/readline';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { createMockProvider } from '../factories/provider';

import type { TestSuite } from '../../src/types';

vi.mock('../../src/suggestions', () => ({
  generatePrompts: vi.fn(),
}));

vi.mock('../../src/util/readline', () => ({
  promptYesNo: vi.fn(),
}));

describe('generated prompt selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generatePrompts).mockResolvedValue({
      prompts: ['Generated prompt'],
      tokensUsed: createEmptyTokenUsage(),
    });
    vi.mocked(promptYesNo).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function createTestSuite(): TestSuite {
    return {
      providers: [createMockProvider()],
      prompts: [{ raw: 'Original prompt', label: 'Original prompt' }],
      tests: [{}],
    };
  }

  it('passes the requested suggestion count to the generator', async () => {
    vi.mocked(promptYesNo).mockResolvedValueOnce(true);

    await evaluate(createTestSuite(), new Eval({}), {
      eventSource: 'library',
      generateSuggestions: true,
      suggestionsCount: 3,
    });

    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', 3);
  });

  it('defaults suggestionsCount to 1 when omitted', async () => {
    vi.mocked(promptYesNo).mockResolvedValueOnce(true);

    await evaluate(createTestSuite(), new Eval({}), {
      eventSource: 'library',
      generateSuggestions: true,
    });

    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', 1);
  });

  it('clamps over-cap suggestionsCount to MAX_SUGGESTIONS_COUNT', async () => {
    vi.mocked(promptYesNo).mockResolvedValueOnce(true);

    await evaluate(createTestSuite(), new Eval({}), {
      eventSource: 'library',
      generateSuggestions: true,
      suggestionsCount: 1_000,
    });

    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', 50);
  });

  it('coerces invalid suggestionsCount values to 1', async () => {
    vi.mocked(promptYesNo).mockResolvedValueOnce(true);

    await evaluate(createTestSuite(), new Eval({}), {
      eventSource: 'library',
      generateSuggestions: true,
      suggestionsCount: 0,
    });

    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', 1);
  });
});
