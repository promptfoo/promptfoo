import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { registerValidatePromptfooConfigTool } from '../../src/commands/mcp/tools/validatePromptfooConfig';
import { doValidate } from '../../src/commands/validate';
import logger from '../../src/logger';
import { loadDefaultConfig } from '../../src/util/config/default';
import { resolveConfigs } from '../../src/util/config/load';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CommandLineOptions } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/util/config/default', () => ({ loadDefaultConfig: vi.fn() }));
vi.mock('../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn() },
}));

describe('validation with configured test filters', () => {
  let tempDir: string;
  let originalExitCode: typeof process.exitCode;
  let originalState: Pick<typeof cliState, 'config' | 'basePath' | 'selectedProviderConfigs'>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDefaultConfig)
      .mockReset()
      .mockResolvedValue({ defaultConfig: {}, defaultConfigPath: undefined });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-configured-filters-'));
    originalExitCode = process.exitCode;
    process.exitCode = 0;
    originalState = {
      config: cliState.config,
      basePath: cliState.basePath,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
    };
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    Object.assign(cliState, originalState);
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(commandLineOptions: Partial<CommandLineOptions>) {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        prompts: ['{{input}}'],
        providers: ['echo'],
        scenarios: [
          {
            config: [{}],
            tests: [
              { description: 'keep', vars: { input: 'one' } },
              { description: 'other', vars: { input: 'two' }, provider: 42 },
            ],
          },
        ],
        commandLineOptions,
      }),
    );
    return configPath;
  }

  describe.each([
    { name: 'count', configured: { filterFirstN: 1 } },
    { name: 'pattern', configured: { filterPattern: '^keep$' } },
  ])('$name selection', ({ configured }) => {
    it('validates excluded scenario tests in the CLI', async () => {
      await doValidate({ config: [writeConfig(configured)] }, {}, undefined);

      expect(process.exitCode).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation error'),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Configuration is valid'),
      );
    });

    it('validates excluded scenario tests in MCP', async () => {
      const tool = vi.fn();
      registerValidatePromptfooConfigTool({ tool } as unknown as McpServer);
      const [, , handler] = tool.mock.calls[0];

      const result = await handler({ configPaths: [writeConfig(configured)] });

      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        success: false,
        error: 'Configuration validation failed',
      });
    });

    it('preserves explicit scenario filtering for callers of resolveConfigs', async () => {
      const { testSuite } = await resolveConfigs(
        { config: [writeConfig(configured)], ...configured },
        {},
      );

      expect(testSuite.scenarios?.[0].tests.map((test) => test.description)).toEqual(['keep']);
    });
  });
});
