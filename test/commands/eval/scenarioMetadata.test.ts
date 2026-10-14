import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { doEval } from '../../../src/node/doEval';
import { resolveConfigs } from '../../../src/util/config/load';
import { mockProcessEnv } from '../../util/utils';

import type { TestCase, UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/telemetry', () => ({
  default: {
    initialize: vi.fn(),
    record: vi.fn(),
    identify: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('CLI scenario metadata filtering', () => {
  let directory: string;
  let restoreEnv: () => void;
  let previousConfig: typeof cliState.config;
  let previousBasePath: typeof cliState.basePath;
  let previousProviders: typeof cliState.selectedProviderConfigs;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-metadata-'));
    previousConfig = cliState.config;
    previousBasePath = cliState.basePath;
    previousProviders = cliState.selectedProviderConfigs;
    restoreEnv = mockProcessEnv({
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_UPDATE: 'true',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_SHARING: 'true',
    });
  });

  afterEach(() => {
    restoreEnv();
    cliState.config = previousConfig;
    cliState.basePath = previousBasePath;
    cliState.selectedProviderConfigs = previousProviders;
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function row(input: string, metadata?: TestCase['metadata'], description = input): TestCase {
    return { vars: { input }, description, ...(metadata && { metadata }) };
  }

  async function run(config: Partial<UnifiedConfig>, filters: Parameters<typeof doEval>[0] = {}) {
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ prompts: ['{{input}}'], providers: ['echo'], sharing: false, ...config }),
    );
    const result = await doEval(
      { config: [configPath], write: false, table: false, share: false, cache: false, ...filters },
      {},
      undefined,
      { showProgressBar: false, maxConcurrency: 1 },
    );
    return result.getResults();
  }

  it('excludes nonmatching and missing row metadata', async () => {
    const results = await run(
      {
        scenarios: [
          {
            config: [{}],
            tests: [
              row('keep', { category: 'keep' }),
              row('drop', { category: 'drop' }),
              row('missing'),
            ],
          },
        ],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['keep']);
  });

  it('loads relative YAML scenario test files before filtering their metadata', async () => {
    fs.mkdirSync(path.join(directory, 'scenarios'));
    fs.mkdirSync(path.join(directory, 'data'));
    fs.writeFileSync(
      path.join(directory, 'scenarios', 'example.yaml'),
      'config: [{}]\ntests:\n  - file://data/rows.yaml\n',
    );
    fs.writeFileSync(
      path.join(directory, 'data', 'rows.yaml'),
      '- vars: { input: keep }\n  metadata: { category: keep }\n- vars: { input: drop }\n  metadata: { category: drop }\n',
    );
    const results = await run(
      { scenarios: ['file://scenarios/example.yaml'] },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['keep']);
  });

  it('merges default, config and row metadata separately for each config variant', async () => {
    const results = await run(
      {
        prompts: ['{{variant}}:{{input}}'],
        defaultTest: { metadata: { category: 'default', defaultOnly: 'default' } },
        scenarios: [
          {
            config: [
              { vars: { variant: 'a' }, metadata: { category: 'keep', configOnly: 'config' } },
              { vars: { variant: 'b' }, metadata: { category: 'drop', configOnly: 'config' } },
            ],
            tests: [
              row('inherited'),
              row('override', { category: 'keep' }),
              row('excluded', { category: 'drop' }),
            ],
          },
        ],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual([
      'a:inherited',
      'a:override',
      'b:override',
    ]);
    expect(results.map((result) => result.metadata?.conversationId)).toEqual([
      '__scenario_0__',
      '__scenario_0__',
      '__scenario_1__',
    ]);
    for (const result of results) {
      expect(result.metadata).toMatchObject({
        category: 'keep',
        defaultOnly: 'default',
        configOnly: 'config',
      });
    }
  });

  it('inherits default metadata when the scenario config and row omit it', async () => {
    const results = await run(
      {
        defaultTest: { metadata: { category: 'keep' } },
        scenarios: [
          { config: [{}], tests: [row('inherited'), row('excluded', { category: 'drop' })] },
        ],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['inherited']);
  });

  it('inherits suite metadata when no defaultTest metadata overrides it', async () => {
    const results = await run(
      {
        metadata: { category: 'keep' },
        scenarios: [{ config: [{}], tests: [row('inherited')] }],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['inherited']);
  });

  it.each([
    [
      ['tags=red,green', 'region=us'],
      ['both', 'green'],
    ],
    [['tags=red', 'tags=blue'], ['both']],
    [['label=red\\,blue'], ['both']],
  ])(
    'preserves OR, repeated AND and escaped comma semantics: %j',
    async (filterMetadata, expected) => {
      const results = await run(
        {
          scenarios: [
            {
              config: [{}],
              tests: [
                row('both', { tags: ['red', 'blue'], region: 'us', label: 'red,blue' }),
                row('green', { tags: ['green'], region: 'us' }),
                row('excluded', { tags: ['red'], region: 'eu' }),
              ],
            },
          ],
        },
        { filterMetadata },
      );
      expect(results.map((result) => result.response?.output)).toEqual(expected);
    },
  );

  it('applies metadata before the existing pattern and first-N filters', async () => {
    const results = await run(
      {
        scenarios: [
          {
            config: [{}],
            tests: [
              row('wrong-category', { category: 'drop' }, 'run'),
              row('wrong-description', { category: 'keep' }, 'skip'),
              row('first-match', { category: 'keep' }, 'run first'),
              row('second-match', { category: 'keep' }, 'run second'),
            ],
          },
        ],
      },
      { filterMetadata: 'category=keep', filterPattern: '^run', filterFirstN: 1 },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['first-match']);
  });

  it('keeps empty config groups without synthesizing an implicit test', async () => {
    const results = await run(
      {
        defaultTest: { vars: { input: 'must-not-run' } },
        scenarios: [{ config: [{}, {}], tests: [row('drop', { category: 'drop' })] }],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results).toEqual([]);
  });

  it('retains conversation group numbering after an empty config variant', async () => {
    const results = await run(
      {
        scenarios: [
          {
            config: [{ metadata: { category: 'drop' } }, { metadata: { category: 'keep' } }],
            tests: [row('first-scenario')],
          },
          {
            config: [{ metadata: { category: 'keep' } }],
            tests: [row('second-scenario')],
          },
          {
            config: [{ metadata: { category: 'keep', conversationId: 'custom-group' } }],
            tests: [row('custom-scenario')],
          },
        ],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual([
      'first-scenario',
      'second-scenario',
      'custom-scenario',
    ]);
    expect(results.map((result) => result.metadata?.conversationId)).toEqual([
      '__scenario_1__',
      '__scenario_2__',
      'custom-group',
    ]);
    expect(results.map((result) => result.testIdx)).toEqual([0, 1, 2]);
  });

  it('keeps config grouping and existing first-N selection without a metadata filter', async () => {
    const source: Partial<UnifiedConfig> = {
      prompts: ['{{input}}'],
      providers: ['echo'],
      scenarios: [
        {
          config: [{ vars: { variant: 'a' } }, { vars: { variant: 'b' } }],
          tests: [row('first'), row('second')],
        },
      ],
    };
    const original = JSON.stringify(source);
    const { testSuite } = await resolveConfigs({ filterFirstN: 1 }, source);
    expect(testSuite.scenarios).toHaveLength(1);
    expect(testSuite.scenarios?.[0].config).toHaveLength(2);
    expect(testSuite.scenarios?.[0].tests.map((test) => test.vars?.input)).toEqual(['first']);
    expect(JSON.stringify(source)).toBe(original);
    const results = await run(
      { ...source, prompts: ['{{variant}}:{{input}}'] },
      { filterFirstN: 1 },
    );
    expect(results.map((result) => result.response?.output)).toEqual(['a:first', 'b:first']);
  });

  it('retains seeded sample order for every matching config in multiple scenarios', async () => {
    const source: Partial<UnifiedConfig> = {
      prompts: ['{{input}}'],
      providers: ['echo'],
      defaultTest: { metadata: { category: 'keep' } },
      scenarios: ['first', 'second'].map((group) => ({
        config: [{ vars: { group, variant: 'a' } }, { vars: { group, variant: 'b' } }],
        tests: Array.from({ length: 12 }, (_, i) => row(`${group}-${i}`)),
      })),
    };
    const filters = { filterSample: 3, filterSampleSeed: 37 };
    const original = await resolveConfigs(filters, source);
    const filtered = await resolveConfigs({ ...filters, filterMetadata: 'category=keep' }, source);
    const originalSelections = original.testSuite.scenarios?.flatMap((scenario) =>
      scenario.config.map(() => scenario.tests.map((test) => test.vars?.input)),
    );
    expect(
      filtered.testSuite.scenarios?.map((scenario) =>
        scenario.tests.map((test) => test.vars?.input),
      ),
    ).toEqual(originalSelections);
    const repeated = await resolveConfigs({ ...filters, filterMetadata: 'category=keep' }, source);
    expect(
      repeated.testSuite.scenarios?.map((scenario) =>
        scenario.tests.map((test) => test.vars?.input),
      ),
    ).toEqual(originalSelections);
  });

  it('shares a selected row provider across its config variants', async () => {
    const { testSuite } = await resolveConfigs(
      { filterMetadata: 'category=keep' },
      {
        prompts: ['{{input}}'],
        providers: ['echo'],
        scenarios: [
          {
            config: [{}, {}],
            tests: [{ ...row('shared', { category: 'keep' }), provider: 'echo' }],
          },
        ],
      },
    );
    expect(testSuite.scenarios).toHaveLength(2);
    expect(testSuite.scenarios?.[0].tests[0].provider).toBe(
      testSuite.scenarios?.[1].tests[0].provider,
    );
  });

  it('filters direct tests and scenario tests in the same evaluation', async () => {
    const results = await run(
      {
        tests: [row('direct-drop', { category: 'drop' }), row('direct-keep', { category: 'keep' })],
        scenarios: [
          {
            config: [{}],
            tests: [
              row('scenario-drop', { category: 'drop' }),
              row('scenario-keep', { category: 'keep' }),
            ],
          },
        ],
      },
      { filterMetadata: 'category=keep' },
    );
    expect(results.map((result) => result.response?.output)).toEqual([
      'direct-keep',
      'scenario-keep',
    ]);
  });

  it('preserves authored metadata and replays the selected rows without the filter', async () => {
    const source: Partial<UnifiedConfig> = {
      prompts: ['{{input}}'],
      providers: ['echo'],
      defaultTest: { metadata: { inherited: 'default' } },
      scenarios: [
        {
          config: [{ metadata: { category: 'keep' } }, { metadata: { category: 'drop' } }],
          tests: [row('inherited')],
        },
      ],
    };
    const original = JSON.stringify(source);
    const first = await resolveConfigs({ filterMetadata: 'category=keep' }, source);
    expect(first.testSuite.scenarios?.map((scenario) => scenario.tests.length)).toEqual([1, 0]);
    expect(first.testSuite.scenarios?.[0].tests[0].metadata).toBeUndefined();
    expect(JSON.stringify(source)).toBe(original);
    const replay = await resolveConfigs({}, JSON.parse(JSON.stringify(first.config)));
    expect(replay.testSuite.scenarios?.map((scenario) => scenario.tests.length)).toEqual([1, 0]);
  });
});
