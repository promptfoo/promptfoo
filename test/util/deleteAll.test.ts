import { runDbMigrations } from '../../src/migrate.js';
import Eval from '../../src/models/eval.js';
import { deleteAllEvals } from '../../src/util/database.js';
import EvalFactory from '../factories/evalFactory.js';

describe('delete all evals', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  it('should delete all evals', async () => {
    await EvalFactory.create();
    await EvalFactory.create();
    await EvalFactory.create();

    const evals = await Eval.getMany();
    expect(evals).toHaveLength(3);

    await deleteAllEvals();

    const evals2 = await Eval.getMany();
    expect(evals2).toHaveLength(0);
  });
});
