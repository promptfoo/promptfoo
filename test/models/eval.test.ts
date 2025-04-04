import { getDb } from '../../src/database';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import Eval, { getEvalSummaries } from '../../src/models/eval';
import type { Prompt } from '../../src/types';
import EvalFactory from '../factories/evalFactory';

jest.mock('../../src/globalConfig/accounts', () => ({
  ...jest.requireActual('../../src/globalConfig/accounts'),
  getUserEmail: jest.fn(),
}));

describe('evaluator', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    const db = getDb();
    // Delete related tables first
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    // Then delete from main table
    await db.run('DELETE FROM evals');
  });

  describe('summaryResults', () => {
    it('should return all evaluations', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      const eval3 = await EvalFactory.createOldResult();

      const evaluations = await getEvalSummaries();

      expect(evaluations).toHaveLength(3);

      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval1.id,
          createdAt: eval1.createdAt,
          description: null,
          numTests: 2,
          isRedteam: 0,
          passRate: 50,
          label: eval1.id,
        }),
      );

      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval2.id,
          createdAt: eval2.createdAt,
          description: null,
          numTests: 2,
          isRedteam: 0,
          passRate: 50,
          label: eval2.id,
        }),
      );

      expect(evaluations).toContainEqual(expect.objectContaining({ evalId: eval3.id }));
    });
  });

  describe('delete', () => {
    it('should delete an evaluation', async () => {
      const eval1 = await EvalFactory.create();

      const eval_ = await Eval.findById(eval1.id);
      expect(eval_).toBeDefined();

      await eval1.delete();

      const eval_2 = await Eval.findById(eval1.id);
      expect(eval_2).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should use provided author when available', async () => {
      const providedAuthor = 'provided@example.com';
      const config = { description: 'Test eval' };
      const renderedPrompts: Prompt[] = [
        { raw: 'Test prompt', display: 'Test prompt', label: 'Test label' } as Prompt,
      ];
      const evaluation = await Eval.create(config, renderedPrompts, { author: providedAuthor });
      expect(evaluation.author).toBe(providedAuthor);
      const persistedEval = await Eval.findById(evaluation.id);
      expect(persistedEval?.author).toBe(providedAuthor);
    });

    it('should use default author from getUserEmail when not provided', async () => {
      const mockEmail = 'default@example.com';
      jest.mocked(getUserEmail).mockReturnValue(mockEmail);
      const config = { description: 'Test eval' };
      const renderedPrompts: Prompt[] = [
        { raw: 'Test prompt', display: 'Test prompt', label: 'Test label' } as Prompt,
      ];
      const evaluation = await Eval.create(config, renderedPrompts);
      const persistedEval = await Eval.findById(evaluation.id);
      expect(persistedEval?.author).toBe(mockEmail);
    });
  });

  describe('getStats', () => {
    it('should accumulate assertion token usage correctly', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
              assertions: {
                total: 100,
                prompt: 40,
                completion: 50,
                cached: 10,
              },
            },
          },
        } as any,
        {
          raw: 'test2',
          metrics: {
            tokenUsage: {
              prompt: 15,
              completion: 25,
              cached: 10,
              total: 50,
              numRequests: 1,
              assertions: {
                total: 200,
                prompt: 80,
                completion: 100,
                cached: 20,
              },
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 300,
        prompt: 120,
        completion: 150,
        cached: 30,
      });
    });

    it('should handle missing assertion token usage', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
      });
    });

    it('should handle mix of prompts with and without assertion usage', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test1',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
              assertions: {
                total: 100,
                prompt: 40,
                completion: 50,
                cached: 10,
              },
            },
          },
        } as any,
        {
          raw: 'test2',
          metrics: {
            tokenUsage: {
              prompt: 15,
              completion: 25,
              cached: 10,
              total: 50,
              numRequests: 1,
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 100,
        prompt: 40,
        completion: 50,
        cached: 10,
      });
    });
  });
});
