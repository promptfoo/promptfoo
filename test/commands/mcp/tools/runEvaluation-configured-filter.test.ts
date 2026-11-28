import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import cliState from '../../../../src/cliState';
import { registerRunEvaluationTool } from '../../../../src/commands/mcp/tools/runEvaluation';
import { runDbMigrations } from '../../../../src/migrate';
import Eval from '../../../../src/models/eval';
import telemetry from '../../../../src/telemetry';
import { mockProcessEnv } from '../../../util/utils';

import type { FormattedEvalResult } from '../../../../src/commands/mcp/lib/resultFormatter';
import type { ToolResponse, ToolResult } from '../../../../src/commands/mcp/lib/types';

type EvaluationData = {
  eval: { id: string };
  results: {
    stats: { successes: number; failures: number; errors: number };
    results: FormattedEvalResult[];
  };
};

// Integration regression: real registered MCP callback, real resolveConfigs/doEval,
// real evaluator and echo provider. No provider, resolver, or evaluator is mocked.
const cases = [
  { name: 'absent promptFilter preserves config default', args: {}, expected: ['Keep'] },
  {
    name: 'provider-only filter preserves config default',
    args: { providerFilter: 'echo' },
    expected: ['Keep'],
  },
  {
    name: 'test-only filter preserves config default',
    args: { testCaseIndices: 1 },
    expected: ['Keep'],
    expectedTests: 1,
  },
  {
    name: 'explicit regex overrides config default',
    args: { promptFilter: '^Drop$' },
    expected: ['Drop'],
  },
  {
    name: 'explicit empty string clears config default',
    args: { promptFilter: '' },
    expected: ['Drop', 'Keep', 'Later'],
  },
  {
    name: 'explicit empty plus provider filter clears config default',
    args: { promptFilter: '', providerFilter: 'echo' },
    expected: ['Drop', 'Keep', 'Later'],
  },
  {
    name: 'numeric zero uses original prompt ordering',
    args: { promptFilter: '0' },
    expected: ['Drop'],
  },
  {
    name: 'numeric one uses original prompt ordering',
    args: { promptFilter: '1' },
    expected: ['Keep'],
  },
  {
    name: 'numeric array uses original prompt ordering',
    args: { promptFilter: ['0', '2'] },
    expected: ['Drop', 'Later'],
  },
  {
    name: 'regex array overrides config default',
    args: { promptFilter: ['^Drop$', '^Keep$'] },
    expected: ['Drop', 'Keep'],
  },
  {
    name: 'no config default regex control',
    args: { promptFilter: '^Drop$' },
    expected: ['Drop'],
    configured: false,
  },
  {
    name: 'no config default numeric control',
    args: { promptFilter: '0' },
    expected: ['Drop'],
    configured: false,
  },
  {
    name: 'no config default numeric array control',
    args: { promptFilter: ['0', '2'] },
    expected: ['Drop', 'Later'],
    configured: false,
  },
  {
    name: 'no config default empty string control',
    args: { promptFilter: '' },
    expected: ['Drop', 'Keep', 'Later'],
    configured: false,
  },
];

describe('MCP explicit prompt selection overrides configured prompt filter', () => {
  let tempDir: string;
  let configuredPath: string;
  let unfilteredPath: string;
  let server: McpServer;
  let handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  let schema: z.ZodObject<z.ZodRawShape>;
  let restoreEnv: () => void;
  let originalState: Pick<
    typeof cliState,
    'basePath' | 'config' | 'selectedProviderConfigs' | 'maxConcurrency'
  >;

  beforeAll(async () => {
    restoreEnv = mockProcessEnv({
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_SHARING: 'true',
      PROMPTFOO_DISABLE_DEBUG_LOG: '1',
      PROMPTFOO_DISABLE_ERROR_LOG: '1',
    });
    await runDbMigrations();
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'mcp-configured-prompt-filter-'));
    configuredPath = path.join(tempDir, 'configured.json');
    unfilteredPath = path.join(tempDir, 'unfiltered.json');
    const config = {
      prompts: [
        { raw: 'drop {{topic}}', label: 'Drop' },
        { raw: 'keep {{topic}}', label: 'Keep' },
        { raw: 'later {{topic}}', label: 'Later' },
      ],
      providers: ['echo'],
      tests: [{ vars: { topic: 'alpha' } }, { vars: { topic: 'beta' } }],
    };
    await writeFile(unfilteredPath, JSON.stringify(config));
    await writeFile(
      configuredPath,
      JSON.stringify({ ...config, commandLineOptions: { filterPrompts: '^Keep$' } }),
    );
    server = new McpServer({ name: 'offline-filter-regression', version: '1.0.0' });
    const registration = vi.spyOn(server, 'tool');
    registerRunEvaluationTool(server);
    expect(registration).toHaveBeenCalledTimes(1);
    const [name, rawSchema, callback] = registration.mock.calls[0] as unknown as [
      string,
      z.ZodRawShape,
      typeof handler,
    ];
    expect(name).toBe('run_evaluation');
    schema = z.object(rawSchema);
    handler = callback;
  });

  beforeEach(() => {
    // Suppress only external telemetry, including its disabled-consent event.
    vi.spyOn(telemetry, 'record').mockImplementation(() => {});
    originalState = {
      basePath: cliState.basePath,
      config: cliState.config,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
      maxConcurrency: cliState.maxConcurrency,
    };
  });

  afterEach(() => {
    Object.assign(cliState, originalState);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server?.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
    restoreEnv?.();
  });

  it.each(cases)('$name', async ({ args, expected, configured = true, expectedTests = 2 }) => {
    const result = await handler(
      schema.parse({
        configPath: configured ? configuredPath : unfilteredPath,
        ...args,
        cache: false,
        write: false,
        share: false,
        maxConcurrency: 1,
      }),
    );
    const response = JSON.parse(result.content[0].text) as ToolResponse<EvaluationData>;
    const results = response.data?.results.results ?? [];
    const labels = [...new Set(results.map((row) => row.prompt.label))];
    expect(response.success, response.error).toBe(true);
    expect(result.isError).toBe(false);
    expect(labels).toEqual(expected);
    expect(response.data?.results.stats).toMatchObject({
      successes: expected.length * expectedTests,
      failures: 0,
      errors: 0,
    });
    expect(results).toHaveLength(expected.length * expectedTests);
  });

  it('preserves repeat and write:false for an explicit empty prompt filter', async () => {
    const result = await handler(
      schema.parse({
        configPath: configuredPath,
        promptFilter: '',
        repeat: 2,
        cache: false,
        write: false,
        share: false,
        maxConcurrency: 1,
      }),
    );
    const response = JSON.parse(result.content[0].text) as ToolResponse<EvaluationData>;
    expect(response.success, response.error).toBe(true);
    expect(result.isError).toBe(false);
    expect(response.data).toBeDefined();
    const data = response.data!;
    expect.soft(data.results.stats).toMatchObject({ successes: 12, failures: 0, errors: 0 });
    expect.soft(data.results.results).toHaveLength(12);
    expect(await Eval.findById(data.eval.id)).toBeUndefined();
  });
});
