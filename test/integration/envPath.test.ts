import fs from 'fs';
import * as path from 'path';
import { doEval } from '../../src/commands/eval';
import { setupEnv } from '../../src/util';

jest.mock('../../src/cache');
jest.mock('../../src/evaluator');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/migrate');
jest.mock('../../src/providers');
jest.mock('../../src/share');
jest.mock('../../src/table');
jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  setupEnv: jest.fn(),
}));

const mockSetupEnv = setupEnv as jest.MockedFunction<typeof setupEnv>;

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
    jest.clearAllMocks();
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
});
