import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { createPrompt } from '../factories/testSuite';

describe('Eval pass^N stats', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  it('includes pass^N in stats when configured', () => {
    const evalRecord = new Eval({}, { runtimeOptions: { passPower: 2, repeat: 2 } });
    evalRecord.results = [
      { testIdx: 0, promptIdx: 0, testCase: { vars: { input: 'a' } }, success: true },
      { testIdx: 0, promptIdx: 0, testCase: { vars: { input: 'a' } }, success: false },
      { testIdx: 1, promptIdx: 0, testCase: { vars: { input: 'b' } }, success: true },
      { testIdx: 1, promptIdx: 0, testCase: { vars: { input: 'b' } }, success: true },
    ] as any;

    const stats = evalRecord.getStats();

    expect(stats.passPowerOfN?.n).toBe(2);
    expect(stats.passPowerOfN?.overallScore).toBeCloseTo(62.5);
  });

  it('persists and rehydrates pass^N stats', async () => {
    const evalRecord = await Eval.create({}, [createPrompt('Test prompt')], {
      runtimeOptions: { passPower: 2, repeat: 2 },
    });
    evalRecord.passPowerOfN = {
      n: 2,
      overallScore: 25,
      groups: [
        {
          testIdx: 0,
          promptIdx: 0,
          varsKey: '{"input":"a"}',
          passRate: 0.5,
          passPowerN: 0.25,
          totalRepetitions: 2,
          successes: 1,
        },
      ],
    };

    await evalRecord.save();

    const found = await Eval.findById(evalRecord.id);
    const many = await Eval.getMany();
    const paginated = await Eval.getPaginated(0, 10);

    expect(found?.getStats().passPowerOfN?.overallScore).toBe(25);
    expect(many.find((eval_) => eval_.id === evalRecord.id)?.passPowerOfN?.overallScore).toBe(25);
    expect(paginated.find((eval_) => eval_.id === evalRecord.id)?.passPowerOfN?.overallScore).toBe(
      25,
    );
  });
});
