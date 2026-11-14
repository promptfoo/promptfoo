import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate as evaluateRuntime } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { evaluate } from '../../src/node/evaluate';
import { testProviderConnectivity } from '../../src/node/testProvider';
import { loadApiProviders } from '../../src/providers/index';
import * as remoteGeneration from '../../src/redteam/remoteGeneration';
import { withCloudProviderResolver } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { sanitizeConfigForOutput } from '../../src/util/sanitizer';
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
  extensions?: string[],
) {
  let result: Eval;
  if (entrypoint === 'CLI') {
    const { testSuite, config } = await resolveConfigs(
      {},
      { providers, prompts, tests: [{ vars: {} }], extensions },
    );
    result = new Eval(config);
    await evaluateRuntime(testSuite, result, { cache: false, maxConcurrency: 1 });
  } else {
    result = await evaluate(
      { providers, prompts, tests: [{ vars: {} }], extensions, writeLatestResults: false },
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
  it.each([
    { operation: "suite.providerPromptMap.echo = ['second']", expected: ['second'] },
    { operation: "suite.providerPromptMap.echo.push('second')", expected: prompts },
    { operation: "suite.providerPromptMap.target.push('second')", expected: prompts },
    { operation: "suite.providerPromptMap.echo.splice(0, 1, 'second')", expected: ['second'] },
    { operation: 'delete suite.providerPromptMap.echo', expected: prompts },
  ])('allows beforeAll indexed overrides: $operation', async ({ operation, expected }) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'override.mjs');
    writeFileSync(
      file,
      `export function beforeAll({ suite }) {
        ${operation};
        return { suite };
      }`,
    );
    const rows = await runEvaluation(
      entrypoint,
      [{ id: 'echo', label: 'target', prompts: ['first'] }],
      [`file://${file}:beforeAll`],
    );
    expect(rows).toEqual(expected.map((prompt) => ({ provider: 'target', prompt })));
  });

  it.each(['echo', 'shared'])(
    'honors an equal-content replacement of the generated %s selector array',
    async (key) => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
      temporaryDirectories.push(directory);
      const file = path.join(directory, 'replacement.mjs');
      writeFileSync(
        file,
        `export function beforeAll({ suite }) {
          suite.providerPromptMap[${JSON.stringify(key)}] = ['second'];
          return { suite };
        }`,
      );
      const providers = [
        { id: 'echo', label: 'shared', prompts: ['first'] },
        { id: 'echo', label: 'shared', prompts: ['second'] },
      ];
      const rows = await runEvaluation(entrypoint, providers, [`file://${file}:beforeAll`]);

      expect(rows).toEqual([
        { provider: 'shared', prompt: 'second' },
        { provider: 'shared', prompt: 'second' },
      ]);
      expect(providers.map((provider) => provider.prompts)).toEqual([['first'], ['second']]);
    },
  );

  it('keeps duplicate provider filters independent through an unchanged hook map', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'unchanged.mjs');
    writeFileSync(
      file,
      `export function beforeAll({ suite }) {
        suite.providerPromptMap = JSON.parse(JSON.stringify(suite.providerPromptMap));
        return { suite };
      }`,
    );
    const rows = await runEvaluation(
      entrypoint,
      [
        { id: 'echo', label: 'shared', prompts: ['first'] },
        { id: 'echo', label: 'shared', prompts: ['second'] },
        { id: 'echo', label: 'shared' },
      ],
      [`file://${file}:beforeAll`],
    );
    expect(rows.map((row) => row.prompt)).toEqual(['first', 'second', ...prompts]);
  });

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

it.each([
  { allowed: ['nested selector'], typeMap: false },
  { allowed: [] as string[], typeMap: false },
  { allowed: undefined, typeMap: false },
  { allowed: ['nested selector'], typeMap: true },
  { allowed: [] as string[], typeMap: true },
  { allowed: undefined, typeMap: true },
])(
  'retains nested runtime selectors in local replay configs: $allowed/type map $typeMap',
  async ({ allowed, typeMap }) => {
    const settings = { transform: 'output', delay: 0, inputs: { query: 'A short question' } };
    const [liveProvider] = await loadApiProviders([{ id: 'echo', prompts: allowed, ...settings }]);
    liveProvider.toJSON = () => ({ id: 'echo' });
    const provider = typeMap
      ? {
          text: liveProvider,
          embedding: liveProvider,
          classification: liveProvider,
          moderation: liveProvider,
        }
      : liveProvider;
    const test = {
      provider: liveProvider,
      options: { provider },
      assert: [
        { type: 'equals' as const, value: 'first', provider },
        {
          type: 'assert-set' as const,
          assert: [{ type: 'equals' as const, value: 'first', provider }],
        },
      ],
    };
    const result = await evaluate(
      {
        providers: ['echo'],
        prompts: ['first'],
        defaultTest: test,
        tests: [test],
        scenarios: [
          { config: [test], tests: [test] },
          { config: [test], tests: [{}] },
        ],
        writeLatestResults: false,
      },
      { cache: false, maxConcurrency: 1 },
    );
    const summary = await result.toEvaluateSummary();
    expect(summary.stats.successes).toBeGreaterThan(0);
    expect(summary.stats.failures).toBe(0);
    const expected = allowed?.slice();
    liveProvider.prompts?.push('runtime-only');
    liveProvider.inputs = { query: 'Runtime-only description' };
    const saved = JSON.parse(JSON.stringify(result.config));
    const projected = sanitizeConfigForOutput(saved, { shouldStripPromptText: true });

    for (const [config, selectors] of [
      [saved, expected],
      [projected, undefined],
    ] as const) {
      const refs = [
        config.defaultTest.provider,
        config.tests[0].provider,
        config.scenarios[0].config[0].provider,
        config.scenarios[1].config[0].provider,
        ...[
          config.defaultTest.options.provider,
          config.tests[0].options.provider,
          config.tests[0].assert[0].provider,
          config.tests[0].assert[1].assert[0].provider,
          config.scenarios[0].tests[0].options.provider,
          config.scenarios[0].config[0].options.provider,
          config.scenarios[0].config[0].assert[0].provider,
          config.scenarios[0].config[0].assert[1].assert[0].provider,
          config.scenarios[1].config[0].options.provider,
        ].flatMap((reference) => (typeMap ? Object.values(reference) : [reference])),
      ];
      for (const reference of refs) {
        expect(reference).toMatchObject({ id: 'echo', ...settings });
        expect(reference.prompts).toEqual(selectors);
        expect(reference).not.toHaveProperty('callApi');
        const [reloaded] = await loadApiProviders([reference]);
        expect(reloaded.prompts).toEqual(selectors);
        expect(reloaded.transform).toBe(settings.transform);
        expect(reloaded.delay).toBe(0);
        expect(reloaded.inputs).toEqual(settings.inputs);
      }
    }
    expect(saved.defaultTest.provider.prompts).toEqual(expected);
    expect(test.provider).toBe(liveProvider);
    expect(test.options.provider).toBe(provider);
    expect(fetchWithProxy).not.toHaveBeenCalled();
  },
);

it('preserves mixed provider type-map entries and application settings', async () => {
  const [liveProvider] = await loadApiProviders([{ id: 'echo', prompts: ['nested selector'] }]);
  const inline = { id: 'echo', config: { applicationSetting: 'keep' }, prompts: [] };
  const application = { prompts: ['application setting'] };
  const provider = { text: liveProvider, embedding: 'echo', classification: inline, application };
  const result = await evaluate(
    {
      providers: ['echo'],
      prompts: ['first'],
      tests: [{ options: { provider }, assert: [{ type: 'equals', value: 'first' }] }],
      writeLatestResults: false,
    },
    { cache: false, maxConcurrency: 1 },
  );
  const summary = await result.toEvaluateSummary();
  expect(summary.stats.successes).toBe(1);
  expect(summary.stats.failures).toBe(0);
  const config = result.config as { tests: { options: { provider: typeof provider } }[] };
  const serialized = config.tests[0].options.provider;
  expect(serialized).not.toBe(provider);
  expect(serialized.embedding).toBe('echo');
  expect(serialized.classification).toBe(inline);
  expect(serialized.application).toBe(application);
  expect(provider.text).toBe(liveProvider);
  const saved = JSON.parse(JSON.stringify(serialized));
  expect(saved).toEqual({
    text: expect.objectContaining({ id: 'echo', prompts: ['nested selector'] }),
    embedding: 'echo',
    classification: inline,
    application,
  });
  const [reloaded] = await loadApiProviders([saved.text]);
  expect(reloaded.prompts).toEqual(['nested selector']);
  expect(fetchWithProxy).not.toHaveBeenCalled();
});

it('keeps instance filters independent when reevaluating the same runtime suite', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'repeat.mjs');
  writeFileSync(file, 'export function beforeAll({ suite }) { return { suite }; }');
  const providers = await loadApiProviders([
    { id: 'echo', label: 'shared', prompts: ['first'] },
    { id: 'echo', label: 'shared', prompts: ['second'] },
  ]);
  const testSuite = {
    providers,
    prompts: prompts.map((raw) => ({ raw, label: raw })),
    tests: [{ vars: {} }],
    extensions: [`file://${file}:beforeAll`],
  };

  for (let run = 0; run < 2; run++) {
    const result = new Eval({});
    await evaluateRuntime(testSuite, result, { cache: false, maxConcurrency: 1 });
    const summary = await result.toEvaluateSummary();
    expect(summary.stats).toMatchObject({ successes: 2, failures: 0 });
    expect(summary.results.map((row) => row.prompt.label)).toEqual(['first', 'second']);
    expect(testSuite).not.toHaveProperty('providerPromptMap');
  }
  expect(providers.map((provider) => provider.prompts)).toEqual([['first'], ['second']]);
  expect(fetchWithProxy).not.toHaveBeenCalled();
});

it('keeps explicit runtime prompt maps authoritative and mutable', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-prompt-filter-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'explicit.mjs');
  writeFileSync(
    file,
    `export function beforeAll({ suite }) {
      suite.providerPromptMap.target.splice(0, 1, 'second');
      return { suite };
    }`,
  );
  const providers = await loadApiProviders([{ id: 'echo', label: 'target', prompts: ['first'] }]);
  const result = new Eval({});
  const providerPromptMap = { target: ['first'] };
  const testSuite = {
    providers,
    prompts: prompts.map((raw) => ({ raw, label: raw })),
    tests: [{ vars: {} }],
    providerPromptMap,
    extensions: [`file://${file}:beforeAll`],
  };
  await evaluateRuntime(testSuite, result, { cache: false, maxConcurrency: 1 });
  expect(testSuite.providerPromptMap).toBe(providerPromptMap);
  expect(providerPromptMap).toEqual({ target: ['second'] });
  expect((await result.toEvaluateSummary()).results.map((row) => row.prompt.label)).toEqual([
    'second',
  ]);
});

it('retains prompt metadata through the runtime schema', async () => {
  const [provider] = await loadApiProviders([{ id: 'echo', label: 'target', prompts: [] }]);
  expect(ApiProviderSchema.parse(provider).prompts).toEqual([]);
});

it.each([
  { label: undefined, allowed: ['first'] },
  { label: 'labeled', allowed: ['first'] },
  { label: 'labeled', allowed: [] as string[] },
])(
  'runs connectivity diagnostics independently of evaluation filters: $label/$allowed',
  async ({ label, allowed }) => {
    vi.spyOn(remoteGeneration, 'neverGenerateRemote').mockReturnValue(true);
    const [provider] = await loadApiProviders([{ id: 'echo', label, prompts: allowed }]);
    const originalSelectors = provider.prompts;
    const callApi = vi.spyOn(provider, 'callApi');
    const prompt = `Connectivity ${label ?? 'unlabeled'} ${allowed.length}`;

    const result = await testProviderConnectivity({ provider, prompt });

    expect(result.success).toBe(true);
    expect(result.providerResponse).toMatchObject({ output: prompt });
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(provider.prompts).toBe(originalSelectors);
    expect(provider.prompts).toEqual(allowed);
    expect(fetchWithProxy).not.toHaveBeenCalled();
  },
);
