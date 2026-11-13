import chalk from 'chalk';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDataset, handleEval, handlePrompt, showCommand } from '../../src/commands/show';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import {
  getDatasetFromHash,
  getPromptFromHash,
  hasRecentEvalWithIdPrefix,
} from '../../src/util/database';

import type { Prompt } from '../../src/types/prompts';

vi.mock('../../src/logger');
vi.mock('../../src/models/eval');
vi.mock('../../src/util/database');

describe('show command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.resetAllMocks();
    process.exitCode = undefined;
  });

  describe.each([
    { command: 'show', args: ['show'] },
    { command: 'show eval', args: ['show', 'eval'] },
  ])('$command without an id', ({ args }) => {
    it('renders the eval selected by latest', async () => {
      const getTable = vi.fn().mockResolvedValue({ head: { prompts: [], vars: [] }, body: [] });
      vi.mocked(Eval.latest).mockResolvedValue({ id: 'latest123', getTable } as unknown as Eval);

      await showCommand(program);
      await program.parseAsync(['node', 'test', ...args]);

      expect(Eval.latest).toHaveBeenCalledOnce();
      expect(Eval.findById).not.toHaveBeenCalled();
      expect(getTable).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Eval latest123'));
    });

    it('reports when there is no eval to show', async () => {
      vi.mocked(Eval.latest).mockResolvedValue(undefined);

      await showCommand(program);
      await program.parseAsync(['node', 'test', ...args]);

      expect(logger.error).toHaveBeenCalledWith('No eval found');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('show [id]', () => {
    it('should show eval if id matches eval', async () => {
      const evalId = 'eval123';
      const mockEval = {
        id: evalId,
        date: new Date(),
        config: {},
        results: [],
        getTable: vi.fn().mockResolvedValue({
          head: { prompts: [], vars: [] },
          body: [],
        }),
      };
      vi.mocked(hasRecentEvalWithIdPrefix).mockResolvedValue(true);
      vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', evalId]);

      expect(hasRecentEvalWithIdPrefix).toHaveBeenCalledWith(evalId);
      expect(Eval.findById).toHaveBeenCalledWith(evalId);
    });

    it('should show prompt if id matches prompt', async () => {
      const promptId = 'prompt123';
      const mockPrompt: Prompt = {
        raw: 'test',
        label: 'Test Prompt',
      };
      vi.mocked(getPromptFromHash).mockResolvedValueOnce({
        id: `${promptId}-full-hash`,
        prompt: mockPrompt,
        evals: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', promptId]);

      expect(getPromptFromHash).toHaveBeenCalledExactlyOnceWith(promptId);
      expect(getDatasetFromHash).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(chalk.bold(`Prompt ${promptId}`));
    });

    it('should show dataset if id matches dataset', async () => {
      const datasetId = 'dataset123';
      vi.mocked(getDatasetFromHash).mockResolvedValueOnce({
        id: `${datasetId}-full-hash`,
        prompts: [],
        recentEvalDate: new Date(),
        recentEvalId: 'eval123',
        count: 0,
        testCases: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', datasetId]);

      expect(getPromptFromHash).toHaveBeenCalledBefore(vi.mocked(getDatasetFromHash));
      expect(getDatasetFromHash).toHaveBeenCalledExactlyOnceWith(datasetId);
      expect(logger.info).toHaveBeenCalledWith(chalk.bold(`Dataset ${datasetId}`));
    });

    it('should show error if no resource found with id', async () => {
      const invalidId = 'invalid123';
      vi.mocked(hasRecentEvalWithIdPrefix).mockResolvedValue(false);
      vi.mocked(getPromptFromHash).mockResolvedValue(undefined);
      vi.mocked(getDatasetFromHash).mockResolvedValue(undefined);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', invalidId]);

      expect(logger.error).toHaveBeenCalledWith(`No resource found with ID ${invalidId}`);
    });
  });

  describe('show eval [id]', () => {
    it('should show eval details for provided id', async () => {
      const evalId = 'eval123';
      vi.mocked(Eval.findById).mockResolvedValue({
        id: evalId,
        createdAt: new Date(),
        config: {},
        results: [],
        prompts: [],
        vars: [],
        testResults: [],
        metrics: {},
        getTable: vi.fn().mockResolvedValue({
          head: { prompts: [], vars: [] },
          body: [],
        }),
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'eval', evalId]);

      expect(Eval.findById).toHaveBeenCalledWith(evalId);
    });
  });

  describe('show prompt', () => {
    it('should show prompt details', async () => {
      const promptId = 'prompt123';
      const mockPrompt: Prompt = {
        raw: 'test',
        label: 'Test Prompt',
      };
      vi.mocked(getPromptFromHash).mockResolvedValue({
        id: promptId,
        prompt: mockPrompt,
        evals: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'prompt', promptId]);

      expect(getPromptFromHash).toHaveBeenCalledWith(promptId);
    });
  });

  describe('show dataset', () => {
    it('should show dataset details', async () => {
      const datasetId = 'dataset123';
      vi.mocked(getDatasetFromHash).mockResolvedValue({
        id: datasetId,
        prompts: [],
        recentEvalDate: new Date(),
        recentEvalId: 'eval123',
        count: 0,
        testCases: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'dataset', datasetId]);

      expect(getDatasetFromHash).toHaveBeenCalledWith(datasetId);
    });
  });
});

describe('handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
  });

  describe('handlePrompt', () => {
    it('should handle prompt not found', async () => {
      const promptId = 'nonexistent';
      vi.mocked(getPromptFromHash).mockResolvedValue(undefined);

      await handlePrompt(promptId);

      expect(logger.error).toHaveBeenCalledWith(`Prompt with ID ${promptId} not found.`);
    });
  });

  describe('handleEval', () => {
    it('should handle eval not found', async () => {
      const evalId = 'nonexistent';
      vi.mocked(Eval.findById).mockResolvedValue(undefined);

      await handleEval(evalId);

      expect(logger.error).toHaveBeenCalledWith(`No evaluation found with ID ${evalId}`);
    });
  });

  describe('handleDataset', () => {
    it('should handle dataset not found', async () => {
      const datasetId = 'nonexistent';
      vi.mocked(getDatasetFromHash).mockResolvedValue(undefined);

      await handleDataset(datasetId);

      expect(logger.error).toHaveBeenCalledWith(`Dataset with ID ${datasetId} not found.`);
    });
  });
});
