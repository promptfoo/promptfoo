import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { datasetsTable, evalsTable, promptsTable, tagsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { writeResultsToDatabase } from '../../src/util/database';
import { createEvaluateSummaryV2 } from '../factories/eval';

describe('writeResultsToDatabase', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.run('DROP TRIGGER IF EXISTS fail_evals_to_tags_insert');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
    await db.run('DELETE FROM datasets');
    await db.run('DELETE FROM prompts');
    await db.run('DELETE FROM tags');
  });

  it('rolls back related rows when a dependent insert fails', async () => {
    const db = await getDb();
    await db.run(`
      CREATE TRIGGER fail_evals_to_tags_insert
      BEFORE INSERT ON evals_to_tags
      BEGIN
        SELECT RAISE(ABORT, 'forced tag failure');
      END;
    `);

    await expect(
      writeResultsToDatabase(
        createEvaluateSummaryV2(),
        {
          tags: { suite: 'regression' },
          tests: [],
        },
        new Date('2024-01-01T00:00:00.000Z'),
      ),
    ).rejects.toThrow();

    await expect(db.select().from(evalsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(promptsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(datasetsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(tagsTable).all()).resolves.toHaveLength(0);
  });
});
