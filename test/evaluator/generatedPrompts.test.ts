import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, PromptSuggestionsRejectedError } from '../../src/evaluator';
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

  it('throws without mutating process.exitCode for reusable callers', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    try {
      await expect(
        evaluate(createTestSuite(), new Eval({}), {
          eventSource: 'library',
          generateSuggestions: true,
        }),
      ).rejects.toEqual(expect.any(PromptSuggestionsRejectedError));

      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('preserves the CLI exit code when all suggested prompts are rejected', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    try {
      await evaluate(createTestSuite(), new Eval({}), {
        eventSource: 'cli',
        generateSuggestions: true,
      });

      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('passes the requested suggestion count to the generator', async () => {
    vi.mocked(promptYesNo).mockResolvedValueOnce(true);

    await evaluate(createTestSuite(), new Eval({}), {
      eventSource: 'library',
      generateSuggestions: true,
      suggestionsCount: 3,
    });

    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', 3);
  });
});
