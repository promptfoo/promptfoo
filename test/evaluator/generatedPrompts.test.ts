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

  it('does not throw or mutate process.exitCode when the user accepts a suggestion', async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.mocked(promptYesNo).mockResolvedValue(true);

    try {
      const testSuite = createTestSuite();
      // Library mode would throw PromptSuggestionsRejectedError if a regression
      // flipped the boolean — covers the accepted branch that the rejection
      // tests above intentionally don't exercise.
      await expect(
        evaluate(testSuite, new Eval({}), {
          eventSource: 'library',
          generateSuggestions: true,
        }),
      ).resolves.toBeDefined();
      expect(process.exitCode).toBeUndefined();
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
