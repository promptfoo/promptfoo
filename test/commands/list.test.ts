import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { listCommand } from '../../src/commands/list';
import logger from '../../src/logger';
import Eval, { EvalQueries } from '../../src/models/eval';
import { wrapTable } from '../../src/table';
import { runInkList, shouldUseInkList } from '../../src/ui/list';
import { sha256 } from '../../src/util/createHash';
import { getPrompts, getTestCases } from '../../src/util/database';
import { printBorder, setupEnv } from '../../src/util/index';

import type { PromptWithMetadata, TestCasesWithMetadata } from '../../src/types/index';

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/models/eval', () => ({
  default: {
    getMany: vi.fn(),
    getPaginated: vi.fn(),
    getCount: vi.fn(),
  },
  EvalQueries: {
    getVarsFromEvals: vi.fn(),
  },
}));

vi.mock('../../src/table', () => ({
  wrapTable: vi.fn(),
}));

vi.mock('../../src/ui/list', () => ({
  runInkList: vi.fn(),
  shouldUseInkList: vi.fn(),
}));

vi.mock('../../src/util/createHash', () => ({
  sha256: vi.fn(),
}));

vi.mock('../../src/util/database', () => ({
  getPrompts: vi.fn(),
  getTestCases: vi.fn(),
}));

vi.mock('../../src/util/index', () => ({
  printBorder: vi.fn(),
  setupEnv: vi.fn(),
}));

describe('list command', () => {
  let program: Command;
  const evalModel = Eval as unknown as {
    getMany: Mock;
    getPaginated: Mock;
    getCount: Mock;
  };
  const evalQueries = EvalQueries as unknown as {
    getVarsFromEvals: Mock;
  };

  function getListSubcommand(name: 'evals' | 'prompts' | 'datasets') {
    const listCmd = program.commands.find((cmd) => cmd.name() === 'list');
    return listCmd?.commands.find((cmd) => cmd.name() === name);
  }

  function createEval({
    id,
    createdAt,
    description,
    providers,
    prompts,
  }: {
    id: string;
    createdAt: number;
    description?: string;
    providers: unknown;
    prompts: Array<{
      raw: string;
      metrics?: {
        score?: number;
        testPassCount?: number;
        testFailCount?: number;
        testErrorCount?: number;
      };
    }>;
  }) {
    return {
      id,
      createdAt,
      config: {
        description,
        providers,
      },
      getPrompts: vi.fn().mockReturnValue(prompts),
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = 0;
    program = new Command();
    listCommand(program);
    vi.mocked(wrapTable).mockReturnValue('mocked table');
    vi.mocked(shouldUseInkList).mockReturnValue(false);
    vi.mocked(runInkList).mockResolvedValue({ cancelled: true });
    vi.mocked(sha256).mockImplementation((input: string) => `hash-${input}`);
    vi.mocked(getPrompts).mockResolvedValue([]);
    vi.mocked(getTestCases).mockResolvedValue([]);
    evalModel.getMany.mockResolvedValue([]);
    evalModel.getPaginated.mockResolvedValue([]);
    evalModel.getCount.mockResolvedValue(0);
    evalQueries.getVarsFromEvals.mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registration', () => {
    it('registers list command and subcommands', () => {
      const listCmd = program.commands.find((cmd) => cmd.name() === 'list');

      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toBe('List various resources');
      expect(listCmd?.commands.map((cmd) => cmd.name())).toEqual(
        expect.arrayContaining(['evals', 'prompts', 'datasets']),
      );
    });
  });

  describe('evals', () => {
    it('prints eval ids with --ids-only', async () => {
      evalModel.getMany.mockResolvedValue([{ id: 'eval-1' }, { id: 'eval-2' }]);

      const evalsCmd = getListSubcommand('evals');
      await evalsCmd?.parseAsync(['node', 'test', '--ids-only', '-n', '2', '--env-path', '.env']);

      expect(setupEnv).toHaveBeenCalledWith('.env');
      expect(evalModel.getMany).toHaveBeenCalledWith(2);
      expect(logger.info).toHaveBeenNthCalledWith(1, 'eval-1');
      expect(logger.info).toHaveBeenNthCalledWith(2, 'eval-2');
      expect(wrapTable).not.toHaveBeenCalled();
    });

    it('renders table output in non-interactive mode', async () => {
      const olderEval = createEval({
        id: 'eval-old',
        createdAt: 1,
        description: 'Older evaluation',
        providers: ['openai:gpt-4'],
        prompts: [{ raw: 'Older prompt' }],
      });
      const newerEval = createEval({
        id: 'eval-new',
        createdAt: 2,
        description: 'Newer evaluation',
        providers: ['openai:gpt-4'],
        prompts: [{ raw: 'Newer prompt' }],
      });
      evalModel.getMany.mockResolvedValue([newerEval, olderEval]);
      evalQueries.getVarsFromEvals.mockResolvedValue({
        'eval-old': ['topic'],
        'eval-new': ['name', 'city'],
      });

      const evalsCmd = getListSubcommand('evals');
      await evalsCmd?.parseAsync(['node', 'test', '-n', '2']);

      expect(evalModel.getMany).toHaveBeenCalledWith(2);
      // Note: evals.sort() in list.ts mutates the array in place, so the mock
      // reference reflects the sorted (ascending createdAt) order by assertion time.
      expect(evalQueries.getVarsFromEvals).toHaveBeenCalledWith([olderEval, newerEval]);
      expect(wrapTable).toHaveBeenCalledTimes(1);

      const [tableRows] = vi.mocked(wrapTable).mock.calls[0];
      expect(tableRows[0]).toMatchObject({
        'eval id': 'eval-old',
        prompts: 'hash-O',
        vars: 'topic',
      });
      expect(tableRows[1]).toMatchObject({
        'eval id': 'eval-new',
        prompts: 'hash-N',
        vars: 'name, city',
      });

      expect(printBorder).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('promptfoo show eval <id>'));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo show prompt <id>'),
      );
    });

    it('uses interactive mode and respects pagination limit', async () => {
      vi.mocked(shouldUseInkList).mockReturnValue(true);
      const firstEval = createEval({
        id: 'eval-1',
        createdAt: 1,
        description: 'Eval one',
        providers: ['openai:gpt-4'],
        prompts: [{ raw: 'Prompt one', metrics: { testPassCount: 1, testFailCount: 0 } }],
      });
      const secondEval = createEval({
        id: 'eval-2',
        createdAt: 2,
        description: 'Eval two',
        providers: ['openai:gpt-4'],
        prompts: [{ raw: 'Prompt two', metrics: { testPassCount: 1, testFailCount: 0 } }],
      });

      evalModel.getCount.mockResolvedValue(200);
      evalModel.getPaginated.mockResolvedValueOnce([firstEval]).mockResolvedValueOnce([secondEval]);
      evalQueries.getVarsFromEvals.mockResolvedValue({
        'eval-1': ['x'],
        'eval-2': ['y'],
      });

      let capturedOptions: Parameters<typeof runInkList>[0] | undefined;
      vi.mocked(runInkList).mockImplementation(async (options) => {
        capturedOptions = options;
        return { cancelled: true };
      });

      const evalsCmd = getListSubcommand('evals');
      await evalsCmd?.parseAsync(['node', 'test', '-n', '60']);

      expect(evalModel.getPaginated).toHaveBeenNthCalledWith(1, 0, 50);
      expect(runInkList).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'evals',
          pageSize: 50,
          totalCount: 200,
          hasMore: true,
        }),
      );

      if (!capturedOptions?.onLoadMore) {
        throw new Error('Expected onLoadMore to be defined in interactive eval list options');
      }
      // onLoadMore(offset=50, limit=50) but maxLimit is 60 (-n 60),
      // so effectiveLimit = Math.min(50, 60 - 50) = 10
      const nextPage = await capturedOptions.onLoadMore(50, 50);
      expect(evalModel.getPaginated).toHaveBeenNthCalledWith(2, 50, 10);
      expect(nextPage).toHaveLength(1);
      expect(nextPage[0]).toMatchObject({ id: 'eval-2' });
    });
  });

  describe('prompts', () => {
    // Prompts are sorted by recentEvalId (ascending), so eval-a < eval-b
    it('prints prompt ids with --ids-only in sorted order', async () => {
      const prompts: PromptWithMetadata[] = [
        {
          id: 'prompt-b',
          prompt: { raw: 'Prompt B', label: 'Prompt B' },
          count: 1,
          recentEvalDate: new Date('2025-01-01T00:00:00.000Z'),
          recentEvalId: 'eval-b',
          evals: [],
        },
        {
          id: 'prompt-a',
          prompt: { raw: 'Prompt A', label: 'Prompt A' },
          count: 2,
          recentEvalDate: new Date('2025-01-02T00:00:00.000Z'),
          recentEvalId: 'eval-a',
          evals: [],
        },
      ];
      vi.mocked(getPrompts).mockResolvedValue(prompts);

      const promptsCmd = getListSubcommand('prompts');
      await promptsCmd?.parseAsync(['node', 'test', '--ids-only', '--env-path', '.env.prompts']);

      expect(setupEnv).toHaveBeenCalledWith('.env.prompts');
      expect(logger.info).toHaveBeenNthCalledWith(1, 'prompt-a');
      expect(logger.info).toHaveBeenNthCalledWith(2, 'prompt-b');
    });

    it('renders prompts table output in non-interactive mode', async () => {
      const prompts: PromptWithMetadata[] = [
        {
          id: 'abcdef123456',
          prompt: { raw: 'x'.repeat(110), label: 'x'.repeat(110) },
          count: 3,
          recentEvalDate: new Date('2025-01-03T00:00:00.000Z'),
          recentEvalId: 'eval-123',
          evals: [],
        },
      ];
      vi.mocked(getPrompts).mockResolvedValue(prompts);

      const promptsCmd = getListSubcommand('prompts');
      await promptsCmd?.parseAsync(['node', 'test', '-n', '1']);

      expect(getPrompts).toHaveBeenCalledWith(1);
      expect(wrapTable).toHaveBeenCalledTimes(1);
      const [tableRows] = vi.mocked(wrapTable).mock.calls[0];
      expect(tableRows[0]).toMatchObject({
        'prompt id': 'abcdef',
        evals: 3,
        'recent eval': 'eval-123',
      });
      expect(tableRows[0].raw).toMatch(/\.\.\.$/);
      expect(printBorder).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo show prompt <id>'),
      );
    });
  });

  describe('datasets', () => {
    // Datasets are sorted by recentEvalId (descending), so eval-999 > eval-001
    it('prints dataset ids with --ids-only in sorted order', async () => {
      const datasets: TestCasesWithMetadata[] = [
        {
          id: 'dataset-old',
          testCases: [],
          prompts: [],
          count: 1,
          recentEvalDate: new Date('2025-01-01T00:00:00.000Z'),
          recentEvalId: 'eval-001',
        },
        {
          id: 'dataset-new',
          testCases: [],
          prompts: [],
          count: 2,
          recentEvalDate: new Date('2025-01-02T00:00:00.000Z'),
          recentEvalId: 'eval-999',
        },
      ];
      vi.mocked(getTestCases).mockResolvedValue(datasets);

      const datasetsCmd = getListSubcommand('datasets');
      await datasetsCmd?.parseAsync(['node', 'test', '--ids-only']);

      expect(logger.info).toHaveBeenNthCalledWith(1, 'dataset-new');
      expect(logger.info).toHaveBeenNthCalledWith(2, 'dataset-old');
      expect(wrapTable).not.toHaveBeenCalled();
    });

    // testCount is dataset.prompts.length (number of prompts tested against this dataset)
    it('builds dataset interactive items with bestPromptId from highest score', async () => {
      vi.mocked(shouldUseInkList).mockReturnValue(true);
      const datasets: TestCasesWithMetadata[] = [
        {
          id: 'dataset-1',
          testCases: [],
          count: 3,
          recentEvalDate: new Date('2025-01-10T00:00:00.000Z'),
          recentEvalId: 'eval-10',
          prompts: [
            {
              id: 'prompt-low',
              evalId: 'eval-10',
              prompt: {
                raw: 'Low',
                label: 'Low',
                provider: 'echo',
                metrics: {
                  score: 0.3,
                  testPassCount: 0,
                  testFailCount: 0,
                  testErrorCount: 0,
                  assertPassCount: 0,
                  assertFailCount: 0,
                  totalLatencyMs: 0,
                  tokenUsage: {},
                  namedScores: {},
                  namedScoresCount: {},
                  cost: 0,
                },
              },
            },
            {
              id: 'prompt-high',
              evalId: 'eval-10',
              prompt: {
                raw: 'High',
                label: 'High',
                provider: 'echo',
                metrics: {
                  score: 0.9,
                  testPassCount: 0,
                  testFailCount: 0,
                  testErrorCount: 0,
                  assertPassCount: 0,
                  assertFailCount: 0,
                  totalLatencyMs: 0,
                  tokenUsage: {},
                  namedScores: {},
                  namedScoresCount: {},
                  cost: 0,
                },
              },
            },
          ],
        },
      ];
      vi.mocked(getTestCases).mockResolvedValue(datasets);

      const datasetsCmd = getListSubcommand('datasets');
      await datasetsCmd?.parseAsync(['node', 'test']);

      expect(runInkList).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'datasets',
          items: [
            expect.objectContaining({
              id: 'dataset-1',
              bestPromptId: 'prompt-high',
              testCount: 2,
              evalCount: 3,
              recentEvalId: 'eval-10',
            }),
          ],
        }),
      );
    });
  });

  describe('error handling', () => {
    it('propagates error when Eval.getMany rejects in evals --ids-only', async () => {
      evalModel.getMany.mockRejectedValue(new Error('Database error'));

      const evalsCmd = getListSubcommand('evals');
      await expect(evalsCmd?.parseAsync(['node', 'test', '--ids-only'])).rejects.toThrow(
        'Database error',
      );
    });

    it('propagates error when getPrompts rejects', async () => {
      vi.mocked(getPrompts).mockRejectedValue(new Error('Prompts fetch failed'));

      const promptsCmd = getListSubcommand('prompts');
      await expect(promptsCmd?.parseAsync(['node', 'test', '--ids-only'])).rejects.toThrow(
        'Prompts fetch failed',
      );
    });

    it('propagates error when getTestCases rejects', async () => {
      vi.mocked(getTestCases).mockRejectedValue(new Error('Datasets fetch failed'));

      const datasetsCmd = getListSubcommand('datasets');
      await expect(datasetsCmd?.parseAsync(['node', 'test', '--ids-only'])).rejects.toThrow(
        'Datasets fetch failed',
      );
    });
  });
});
