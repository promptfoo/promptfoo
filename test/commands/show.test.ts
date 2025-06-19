import { Command } from 'commander';
import { showCommand, handlePrompt, handleEval, handleDataset } from '../../src/commands/show';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import type { Prompt } from '../../src/types/prompts';
import { getEvalFromId, getPromptFromHash, getDatasetFromHash } from '../../src/util/database';

jest.mock('../../src/logger');
jest.mock('../../src/models/eval');
jest.mock('../../src/util/database');

describe('show command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.resetAllMocks();
  });

  describe('show [id]', () => {
    it('should show latest eval if no id provided', async () => {
      const mockLatestEval = {
        id: 'latest123',
        createdAt: new Date(),
        config: {},
        results: [],
        prompts: [],
        vars: [],
        testResults: [],
        metrics: {},
        getTable: jest.fn(),
      };
      jest.mocked(Eval.latest).mockResolvedValue(mockLatestEval as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show']);

      expect(Eval.latest).toHaveBeenCalledWith();
      expect(process.exitCode).toBe(0);
    });

    it('should show error if no eval found and no id provided', async () => {
      jest.mocked(Eval.latest).mockResolvedValue(undefined);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show']);

      expect(logger.error).toHaveBeenCalledWith('No eval found');
      expect(process.exitCode).toBe(1);
    });

    it('should show eval if id matches eval', async () => {
      const evalId = 'eval123';
      jest.mocked(getEvalFromId).mockResolvedValue({
        id: evalId,
        date: new Date(),
        config: {},
        results: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', evalId]);

      expect(getEvalFromId).toHaveBeenCalledWith(evalId);
      expect(process.exitCode).toBe(0);
    });

    it('should show prompt if id matches prompt', async () => {
      const promptId = 'prompt123';
      const mockPrompt: Prompt = {
        raw: 'test',
        label: 'Test Prompt',
      };
      jest.mocked(getPromptFromHash).mockResolvedValue({
        id: promptId,
        prompt: mockPrompt,
        evals: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', promptId]);

      expect(getPromptFromHash).toHaveBeenCalledWith(promptId);
      expect(process.exitCode).toBe(0);
    });

    it('should show dataset if id matches dataset', async () => {
      const datasetId = 'dataset123';
      jest.mocked(getDatasetFromHash).mockResolvedValue({
        id: datasetId,
        prompts: [],
        recentEvalDate: new Date(),
        recentEvalId: 'eval123',
        count: 0,
        testCases: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', datasetId]);

      expect(getDatasetFromHash).toHaveBeenCalledWith(datasetId);
      expect(process.exitCode).toBe(0);
    });

    it('should show error if no resource found with id', async () => {
      const invalidId = 'invalid123';
      jest.mocked(getEvalFromId).mockResolvedValue(undefined);
      jest.mocked(getPromptFromHash).mockResolvedValue(undefined);
      jest.mocked(getDatasetFromHash).mockResolvedValue(undefined);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', invalidId]);

      expect(logger.error).toHaveBeenCalledWith(`No resource found with ID ${invalidId}`);
    });
  });

  describe('show eval [id]', () => {
    it('should show latest eval if no id provided', async () => {
      const mockLatestEval = {
        id: 'latest123',
        createdAt: new Date(),
        config: {},
        results: [],
        prompts: [],
        vars: [],
        testResults: [],
        metrics: {},
        getTable: jest.fn(),
      };
      jest.mocked(Eval.latest).mockResolvedValue(mockLatestEval as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'eval']);

      expect(Eval.latest).toHaveBeenCalledWith();
      expect(process.exitCode).toBe(0);
    });

    it('should show error if no eval found and no id provided', async () => {
      jest.mocked(Eval.latest).mockResolvedValue(undefined);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'eval']);

      expect(logger.error).toHaveBeenCalledWith('No eval found');
      expect(process.exitCode).toBe(1);
    });

    it('should show eval details for provided id', async () => {
      const evalId = 'eval123';
      jest.mocked(Eval.findById).mockResolvedValue({
        id: evalId,
        createdAt: new Date(),
        config: {},
        results: [],
        prompts: [],
        vars: [],
        testResults: [],
        metrics: {},
        getTable: jest.fn().mockResolvedValue({
          head: { prompts: [], vars: [] },
          body: [],
        }),
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'eval', evalId]);

      expect(Eval.findById).toHaveBeenCalledWith(evalId);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('show prompt', () => {
    it('should show prompt details', async () => {
      const promptId = 'prompt123';
      const mockPrompt: Prompt = {
        raw: 'test',
        label: 'Test Prompt',
      };
      jest.mocked(getPromptFromHash).mockResolvedValue({
        id: promptId,
        prompt: mockPrompt,
        evals: [],
      } as any);

      await showCommand(program);
      await program.parseAsync(['node', 'test', 'show', 'prompt', promptId]);

      expect(getPromptFromHash).toHaveBeenCalledWith(promptId);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('show dataset', () => {
    it('should show dataset details', async () => {
      const datasetId = 'dataset123';
      jest.mocked(getDatasetFromHash).mockResolvedValue({
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
      expect(process.exitCode).toBe(0);
    });
  });
});

describe('handlers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('handlePrompt', () => {
    it('should handle prompt not found', async () => {
      const promptId = 'nonexistent';
      jest.mocked(getPromptFromHash).mockResolvedValue(undefined);

      await handlePrompt(promptId);

      expect(logger.error).toHaveBeenCalledWith(`Prompt with ID ${promptId} not found.`);
    });
  });

  describe('handleEval', () => {
    it('should handle eval not found', async () => {
      const evalId = 'nonexistent';
      jest.mocked(Eval.findById).mockResolvedValue(undefined);

      await handleEval(evalId);

      expect(logger.error).toHaveBeenCalledWith(`No evaluation found with ID ${evalId}`);
    });
  });

  describe('handleDataset', () => {
    it('should handle dataset not found', async () => {
      const datasetId = 'nonexistent';
      jest.mocked(getDatasetFromHash).mockResolvedValue(undefined);

      await handleDataset(datasetId);

      expect(logger.error).toHaveBeenCalledWith(`Dataset with ID ${datasetId} not found.`);
    });
  });
});
