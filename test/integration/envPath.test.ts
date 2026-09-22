import fs from 'fs';
import os from 'os';
import * as path from 'path';

import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { doEval } from '../../src/node/doEval';
import { setupEnv as loadEnvFile } from '../../src/util/env';
import { setupEnv } from '../../src/util/index';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache');
vi.mock('../../src/evaluator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/evaluator')>()),
  evaluate: vi.fn(),
}));
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: () => false,
  },
}));
vi.mock('../../src/migrate');
vi.mock('../../src/models/eval', () => {
  const MockEval = function (this: any) {
    this.id = 'test-eval-id';
    this.prompts = [];
    this.clearResults = vi.fn();
    this.shared = false;
    this.getTable = vi.fn().mockResolvedValue({ body: [] });
  };
  MockEval.create = vi.fn().mockResolvedValue({
    id: 'test-eval-id',
    prompts: [],
    clearResults: vi.fn(),
    shared: false,
    getTable: vi.fn().mockResolvedValue({ body: [] }),
  });
  MockEval.latest = vi.fn().mockResolvedValue(null);
  MockEval.findById = vi.fn().mockResolvedValue(null);
  return { default: MockEval };
});
vi.mock('../../src/share');
vi.mock('../../src/table');
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));
vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/cloud')>()),
  checkCloudPermissions: async () => undefined,
  getOrgContext: async () => null,
}));
vi.mock('../../src/util', async () => {
  const actual = await vi.importActual('../../src/util');
  return {
    ...(actual as any),
    setupEnv: vi.fn(),
  };
});

const mockSetupEnv = setupEnv as MockedFunction<typeof setupEnv>;
const dedentYaml = dedent.withOptions({ escapeSpecialCharacters: false });

describe('Integration: commandLineOptions.envPath', () => {
  let tempDir: string;
  let tempEnvFile: string;
  let tempConfigFile: string;
  let restoreEnv: () => void;
  const evaluationReached = new Error('Environment loading reached evaluation');
  const scopedOptions = expect.objectContaining({ processEnv: expect.any(Object) });
  const scopedEnvironment = () => mockSetupEnv.mock.calls.at(-1)?.[1]?.processEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-path-'));
    tempEnvFile = path.join(tempDir, '.env.test');
    tempConfigFile = path.join(tempDir, 'promptfooconfig.yaml');
    restoreEnv = mockProcessEnv({
      TEST_VAR: undefined,
      CLI_VAR: undefined,
      CONFIG_VAR: undefined,
      REL: undefined,
      BASE_VAR: undefined,
      LOCAL_VAR: undefined,
      VAR1: undefined,
      VAR2: undefined,
      CLI_VAR1: undefined,
      CLI_VAR2: undefined,
      CONFIG_VAR1: undefined,
      CONFIG_VAR2: undefined,
      ENVPATH_PRECEDENCE: undefined,
    });
    mockSetupEnv.mockImplementation((envPath, options) => {
      // Exercise configured files without loading the checkout's default .env.
      if (envPath && (!Array.isArray(envPath) || envPath.length > 0)) {
        loadEnvFile(envPath, options);
      }
    });
    vi.mocked(evaluate).mockRejectedValue(evaluationReached);
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('should load environment from config-specified envPath', async () => {
    // Create test .env file
    fs.writeFileSync(tempEnvFile, 'TEST_VAR=from_config_env');

    // Create config with commandLineOptions.envPath
    fs.writeFileSync(
      tempConfigFile,
      `
commandLineOptions:
  envPath: ${tempEnvFile}

prompts:
  - "Test prompt"

providers:
  - echo

tests:
  - vars:
      input: "test"
`,
    );

    const cmdObj = { config: [tempConfigFile] };

    await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined, scopedOptions);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(2, tempEnvFile, scopedOptions);
    expect(mockSetupEnv.mock.calls[1][1]?.processEnv).toBe(
      mockSetupEnv.mock.calls[0][1]?.processEnv,
    );
    expect(scopedEnvironment()).toMatchObject({ TEST_VAR: 'from_config_env' });
    expect(process.env.TEST_VAR).toBeUndefined();
  });

  it('should prioritize CLI envPath over config envPath', async () => {
    const cliEnvFile = path.join(tempDir, '.env.cli');
    fs.writeFileSync(cliEnvFile, 'CLI_VAR=from_cli\nENVPATH_PRECEDENCE=cli');
    fs.writeFileSync(tempEnvFile, 'CONFIG_VAR=from_config\nENVPATH_PRECEDENCE=config');

    fs.writeFileSync(
      tempConfigFile,
      `
commandLineOptions:
  envPath: ${tempEnvFile}

prompts:
  - "Test prompt"

providers:
  - echo

tests:
  - vars:
      input: "test"
`,
    );

    const cmdObj = {
      config: [tempConfigFile],
      envPath: cliEnvFile,
    };

    await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

    expect(mockSetupEnv).toHaveBeenCalledTimes(1);
    expect(mockSetupEnv).toHaveBeenCalledWith(cliEnvFile, scopedOptions);
    expect(scopedEnvironment()).toMatchObject({ CLI_VAR: 'from_cli', ENVPATH_PRECEDENCE: 'cli' });
    expect(scopedEnvironment()).not.toHaveProperty('CONFIG_VAR');
    expect(process.env.CLI_VAR).toBeUndefined();
  });

  it('should handle missing commandLineOptions section gracefully', async () => {
    fs.writeFileSync(
      tempConfigFile,
      `
prompts:
  - "Test prompt"

providers:
  - echo

tests:
  - vars:
      input: "test"
`,
    );

    const cmdObj = { config: [tempConfigFile] };

    await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

    expect(mockSetupEnv).toHaveBeenCalledTimes(1);
    expect(mockSetupEnv).toHaveBeenCalledWith(undefined, { processEnv: {} });
    expect(process.env.TEST_VAR).toBeUndefined();
  });

  it('should handle multiple config files and use first envPath found', async () => {
    const config1File = path.join(tempDir, 'config1.yaml');
    const config2File = path.join(tempDir, 'config2.yaml');
    const envFile2 = path.join(tempDir, '.env2');
    fs.writeFileSync(envFile2, 'TEST_VAR=from_second_config');

    fs.writeFileSync(
      config1File,
      `
prompts:
  - "From config 1"
`,
    );

    fs.writeFileSync(
      config2File,
      `
commandLineOptions:
  envPath: ${envFile2}

prompts:
  - "From config 2"

providers:
  - echo

tests:
  - vars:
      input: "test"
`,
    );

    const cmdObj = { config: [config1File, config2File] };

    await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined, scopedOptions);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(2, envFile2, scopedOptions);
    expect(scopedEnvironment()).toMatchObject({ TEST_VAR: 'from_second_config' });
  });

  it('should resolve relative envPath against the config file directory', async () => {
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    const relEnv = '.env.relative';
    const relEnvAbs = path.join(subDir, relEnv);
    fs.writeFileSync(relEnvAbs, 'REL=ok');

    const subConfig = path.join(subDir, 'promptfooconfig.yaml');
    fs.writeFileSync(
      subConfig,
      `
commandLineOptions:
  envPath: ${relEnv}

prompts:
  - "From sub config"
providers:
  - echo
tests:
  - vars: { input: "t" }
`,
    );

    await expect(doEval({ config: [subConfig] }, {}, undefined, {})).rejects.toBe(
      evaluationReached,
    );

    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined, scopedOptions);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(2, relEnvAbs, scopedOptions);
    expect(scopedEnvironment()).toMatchObject({ REL: 'ok' });
  });

  describe('multi-file envPath support', () => {
    it('should load multiple env files from config array', async () => {
      const envFile1 = path.join(tempDir, '.env');
      const envFile2 = path.join(tempDir, '.env.local');

      fs.writeFileSync(envFile1, 'BASE_VAR=base\nENVPATH_PRECEDENCE=base');
      fs.writeFileSync(envFile2, 'LOCAL_VAR=local\nENVPATH_PRECEDENCE=local');

      fs.writeFileSync(
        tempConfigFile,
        dedentYaml`
          commandLineOptions:
            envPath:
              - ${envFile1}
              - ${envFile2}

          prompts:
            - "Test prompt"

          providers:
            - echo

          tests:
            - vars:
                input: "test"
        `,
      );

      const cmdObj = { config: [tempConfigFile] };

      await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

      expect(mockSetupEnv).toHaveBeenCalledTimes(2);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined, scopedOptions);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(2, [envFile1, envFile2], scopedOptions);
      expect(scopedEnvironment()).toMatchObject({
        BASE_VAR: 'base',
        LOCAL_VAR: 'local',
        ENVPATH_PRECEDENCE: 'local',
      });
    });

    it('should resolve relative paths in envPath array against config directory', async () => {
      const subDir = path.join(tempDir, 'nested');
      fs.mkdirSync(subDir);

      const envFile1 = path.join(subDir, '.env');
      const envFile2 = path.join(subDir, '.env.local');

      fs.writeFileSync(envFile1, 'VAR1=val1');
      fs.writeFileSync(envFile2, 'VAR2=val2');

      const subConfig = path.join(subDir, 'promptfooconfig.yaml');
      fs.writeFileSync(
        subConfig,
        `
commandLineOptions:
  envPath:
    - .env
    - .env.local

prompts:
  - "Test"
providers:
  - echo
tests:
  - vars: { input: "t" }
`,
      );

      await expect(doEval({ config: [subConfig] }, {}, undefined, {})).rejects.toBe(
        evaluationReached,
      );

      expect(mockSetupEnv).toHaveBeenCalledTimes(2);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined, scopedOptions);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(2, [envFile1, envFile2], scopedOptions);
      expect(scopedEnvironment()).toMatchObject({ VAR1: 'val1', VAR2: 'val2' });
    });

    it('should pass CLI envPath array when provided', async () => {
      const envFile1 = path.join(tempDir, '.env.cli1');
      const envFile2 = path.join(tempDir, '.env.cli2');

      fs.writeFileSync(envFile1, 'CLI_VAR1=cli1');
      fs.writeFileSync(envFile2, 'CLI_VAR2=cli2');

      fs.writeFileSync(
        tempConfigFile,
        `
prompts:
  - "Test prompt"
providers:
  - echo
tests:
  - vars:
      input: "test"
`,
      );

      const cmdObj = {
        config: [tempConfigFile],
        envPath: [envFile1, envFile2],
      };

      await expect(doEval(cmdObj, {}, undefined, {})).rejects.toBe(evaluationReached);

      expect(mockSetupEnv).toHaveBeenCalledTimes(1);
      expect(mockSetupEnv).toHaveBeenCalledWith([envFile1, envFile2], scopedOptions);
      expect(scopedEnvironment()).toMatchObject({ CLI_VAR1: 'cli1', CLI_VAR2: 'cli2' });
    });

    it('should load config envPath when CLI envPath defaults to an empty array', async () => {
      const envFile1 = path.join(tempDir, '.env.empty-cli1');
      const envFile2 = path.join(tempDir, '.env.empty-cli2');

      fs.writeFileSync(envFile1, 'CONFIG_VAR1=config1');
      fs.writeFileSync(envFile2, 'CONFIG_VAR2=config2');

      fs.writeFileSync(
        tempConfigFile,
        dedentYaml`
          commandLineOptions:
            envPath:
              - ${envFile1}
              - ${envFile2}

          prompts:
            - "Test prompt"

          providers:
            - echo

          tests:
            - vars:
                input: "test"
        `,
      );

      await expect(
        doEval({ config: [tempConfigFile], envPath: [] }, {}, undefined, {}),
      ).rejects.toBe(evaluationReached);

      expect(mockSetupEnv).toHaveBeenCalledTimes(2);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(1, [], scopedOptions);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(2, [envFile1, envFile2], scopedOptions);
      expect(scopedEnvironment()).toMatchObject({ CONFIG_VAR1: 'config1', CONFIG_VAR2: 'config2' });
    });
  });
});
