import { runDbMigrations } from '../../src/migrate';
import { listPreviousResults } from '../../src/util';
import EvalFactory from '../factories/evalFactory';

describe('listPreviousResults', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  it('returns previous results', async () => {
    const eval1 = await EvalFactory.create();
    const eval2 = await EvalFactory.create();
    const evalOld: any = await EvalFactory.createOldResult();
    const results = await listPreviousResults();
    expect(results).toHaveLength(3);
    expect(results).toContainEqual(
      expect.objectContaining({
        evalId: eval1.id,
        createdAt: eval1.createdAt,
        numTests: 2,
      }),
    );
    expect(results).toContainEqual(
      expect.objectContaining({
        evalId: eval2.id,
        createdAt: eval2.createdAt,
        description: eval2.description || null,
        numTests: 2,
      }),
    );
    expect(results).toContainEqual(
      expect.objectContaining({
        evalId: evalOld.id,
        createdAt: evalOld.createdAt,
        numTests: 1,
      }),
    );
  });
});
