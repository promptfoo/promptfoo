import fs from 'fs';
import * as path from 'path';

import dedent from 'dedent';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { doEval } from '../../src/node/doEval';
import { loadApiProviders } from '../../src/providers/index';
import { loadDefaultConfig } from '../../src/util/config/default';
import { resolveConfigs } from '../../src/util/config/load';
import { setExplicitCliEnvPath, setupEnv } from '../../src/util/env';

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
vi.unmock('../../src/util/envFile');
vi.mock('../../src/util/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/util/env')>();
  return { ...actual, setupEnv: vi.fn(actual.setupEnv) };
});

const mockSetupEnv = vi.mocked(setupEnv);

function expectExplicitEnvPath(expected: string | string[], vars: NodeJS.ProcessEnv = {}) {
  const calls = mockSetupEnv.mock.calls.filter(([file]) =>
    Array.isArray(file) ? file.length > 0 : Boolean(file),
  );
  expect(calls.length).toBeGreaterThan(0);
  for (const [file, options] of calls) {
    expect(file).toEqual(expected);
    expect(options?.processEnv).toEqual(expect.objectContaining(vars));
  }
}

const dedentYaml = dedent.withOptions({ escapeSpecialCharacters: false });

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

  afterEach(() => {
    vi.unstubAllEnvs();
    setExplicitCliEnvPath(undefined);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // The evaluator always receives a provider list; the automock would return undefined.
    vi.mocked(loadApiProviders).mockResolvedValue([]);
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

    expectExplicitEnvPath(tempEnvFile, { TEST_VAR: 'from_config_env' });
  });

  it('should recheck unknown config keys after loading a config-specified envPath', async () => {
    fs.writeFileSync(tempEnvFile, 'PROMPTFOO_STRICT_CONFIG=true');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        commandLineOptions:
          envPath: ${tempEnvFile}
        prompts:
          - hello
        providers:
          - echo
        defaultTest:
          assert:
            - type: contains
              value: hello
        assert:
          - type: contains
            value: hello
        tests:
          - vars:
              case: env-path
      `,
    );

    await expect(doEval({ config: [tempConfigFile] }, {}, undefined, {})).rejects.toThrow(
      /Unknown top-level config key\(s\) "assert"/,
    );
  });

  it('should let a config-specified envPath disable ambient strict key validation', async () => {
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'true');
    fs.writeFileSync(tempEnvFile, 'PROMPTFOO_STRICT_CONFIG=false');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        commandLineOptions:
          envPath: ${tempEnvFile}
        prompts:
          - hello
        providers:
          - echo
        defaultTest:
          assert:
            - type: contains
              value: hello
        assert:
          - type: contains
            value: hello
        tests:
          - vars:
              case: env-path-opt-out
      `,
    );

    let thrown: unknown;
    try {
      await doEval({ config: [tempConfigFile] }, {}, undefined, {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown instanceof Error ? thrown.message : '').not.toMatch(
      /Unknown top-level config key/,
    );
    expectExplicitEnvPath(tempEnvFile, { PROMPTFOO_STRICT_CONFIG: 'false' });
    expect(process.env.PROMPTFOO_STRICT_CONFIG).toBe('true');
  });

  it('should honor config-specified strictness on fresh and cached default-config reads', async () => {
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'true');
    vi.stubEnv('PR9449_SENTINEL', 'ambient');
    fs.writeFileSync(tempEnvFile, 'PROMPTFOO_STRICT_CONFIG=false\nPR9449_SENTINEL=from-config');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        commandLineOptions:
          envPath: ${tempEnvFile}
        prompts:
          - hello
        providers:
          - echo
        assert:
          - type: contains
            value: hello
        tests:
          - vars:
              case: default-config-env-path
      `,
    );

    await expect(loadDefaultConfig(tempDir)).resolves.toMatchObject({
      defaultConfigPath: tempConfigFile,
    });
    await expect(loadDefaultConfig(tempDir)).resolves.toMatchObject({
      defaultConfigPath: tempConfigFile,
    });

    expectExplicitEnvPath(tempEnvFile, {
      PROMPTFOO_STRICT_CONFIG: 'false',
      PR9449_SENTINEL: 'from-config',
    });
    expect(process.env.PROMPTFOO_STRICT_CONFIG).toBe('true');
    expect(process.env.PR9449_SENTINEL).toBe('ambient');
  });

  it('resolves the diagnostics env file against the normalized config basePath', async () => {
    const inputs = path.join(tempDir, 'inputs');
    fs.mkdirSync(inputs);
    fs.writeFileSync(path.join(tempDir, 'settings.env'), 'PROMPTFOO_STRICT_CONFIG=false');
    fs.writeFileSync(path.join(inputs, 'settings.env'), 'PROMPTFOO_STRICT_CONFIG=true');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        basePath: inputs
        commandLineOptions:
          envPath: settings.env
        prompts: [hello]
        providers: [echo]
        typoField: true
      `,
    );

    await expect(loadDefaultConfig(tempDir)).rejects.toThrow(
      /Unknown top-level config key.*typoField/,
    );
  });

  it('should preserve explicit CLI env precedence on fresh and cached default-config reads', async () => {
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'false');
    vi.stubEnv('PR9449_SENTINEL', 'from-cli');
    const cliEnvFile = path.join(tempDir, '.env.explicit');
    fs.writeFileSync(cliEnvFile, 'PROMPTFOO_STRICT_CONFIG=false\nPR9449_SENTINEL=from-cli');
    setExplicitCliEnvPath([cliEnvFile]);
    fs.writeFileSync(tempEnvFile, 'PROMPTFOO_STRICT_CONFIG=true\nPR9449_SENTINEL=from-config');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        commandLineOptions:
          envPath: ${tempEnvFile}
        prompts:
          - hello
        providers:
          - echo
        outptPath: ignored.json
        tests:
          - vars:
              case: explicit-cli-precedence
      `,
    );

    await expect(loadDefaultConfig(tempDir)).resolves.toMatchObject({
      defaultConfigPath: tempConfigFile,
    });
    await expect(loadDefaultConfig(tempDir)).resolves.toMatchObject({
      defaultConfigPath: tempConfigFile,
    });

    expectExplicitEnvPath([cliEnvFile], {
      PROMPTFOO_STRICT_CONFIG: 'false',
      PR9449_SENTINEL: 'from-cli',
    });
    expect(process.env.PROMPTFOO_STRICT_CONFIG).toBe('false');
    expect(process.env.PR9449_SENTINEL).toBe('from-cli');
  });

  it('should not leak config-specified strictness into later resolutions', async () => {
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'true');
    fs.writeFileSync(tempEnvFile, 'PROMPTFOO_STRICT_CONFIG=false');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        commandLineOptions:
          envPath: ${tempEnvFile}
        prompts:
          - hello
        providers:
          - echo
        tests:
          - assert:
              - type: contains
                value: hello
      `,
    );

    const firstResolution = await resolveConfigs({ config: [tempConfigFile] }, {});
    expect(firstResolution.strictConfigEnabled).toBe(false);
    expect(process.env.PROMPTFOO_STRICT_CONFIG).toBe('true');

    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        prompts:
          - hello
        providers:
          - echo
        tests:
          - assert:
              - type: contains
                value: hello
      `,
    );
    const secondResolution = await resolveConfigs({ config: [tempConfigFile] }, {});
    expect(secondResolution.strictConfigEnabled).toBe(true);
    expect(process.env.PROMPTFOO_STRICT_CONFIG).toBe('true');
  });

  it('should retain diagnostics for an auto-discovered cached default config', async () => {
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'false');
    fs.writeFileSync(
      tempConfigFile,
      dedentYaml`
        prompts:
          - hello
        providers:
          - echo
        defaultTest:
          assert:
            - type: contains
              value: hello
        assert:
          - type: contains
            value: hello
        tests:
          - vars:
              case: default-config
      `,
    );
    const { defaultConfig, defaultConfigPath } = await loadDefaultConfig(tempDir);
    vi.stubEnv('PROMPTFOO_STRICT_CONFIG', 'true');

    await expect(doEval({}, defaultConfig, defaultConfigPath, {})).rejects.toThrow(
      /Unknown top-level config key\(s\) "assert"/,
    );
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

    expectExplicitEnvPath(cliEnvFile, { CLI_VAR: 'from_cli' });
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
    expect(mockSetupEnv).toHaveBeenCalledWith(undefined, { processEnv: {} });
  });

  it('should handle multiple config files and use first envPath found', async () => {
    const config1File = path.join(tempDir, 'config1.yaml');
    const config2File = path.join(tempDir, 'config2.yaml');
    const envFile2 = path.join(tempDir, '.env2');
    fs.writeFileSync(envFile2, 'CONFIG_VAR=from_config');

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

    expectExplicitEnvPath(envFile2, { CONFIG_VAR: 'from_config' });
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

    expectExplicitEnvPath(relEnvAbs, { REL: 'ok' });
  });

  describe('multi-file envPath support', () => {
    it('should load multiple env files from config array', async () => {
      const envFile1 = path.join(tempDir, '.env');
      const envFile2 = path.join(tempDir, '.env.local');

      fs.writeFileSync(envFile1, 'BASE_VAR=base');
      fs.writeFileSync(envFile2, 'LOCAL_VAR=local');

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

      try {
        await doEval(cmdObj, {}, undefined, {});
      } catch {
        // Expected to fail due to mocked dependencies
      }

      expectExplicitEnvPath([envFile1, envFile2], { BASE_VAR: 'base', LOCAL_VAR: 'local' });
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

      expectExplicitEnvPath([envFile1, envFile2], { VAR1: 'val1', VAR2: 'val2' });
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

      expectExplicitEnvPath([envFile1, envFile2], { CLI_VAR1: 'cli1', CLI_VAR2: 'cli2' });
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

      try {
        await doEval({ config: [tempConfigFile], envPath: [] }, {}, undefined, {});
      } catch {}

      expectExplicitEnvPath([envFile1, envFile2], {
        CONFIG_VAR1: 'config1',
        CONFIG_VAR2: 'config2',
      });
    });
  });
});
