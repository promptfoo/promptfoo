import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate as evaluateRuntime } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { evaluate } from '../../src/node/evaluate';
import { loadApiProviders } from '../../src/providers/index';
import { withCloudProviderResolver } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { ApiProviderSchema } from '../../src/validators/providers';

import type { UnifiedConfig } from '../../src/types/index';
import type { ProviderOptions } from '../../src/types/providers';

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

async function runEvaluation(
  entrypoint: 'CLI' | 'library',
  providers: NonNullable<UnifiedConfig['providers']>,
) {
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

  it.each([undefined, 'shared'])(
    'keeps differing filters independent at runtime identity %s',
    async (label) => {
      const rows = await withCloudProviderResolver(
        () => ({ id: 'echo', label }),
        () =>
          runEvaluation(entrypoint, [
            { [cloudPath]: { prompts: ['first'] } },
            { [cloudPath]: { prompts: ['second'] } },
          ]),
      );
      expect(rows).toEqual([
        { provider: label || 'echo', prompt: 'first' },
        { provider: label || 'echo', prompt: 'second' },
      ]);
    },
  );

  it.each([false, true])(
    'keeps filtered and unrestricted duplicates independent (reverse: %s)',
    async (reverse) => {
      const providers = [{ id: 'echo', prompts: ['first'] }, { id: 'echo' }];
      if (reverse) {
        providers.reverse();
      }
      const rows = await runEvaluation(entrypoint, providers);
      expect(rows.map((row) => row.prompt)).toEqual(
        reverse ? ['first', 'second', 'first'] : ['first', 'first', 'second'],
      );
    },
  );

  it('round-trips differing runtime filters for duplicate identities', async () => {
    const providers = await loadApiProviders([
      { id: 'echo', prompts: ['first'] },
      { id: 'echo', prompts: ['second'] },
    ]);
    const result = await evaluate(
      { providers, prompts, tests: [{ vars: {} }], writeLatestResults: false },
      { cache: false, maxConcurrency: 1 },
    );
    const saved = JSON.parse(JSON.stringify(result.config)) as UnifiedConfig;
    expect(
      await runEvaluation(entrypoint, saved.providers as NonNullable<UnifiedConfig['providers']>),
    ).toEqual([
      { provider: 'echo', prompt: 'first' },
      { provider: 'echo', prompt: 'second' },
    ]);
  });
});

it('keeps authored selectors literal while rendering the saved provider label', async () => {
  const literalPrompt = '{{ env.OPENAI_API_BASE_URL }}';
  const saved: ProviderOptions & { id: string } = {
    id: 'echo',
    label: '{{ env.OPENAI_ORGANIZATION }}',
    prompts: [literalPrompt],
    env: { OPENAI_ORGANIZATION: 'saved target', OPENAI_API_BASE_URL: 'first' },
  };
  const result = await withCloudProviderResolver(
    () => saved,
    () =>
      evaluate(
        {
          providers: [cloudPath],
          prompts: [literalPrompt, 'other'],
          tests: [{ vars: {} }],
          writeLatestResults: false,
        },
        { cache: false, maxConcurrency: 1 },
      ),
  );
  const rows = (await result.toEvaluateSummary()).results;
  expect(rows.map((row) => ({ provider: row.provider.label, prompt: row.prompt.label }))).toEqual([
    { provider: 'saved target', prompt: literalPrompt },
  ]);
  expect(saved.prompts).toEqual([literalPrompt]);
  expect(fetchWithProxy).not.toHaveBeenCalled();
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

it('retains a common restriction for duplicate runtime labels', async () => {
  const rows = await withCloudProviderResolver(
    () => ({ id: 'echo', label: 'shared', prompts: ['first'] }),
    () => runEvaluation('library', [cloudPath, cloudPath]),
  );
  expect(rows).toEqual([
    { provider: 'shared', prompt: 'first' },
    { provider: 'shared', prompt: 'first' },
  ]);
});

it.each([false, true])(
  'does not share a labeled restriction through its native ID (reverse: %s)',
  async (reverse) => {
    const providers = [
      { [cloudPath]: { label: 'filtered', prompts: ['first'] } },
      { [cloudPath]: {} },
    ];
    if (reverse) {
      providers.reverse();
    }
    const rows = await withCloudProviderResolver(
      () => ({ id: 'echo' }),
      () => runEvaluation('library', providers),
    );
    expect(rows.filter((row) => row.provider === 'filtered')).toEqual([
      { provider: 'filtered', prompt: 'first' },
    ]);
    expect(rows.filter((row) => row.provider === 'echo').map((row) => row.prompt)).toEqual(prompts);
  },
);

it('runs a prompt added after CLI provider loading for an unrestricted provider', async () => {
  const { testSuite, config } = await resolveConfigs(
    {},
    { providers: ['echo'], prompts: ['first'], tests: [{ vars: {} }] },
  );
  testSuite.prompts.push({ raw: 'generated', label: 'generated' });
  const result = new Eval(config);
  await evaluateRuntime(testSuite, result, { cache: false, maxConcurrency: 1 });
  expect((await result.toEvaluateSummary()).results.map((row) => row.prompt.label)).toEqual([
    'first',
    'generated',
  ]);
  expect(fetchWithProxy).not.toHaveBeenCalled();
});

it('runs a library beforeAll extension prompt for an unrestricted provider', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'extension.mjs');
  writeFileSync(
    file,
    `export function beforeAll({ suite }) {
    return { suite: { ...suite, prompts: [...suite.prompts, { raw: 'extension', label: 'extension' }] } };
  }`,
  );
  const result = await evaluate(
    {
      providers: ['echo'],
      prompts: ['first'],
      tests: [{ vars: {} }],
      extensions: [`file://${file}:beforeAll`],
      writeLatestResults: false,
    },
    { cache: false, maxConcurrency: 1 },
  );
  expect((await result.toEvaluateSummary()).results.map((row) => row.prompt.label)).toEqual([
    'first',
    'extension',
  ]);
  expect(fetchWithProxy).not.toHaveBeenCalled();
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

it.each([{ selectors: ['second'] }, { selectors: [] as string[] }])(
  'lets outer file-provider selectors override saved selectors: $selectors',
  async ({ selectors }) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'provider.json');
    writeFileSync(file, JSON.stringify({ id: 'echo', label: 'from file', prompts: ['first'] }));
    const rows = await runEvaluation('CLI', [{ id: `file://${file}`, prompts: selectors }]);
    expect(rows.map((row) => row.prompt)).toEqual(selectors);
  },
);

it.each([
  { allowed: ['first'], expected: ['first'] },
  { allowed: [] as string[], expected: [] },
  { allowed: undefined, expected: prompts },
])(
  'retains runtime selectors through a saved config round trip: $allowed',
  async ({ allowed, expected }) => {
    const providers = await loadApiProviders([{ id: 'echo', label: 'target', prompts: allowed }]);
    const result = await evaluate(
      { providers, prompts, tests: [{ vars: {} }], writeLatestResults: false },
      { cache: false, maxConcurrency: 1 },
    );
    providers[0].prompts?.push('second');
    const saved = JSON.parse(JSON.stringify(result.config)) as UnifiedConfig;
    expect(saved.providers).toBeDefined();
    expect(
      await runEvaluation('library', saved.providers as NonNullable<UnifiedConfig['providers']>),
    ).toEqual(expected.map((prompt) => ({ provider: 'target', prompt })));
  },
);

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

it('retains prompt metadata through the runtime schema', async () => {
  const [provider] = await loadApiProviders([{ id: 'echo', label: 'target', prompts: [] }]);
  expect(ApiProviderSchema.parse(provider).prompts).toEqual([]);
});
