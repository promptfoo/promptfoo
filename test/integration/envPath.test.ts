import fs from 'fs';
import * as path from 'path';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from 'vitest';
import { doEval } from '../../src/commands/eval';
import { setupEnv } from '../../src/util/index';

vi.mock('../../src/cache');
vi.mock('../../src/evaluator');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
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
vi.mock('../../src/providers');
vi.mock('../../src/share');
vi.mock('../../src/table');
vi.mock('../../src/util/cloud', () => ({
  checkCloudPermissions: vi.fn().mockResolvedValue(undefined),
  getOrgContext: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/util', async () => {
  const actual = await vi.importActual('../../src/util');
  return {
    ...(actual as any),
    setupEnv: vi.fn(),
  };
});

const mockSetupEnv = setupEnv as MockedFunction<typeof setupEnv>;

describe('Integration: commandLineOptions.envPath', () => {
  let tempDir: string;
  let tempEnvFile: string;
  let tempConfigFile: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
    tempEnvFile = path.join(tempDir, '.env.test');
    tempConfigFile = path.join(tempDir, 'promptfooconfig.yaml');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

    try {
      await doEval(cmdObj, {}, undefined, {});
    } catch {
      // Expected to fail due to mocked dependencies
    }

    // Should call setupEnv twice: once for CLI (undefined), once for config
    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined); // Phase 1: CLI
    expect(mockSetupEnv).toHaveBeenNthCalledWith(2, tempEnvFile); // Phase 2: Config
  });

  it('should prioritize CLI envPath over config envPath', async () => {
    const cliEnvFile = path.join(tempDir, '.env.cli');
    fs.writeFileSync(cliEnvFile, 'CLI_VAR=from_cli');
    fs.writeFileSync(tempEnvFile, 'CONFIG_VAR=from_config');

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

    try {
      await doEval(cmdObj, {}, undefined, {});
    } catch {
      // Expected to fail due to mocked dependencies
    }

    // Should only call setupEnv once with CLI envPath (config envPath ignored)
    expect(mockSetupEnv).toHaveBeenCalledTimes(1);
    expect(mockSetupEnv).toHaveBeenCalledWith(cliEnvFile);
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

    try {
      await doEval(cmdObj, {}, undefined, {});
    } catch {
      // Expected to fail due to mocked dependencies
    }

    // Should only call setupEnv once with undefined (no config envPath)
    expect(mockSetupEnv).toHaveBeenCalledTimes(1);
    expect(mockSetupEnv).toHaveBeenCalledWith(undefined);
  });

  it('should handle multiple config files and use first envPath found', async () => {
    const config1File = path.join(tempDir, 'config1.yaml');
    const config2File = path.join(tempDir, 'config2.yaml');
    const _envFile1 = path.join(tempDir, '.env1');
    const envFile2 = path.join(tempDir, '.env2');

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

    try {
      await doEval(cmdObj, {}, undefined, {});
    } catch {
      // Expected to fail due to mocked dependencies
    }

    // Should call setupEnv twice: CLI + first envPath found (from config2)
    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(2, envFile2);
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

    try {
      await doEval({ config: [subConfig] }, {}, undefined, {});
    } catch {}

    expect(mockSetupEnv).toHaveBeenCalledTimes(2);
    expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined);
    // Expect absolute resolved path
    expect(path.isAbsolute((mockSetupEnv as any).mock.calls[1][0])).toBe(true);
    expect((mockSetupEnv as any).mock.calls[1][0]).toBe(relEnvAbs);
  });

  describe('multi-file envPath support', () => {
    it('should load multiple env files from config array', async () => {
      const envFile1 = path.join(tempDir, '.env');
      const envFile2 = path.join(tempDir, '.env.local');

      fs.writeFileSync(envFile1, 'BASE_VAR=base');
      fs.writeFileSync(envFile2, 'LOCAL_VAR=local');

      fs.writeFileSync(
        tempConfigFile,
        `
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

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      // Should call setupEnv twice: CLI (undefined), then config with array
      expect(mockSetupEnv).toHaveBeenCalledTimes(2);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(2, [envFile1, envFile2]);
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

      try {
        await doEval({ config: [subConfig] }, {}, undefined, {});
      } catch {}

      expect(mockSetupEnv).toHaveBeenCalledTimes(2);
      expect(mockSetupEnv).toHaveBeenNthCalledWith(1, undefined);
      // Should receive resolved absolute paths
      const envPathArg = (mockSetupEnv as any).mock.calls[1][0];
      expect(Array.isArray(envPathArg)).toBe(true);
      expect(envPathArg).toEqual([envFile1, envFile2]);
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

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {}

      // CLI envPath should be called once (no config envPath)
      expect(mockSetupEnv).toHaveBeenCalledTimes(1);
      expect(mockSetupEnv).toHaveBeenCalledWith([envFile1, envFile2]);
    });
  });
});
