import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../../src/cliState';
import { registerRunEvaluationTool } from '../../../../src/commands/mcp/tools/runEvaluation';
import { runDbMigrations } from '../../../../src/migrate';
import Eval from '../../../../src/models/eval';
import { doEval } from '../../../../src/node/doEval';
import { loadDefaultConfig } from '../../../../src/util/config/default';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CommandLineOptions, UnifiedConfig } from '../../../../src/types/index';

vi.mock('../../../../src/logger');
vi.mock('../../../../src/util/config/default', () => ({ loadDefaultConfig: vi.fn() }));
vi.mock('../../../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn(), recordAndSendOnce: vi.fn() },
}));
vi.mock('../../../../src/share', () => ({
  isSharingEnabled: () => false,
  createShareableUrl: async () => null,
}));

describe('MCP configured test selection', () => {
  let tempDir: string;
  let originalExitCode: typeof process.exitCode;
  let originalState: Pick<typeof cliState, 'config' | 'basePath' | 'selectedProviderConfigs'>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDefaultConfig)
      .mockReset()
      .mockResolvedValue({ defaultConfig: {}, defaultConfigPath: undefined });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-selection-'));
    originalExitCode = process.exitCode;
    originalState = {
      config: cliState.config,
      basePath: cliState.basePath,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
    };
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    Object.assign(cliState, originalState);
    cliState.resume = false;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(
    form: 'top-level' | 'scenario' | 'implicit',
    configured: Partial<CommandLineOptions>,
    extra: Partial<UnifiedConfig> = {},
  ) {
    const tests = ['other', 'keep', 'last'].map((description) => ({
      description,
      vars: { input: description },
      provider: 'echo',
    }));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        providers: ['echo'],
        prompts: [{ raw: '{{input}}', label: 'Prompt' }],
        ...(form === 'top-level' ? { tests } : {}),
        ...(form === 'scenario' ? { scenarios: [{ config: [{}], tests }] } : {}),
        commandLineOptions: configured,
        ...extra,
      }),
    );
    return configPath;
  }

  async function run(configPath: string, filters: Record<string, unknown> = {}) {
    const tool = vi.fn();
    registerRunEvaluationTool({ tool } as unknown as McpServer);
    const [, , handler] = tool.mock.calls[0];
    const result = await handler({
      configPath,
      cache: false,
      write: true,
      share: false,
      ...filters,
    });
    expect(result.isError, result.content[0].text).toBe(false);
    const id = JSON.parse(result.content[0].text).data.eval.id;
    const record = await Eval.findById(id);
    if (!record) {
      throw new Error(`Missing persisted eval ${id}`);
    }
    return record;
  }

  async function descriptions(record: Eval) {
    const persisted = await Eval.findById(record.id);
    if (!persisted) {
      throw new Error(`Missing persisted eval ${record.id}`);
    }
    return (await persisted.toEvaluateSummary()).results.map(
      (result) => result.testCase.description,
    );
  }

  async function resume(record: Eval) {
    const options = { resume: record.id, table: false, write: true };
    await doEval(options, {}, undefined, {});
  }

  describe.each(['top-level', 'scenario'] as const)('%s tests', (form) => {
    describe.each([
      { name: 'count', configured: { filterFirstN: 1 } },
      { name: 'pattern', configured: { filterPattern: '^keep$' } },
    ])('$name', ({ configured }) => {
      it.each([{ providerFilter: 'echo' }, { promptFilter: 'Prompt' }, { promptFilter: '0' }])(
        'keeps configured selection with matching filters %j',
        async (filters) => {
          const configPath = writeConfig(form, configured);
          const simple = await run(configPath);
          const filtered = await run(configPath, filters);

          expect(await descriptions(filtered)).toEqual(await descriptions(simple));
        },
      );
    });
  });

  it.each([
    { configured: { filterFirstN: 1 }, count: 1 },
    { configured: { filterPattern: '^keep$' }, count: 0 },
  ])('preserves $count implicit tests and their replay', async ({ configured, count }) => {
    const record = await run(writeConfig('implicit', configured), { providerFilter: 'echo' });
    expect(await descriptions(record)).toHaveLength(count);
    await resume(record);
    expect(await descriptions(record)).toHaveLength(count);
  });

  it.each([{ filterFirstN: 1 }, { filterPattern: '^keep$' }])(
    'gives explicit authored indices precedence over top-level defaults %j',
    async (configured) => {
      const record = await run(writeConfig('top-level', configured), {
        providerFilter: 'echo',
        testCaseIndices: 2,
      });
      expect(await descriptions(record)).toEqual(['last']);
    },
  );

  it('applies scenario defaults independently of explicit top-level indices', async () => {
    const configPath = writeConfig(
      'top-level',
      { filterFirstN: 1 },
      {
        scenarios: [
          {
            config: [{}],
            tests: ['scenario-first', 'scenario-last'].map((description) => ({
              description,
              vars: { input: description },
            })),
          },
        ],
      },
    );
    const record = await run(configPath, { testCaseIndices: 2 });
    expect(await descriptions(record)).toEqual(['last', 'scenario-first']);
  });

  it.each([false, true])(
    'retains selected raw rows and range on replay with scenarios=%s',
    async (scenarios) => {
      const configPath = writeConfig(
        'top-level',
        { filterFirstN: 1, filterRange: '1:3' },
        {
          ...(scenarios
            ? {
                scenarios: [
                  {
                    config: [{}],
                    tests: [{ description: 'scenario', vars: { input: 'scenario' } }],
                  },
                ],
              }
            : {}),
        },
      );
      const record = await run(configPath, { providerFilter: 'echo' });
      const initial = await descriptions(record);
      expect(initial).toEqual(scenarios ? ['scenario'] : ['keep']);
      expect(record.config.tests).toEqual([
        {
          description: scenarios ? 'other' : 'keep',
          vars: { input: scenarios ? 'other' : 'keep' },
          provider: 'echo',
        },
      ]);
      expect(record.runtimeOptions?.filterRange).toBe(scenarios ? '1:3' : undefined);
      await resume(record);
      expect(await descriptions(record)).toEqual(initial);
    },
  );

  it('keeps sampled selection order when replayed', async () => {
    const record = await run(
      writeConfig('top-level', { filterPattern: '.', filterSample: 2, filterSampleSeed: 42 }),
      { promptFilter: '0' },
    );
    const initial = await descriptions(record);
    expect(initial).toHaveLength(2);
    await resume(record);
    expect(await descriptions(record)).toEqual(initial);
  });

  it('reports the original top-level total alongside the filtered count', async () => {
    const tool = vi.fn();
    registerRunEvaluationTool({ tool } as unknown as McpServer);
    const [, , handler] = tool.mock.calls[0];
    const result = await handler({
      configPath: writeConfig('top-level', { filterFirstN: 1 }),
      providerFilter: 'echo',
      cache: false,
      write: true,
      share: false,
    });
    expect(result.isError, result.content[0].text).toBe(false);
    expect(JSON.parse(result.content[0].text).data.configuration.testCases).toMatchObject({
      total: 3,
      filtered: 1,
    });
  });
});
