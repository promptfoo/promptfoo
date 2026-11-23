import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { sanitizeProvider } from '../../src/evaluator/resultProcessing';
import { evaluate, loadApiProvider } from '../../src/index';
import { runDbMigrations } from '../../src/migrate';

beforeAll(() => runDbMigrations());
afterEach(() => vi.resetAllMocks());

it.each([
  ['openai:codex-sdk', { threadRunQueues: {} }],
  ['openai:codex-app-server', { threadPromiseConnectionInstances: {}, threadRunQueues: {} }],
  ['opencode:sdk', { sessionQueues: {} }],
] as const)(
  'keeps %s runtime fields and queue contents out of exported evaluations',
  async (id, expected) => {
    const provider = await loadApiProvider(id);
    provider.config.toJSON = (key: string) => (key === '' ? undefined : { model: 'fixture' });
    Object.assign(provider, { clientState: 'fixture-private-client' });
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
    expect(sanitizeProvider(provider)).toEqual({
      id: provider.id(),
      label: provider.label,
      config: { model: 'fixture' },
    });
    expect(serialized).toMatchObject({ id: provider.id(), config: { model: 'fixture' } });
    expect(JSON.stringify(exported)).not.toContain('fixture-private-client');
    // Legacy serializers that see the whole instance must still get empty queues.
    expect(JSON.parse(JSON.stringify(provider))).toMatchObject(expected);
    for (const key of Object.keys(expected)) {
      expect(serialized).not.toHaveProperty(key);
      expect(summary.results[0].provider).not.toHaveProperty(key);
    }
  },
);
