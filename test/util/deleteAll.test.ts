import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { updateSignalFileForDeletedEvals } from '../../src/database/signal';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { deleteAllEvals } from '../../src/util/database';
import EvalFactory from '../factories/evalFactory';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
    updateSignalFileForDeletedEvals: vi.fn(),
  };
});

describe('delete all evals', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  afterEach(() => {
    vi.resetAllMocks();
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
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith(undefined);
  });
});
