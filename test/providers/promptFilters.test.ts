import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate as evaluateRuntime } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { evaluate } from '../../src/node/evaluate';
import { readProviderPromptMap } from '../../src/prompts/index';
import { loadApiProviders } from '../../src/providers/index';
import { withCloudProviderResolver } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { ApiProviderSchema } from '../../src/validators/providers';

import type { ProviderOptions, ProvidersConfig } from '../../src/types/providers';

vi.mock('../../src/util/fetch/index');
vi.mock('../../src/telemetry');

const cloudPath = 'promptfoo://provider/00000000-0000-4000-8000-000000000001';
const prompts = ['first', 'second'];
const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  cliState.basePath = '';
  cliState.config = undefined;
  cliState.selectedProviderConfigs = undefined;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function runEvaluation(entrypoint: 'CLI' | 'library', providers: ProvidersConfig) {
  let result: Eval;
  if (entrypoint === 'CLI') {
    const { testSuite, config } = await resolveConfigs(
      {},
      { providers, prompts, tests: [{ vars: {} }] },
    );
    result = new Eval(config);
    await evaluateRuntime(testSuite, result, { cache: false, maxConcurrency: 1 });
  } else {
    result = await evaluate(
      { providers, prompts, tests: [{ vars: {} }], writeLatestResults: false },
      { cache: false, maxConcurrency: 1 },
    );
  }
  const summary = await result.toEvaluateSummary();
  expect(summary.stats.failures).toBe(0);
  expect(fetchWithProxy).not.toHaveBeenCalled();
  return summary.results.map((row) => ({
    provider: row.provider.label || row.provider.id,
    prompt: row.prompt.label,
  }));
}

describe.each(['CLI', 'library'] as const)('%s resolved provider prompt filters', (entrypoint) => {
  it('uses a saved prompt filter and resolved label', async () => {
    const rows = await withCloudProviderResolver(
      () => ({ id: 'echo', label: 'saved target', prompts: ['first'] }),
      () => runEvaluation(entrypoint, [cloudPath]),
    );
    expect(rows).toEqual([{ provider: 'saved target', prompt: 'first' }]);
  });

  it('uses local prompt overrides without requiring a local label', async () => {
    const rows = await withCloudProviderResolver(
      () => ({ id: 'echo', label: 'saved target', prompts: ['first'] }),
      () => runEvaluation(entrypoint, [{ [cloudPath]: { prompts: ['second'] } }]),
    );
    expect(rows).toEqual([{ provider: 'saved target', prompt: 'second' }]);
  });

  it.each([
    { allowed: [] as string[], expected: [] },
    { allowed: undefined, expected: ['first', 'second'] },
  ])('preserves the empty/absent restriction: $allowed', async ({ allowed, expected }) => {
    const rows = await withCloudProviderResolver(
      () => ({ id: 'echo', label: 'saved target', prompts: allowed }),
      () => runEvaluation(entrypoint, [cloudPath]),
    );
    expect(rows.map((row) => row.prompt)).toEqual(expected);
  });
});

it('renders saved prompt metadata once in the provider environment', async () => {
  const saved: ProviderOptions & { id: string } = {
    id: 'echo',
    label: '{{ env.OPENAI_ORGANIZATION }}',
    prompts: ['{{ env.OPENAI_API_BASE_URL }}'],
    env: { OPENAI_ORGANIZATION: 'saved target', OPENAI_API_BASE_URL: 'first' },
  };
  const rows = await withCloudProviderResolver(
    () => saved,
    () => runEvaluation('library', [cloudPath]),
  );
  expect(rows).toEqual([{ provider: 'saved target', prompt: 'first' }]);
  expect(saved.prompts).toEqual(['{{ env.OPENAI_API_BASE_URL }}']);
});

it('keeps duplicate native IDs independent when their labels differ', async () => {
  const rows = await withCloudProviderResolver(
    () => ({ id: 'echo' }),
    () =>
      runEvaluation('library', [
        { [cloudPath]: { label: 'one', prompts: ['first'] } },
        { [cloudPath]: { label: 'two', prompts: ['second'] } },
      ]),
  );
  expect(rows).toEqual([
    { provider: 'one', prompt: 'first' },
    { provider: 'two', prompt: 'second' },
  ]);
});

it('retains shared-map behavior for duplicate runtime labels with a common restriction', async () => {
  const rows = await withCloudProviderResolver(
    () => ({ id: 'echo', label: 'shared', prompts: ['first'] }),
    () => runEvaluation('library', [cloudPath, cloudPath]),
  );
  expect(rows).toEqual([
    { provider: 'shared', prompt: 'first' },
    { provider: 'shared', prompt: 'first' },
  ]);
});

it('preserves filters from provider configuration files', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'provider.json');
  writeFileSync(file, JSON.stringify({ id: 'echo', label: 'from file', prompts: ['first'] }));
  expect(await runEvaluation('CLI', [`file://${file}`])).toEqual([
    { provider: 'from file', prompt: 'first' },
  ]);
});

it('keeps explicit runtime prompt maps authoritative', async () => {
  const providers = await loadApiProviders([{ id: 'echo', label: 'target', prompts: ['first'] }]);
  const result = new Eval({});
  await evaluateRuntime(
    {
      providers,
      prompts: prompts.map((raw) => ({ raw, label: raw })),
      tests: [{ vars: {} }],
      providerPromptMap: { target: ['second'] },
    },
    result,
    { cache: false, maxConcurrency: 1 },
  );
  expect((await result.toEvaluateSummary()).results.map((row) => row.prompt.label)).toEqual([
    'second',
  ]);
});

it('retains prompt metadata through the runtime schema and single-provider map', async () => {
  const [provider] = await loadApiProviders([{ id: 'echo', label: 'target', prompts: [] }]);
  const parsed = ApiProviderSchema.parse(provider);
  expect(
    readProviderPromptMap(
      { providers: parsed },
      prompts.map((raw) => ({ raw, label: raw })),
    ),
  ).toEqual({ echo: [], target: [] });
});
