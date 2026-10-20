import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDirectory } from '../../../src/esm';
import { loadOpenAiAgentsModule } from '../../../src/providers/openai/agents-availability';

vi.mock('../../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/esm')>()),
  getDirectory: vi.fn(),
}));

describe('optional OpenAI Agents modules', () => {
  let directory: string;

  function installFixture(version?: unknown) {
    const sdkDirectory = path.join(directory, 'node_modules/@openai/agents');
    fs.mkdirSync(path.join(sdkDirectory, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(sdkDirectory, 'package.json'),
      JSON.stringify({
        name: '@openai/agents',
        version,
        exports: { '.': { import: './dist/index.mjs', require: './dist/index.cjs' } },
      }),
    );
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.mjs'), 'export {};');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.cjs'), 'module.exports = {};');
    return sdkDirectory;
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-agents-availability-'));
    vi.mocked(getDirectory).mockReturnValue(path.join(directory, 'dist/src'));
  });

  afterEach(() => {
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('explains co-installation before importing a module when the SDK is absent', async () => {
    const load = vi.fn();
    await expect(loadOpenAiAgentsModule(load)).rejects.toThrow(
      'npm install promptfoo @openai/agents@^0.14.1',
    );
    await expect(loadOpenAiAgentsModule(load)).rejects.toThrow(
      'npm install -g promptfoo @openai/agents@^0.14.1',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it.each(['0.11.8', '0.14.0', '0.15.0', '0.18.0', 'invalid', undefined])(
    'rejects unsupported SDK metadata %j before importing a module',
    async (version) => {
      installFixture(version);
      const load = vi.fn();
      await expect(loadOpenAiAgentsModule(load)).rejects.toThrow(
        `require @openai/agents@^0.14.1 (found ${version ?? 'unknown'})`,
      );
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('loads the module for a compatible SDK with restricted package metadata exports', async () => {
    installFixture('0.14.123');
    const module = { loadTools: vi.fn() };
    await expect(loadOpenAiAgentsModule(async () => module)).resolves.toBe(module);
  });

  it("checks Promptfoo's SDK instead of an unrelated current-directory installation", async () => {
    installFixture('0.14.123');
    const unrelatedDirectory = path.join(directory, 'another-project');
    const unrelatedSdk = path.join(unrelatedDirectory, 'node_modules/@openai/agents');
    fs.mkdirSync(unrelatedSdk, { recursive: true });
    fs.writeFileSync(
      path.join(unrelatedSdk, 'package.json'),
      JSON.stringify({ name: '@openai/agents', version: '0.18.0', main: './index.js' }),
    );
    fs.writeFileSync(path.join(unrelatedSdk, 'index.js'), 'module.exports = {};');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDirectory);
    try {
      await expect(loadOpenAiAgentsModule(async () => 'compatible')).resolves.toBe('compatible');
    } finally {
      cwd.mockRestore();
    }
  });

  it('preserves malformed metadata errors instead of reporting a missing SDK', async () => {
    const sdkDirectory = installFixture('0.14.123');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/package.json'), '{');
    await expect(loadOpenAiAgentsModule(vi.fn())).rejects.toThrow(SyntaxError);
  });

  it('explains an SDK that becomes unavailable while loading the feature module', async () => {
    installFixture('0.14.123');
    const error = Object.assign(new Error("Cannot find package '@openai/agents'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    await expect(
      loadOpenAiAgentsModule(async () => {
        throw error;
      }),
    ).rejects.toThrow('npm install promptfoo @openai/agents@^0.14.1');
  });

  it.each([
    new Error(
      "Cannot find package 'sdk-child' imported from /node_modules/@openai/agents/index.mjs",
    ),
    new Error('Invalid agent configuration'),
  ])('preserves other feature loading errors', async (error) => {
    installFixture('0.14.123');
    await expect(
      loadOpenAiAgentsModule(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
