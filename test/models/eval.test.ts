import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalFactory from '../factories/evalFactory';

describe('evaluator', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  describe('summaryResults', () => {
    it('should return all evaluations', async () => {
      await EvalFactory.create();
      await EvalFactory.create();
      const evaluations = await Eval.summaryResults();
      expect(evaluations).toHaveLength(2);
    });
  });
});
