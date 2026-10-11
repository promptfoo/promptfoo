import { getDb } from '../../src/database/index';

export async function clearEvalTables(after?: () => void) {
  const db = await getDb();
  await db.run('DELETE FROM eval_results');
  await db.run('DELETE FROM evals_to_datasets');
  await db.run('DELETE FROM evals_to_prompts');
  await db.run('DELETE FROM evals_to_tags');
  await db.run('DELETE FROM evals');
  after?.();
}
