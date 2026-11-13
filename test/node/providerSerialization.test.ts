import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { evaluate, loadApiProvider } from '../../src/index';
import { runDbMigrations } from '../../src/migrate';

beforeAll(() => runDbMigrations());
afterEach(() => vi.resetAllMocks());

it.each([
  ['openai:codex-sdk', { threadRunQueues: {} }],
  ['openai:codex-app-server', { threadPromiseConnectionInstances: {}, threadRunQueues: {} }],
  ['opencode:sdk', { sessionQueues: {} }],
] as const)('preserves %s queue fields in fallback export serialization', async (id, expected) => {
  const provider = await loadApiProvider(id);
  provider.config.toJSON = (key: string) => (key === '' ? undefined : { model: 'fixture' });
  provider.callApi = vi.fn().mockResolvedValue({ output: 'fixture output' });

  const record = await evaluate(
    {
      providers: [provider],
      prompts: ['fixture prompt'],
      tests: [{ assert: [{ type: 'equals', value: 'fixture output' }] }],
    },
    { cache: false, maxConcurrency: 1 },
  );
  const summary = await record.toEvaluateSummary();
  expect(summary.results).toHaveLength(1);
  expect(summary.results[0].success).toBe(true);
  expect(provider.callApi).toHaveBeenCalledTimes(1);

  const exported = JSON.parse(JSON.stringify(await record.toResultsFile()));
  const serialized = exported.config.providers[0];
  const fields = Object.fromEntries(
    Object.entries(serialized).filter(
      ([key]) => key.includes('Queue') || key === 'threadPromiseConnectionInstances',
    ),
  );
  expect(fields).toEqual(expected);
  expect(Object.keys(fields)).toEqual(Object.keys(expected));
});
