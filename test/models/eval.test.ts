import { runDbMigrations } from '../../src/migrate';
import Eval, { getSummaryofLatestEvals } from '../../src/models/eval';
import EvalFactory from '../factories/evalFactory';

describe('evaluator', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  describe('summaryResults', () => {
    it('should return all evaluations', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      await EvalFactory.createOldResult();
      const evaluations = await getSummaryofLatestEvals();

      expect(evaluations).toHaveLength(2);
      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval1.id,
          createdAt: eval1.createdAt,
          numTests: 2,
        }),
      );
      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval2.id,
          createdAt: eval2.createdAt,
          description: eval2.description || null,
          numTests: 2,
        }),
      );
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
});
