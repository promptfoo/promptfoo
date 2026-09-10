import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, PromptSuggestionsRejectedError } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
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

  it.each(['library', 'web', 'mcp'] as const)(
    'rejects generated prompts without an approval hook for %s callers',
    async (eventSource) => {
      const previousExitCode = process.exitCode;
      const testSuite = createTestSuite();
      const record = new Eval({});
      await expect(
        evaluate(testSuite, record, {
          eventSource,
          generateSuggestions: true,
        }),
      ).rejects.toBeInstanceOf(PromptSuggestionsRejectedError);
      expect(testSuite.prompts.map((prompt) => prompt.raw)).toEqual(['Original prompt']);
      expect(record.results).toHaveLength(0);
      expect(generatePrompts).not.toHaveBeenCalled();
      expect(promptYesNo).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(previousExitCode);
    },
  );

  it('lets explicit runtimes reject suggestions without changing exit policy', async () => {
    const previousExitCode = process.exitCode;
    await expect(
      evaluate(
        createTestSuite(),
        new Eval({}),
        {
          eventSource: 'library',
          generateSuggestions: true,
        },
        { ...nodeEvaluatorRuntime, selectPrompt: async () => false },
      ),
    ).rejects.toBeInstanceOf(PromptSuggestionsRejectedError);
    expect(promptYesNo).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(previousExitCode);
  });

  it('preserves the receiver for runtime selector methods', async () => {
    const runtime = {
      ...nodeEvaluatorRuntime,
      allowed: new Set(['Generated prompt']),
      async selectPrompt(prompt: string) {
        return this.allowed.has(prompt);
      },
    };
    const suite = createTestSuite();
    await evaluate(suite, new Eval({}), { generateSuggestions: true }, runtime);
    expect(suite.prompts).toHaveLength(2);
    expect(promptYesNo).not.toHaveBeenCalled();
  });

  it('preserves generator error identity', async () => {
    const failure = new Error('fixture generation failure');
    vi.mocked(generatePrompts).mockRejectedValueOnce(failure);
    await expect(
      evaluate(createTestSuite(), new Eval({}), {
        eventSource: 'cli',
        generateSuggestions: true,
      }),
    ).rejects.toBe(failure);
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
      await expect(
        evaluate(testSuite, new Eval({}), {
          eventSource: 'cli',
          generateSuggestions: true,
        }),
      ).resolves.toBeDefined();
      expect(promptYesNo).toHaveBeenCalledTimes(1);
      expect(testSuite.prompts).toHaveLength(2);
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it.each([
    [3, 3],
    [undefined, 1],
    [1_000, 50],
    [0, 1],
  ])('normalizes suggestionsCount=%s to %s', async (suggestionsCount, expected) => {
    await evaluate(
      createTestSuite(),
      new Eval({}),
      { eventSource: 'library', generateSuggestions: true, suggestionsCount },
      { ...nodeEvaluatorRuntime, selectPrompt: async () => true },
    );
    expect(generatePrompts).toHaveBeenCalledWith('Original prompt', expected);
  });
});
