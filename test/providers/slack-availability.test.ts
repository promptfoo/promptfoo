import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDirectory } from '../../src/esm';
import { loadSlackProviderModule } from '../../src/providers/slack-availability';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  getDirectory: vi.fn(),
}));

describe('optional Slack provider module', () => {
  let directory: string;

  function installFixture(version?: unknown) {
    const sdkDirectory = path.join(directory, 'node_modules/@slack/web-api');
    fs.mkdirSync(path.join(sdkDirectory, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(sdkDirectory, 'package.json'),
      JSON.stringify({
        name: '@slack/web-api',
        version,
        exports: { '.': { import: './dist/index.mjs', require: './dist/index.cjs' } },
      }),
    );
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.mjs'), 'export {};');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.cjs'), 'module.exports = {};');
    return sdkDirectory;
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-slack-availability-'));
    vi.mocked(getDirectory).mockReturnValue(path.join(directory, 'dist/src'));
  });

  afterEach(() => {
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('explains co-installation before loading the provider when the SDK is absent', async () => {
    const load = vi.fn();
    await expect(loadSlackProviderModule(load)).rejects.toThrow(
      'npm install promptfoo @slack/web-api@^8.1.1',
    );
    await expect(loadSlackProviderModule(load)).rejects.toThrow(
      'npm install -g promptfoo @slack/web-api@^8.1.1',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it.each(['7.13.0', '8.1.0', '9.0.0', 'invalid', undefined])(
    'rejects unsupported SDK metadata %j before loading the provider',
    async (version) => {
      installFixture(version);
      const load = vi.fn();
      await expect(loadSlackProviderModule(load)).rejects.toThrow(
        `requires @slack/web-api@^8.1.1 (found ${version ?? 'unknown'})`,
      );
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('loads a compatible SDK with restricted package metadata exports', async () => {
    installFixture('8.1.123');
    const module = { SlackProvider: vi.fn() };
    await expect(loadSlackProviderModule(async () => module)).resolves.toBe(module);
  });

  it("checks Promptfoo's SDK rather than an unrelated current-directory installation", async () => {
    installFixture('8.1.123');
    const unrelatedDirectory = path.join(directory, 'another-project');
    const unrelatedSdk = path.join(unrelatedDirectory, 'node_modules/@slack/web-api');
    fs.mkdirSync(unrelatedSdk, { recursive: true });
    fs.writeFileSync(
      path.join(unrelatedSdk, 'package.json'),
      JSON.stringify({ name: '@slack/web-api', version: '7.13.0', main: './index.js' }),
    );
    fs.writeFileSync(path.join(unrelatedSdk, 'index.js'), 'module.exports = {};');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDirectory);
    try {
      await expect(loadSlackProviderModule(async () => 'compatible')).resolves.toBe('compatible');
    } finally {
      cwd.mockRestore();
    }
  });

  it('preserves malformed metadata errors instead of reporting a missing SDK', async () => {
    const sdkDirectory = installFixture('8.1.123');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/package.json'), '{');
    await expect(loadSlackProviderModule(vi.fn())).rejects.toThrow(SyntaxError);
  });

  it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
    'explains an SDK that becomes unavailable during loading (%s)',
    async (code) => {
      installFixture('8.1.123');
      const error = Object.assign(new Error("Cannot find package '@slack/web-api'"), { code });
      await expect(
        loadSlackProviderModule(async () => {
          throw error;
        }),
      ).rejects.toThrow('npm install promptfoo @slack/web-api@^8.1.1');
    },
  );

  it.each([
    Object.assign(
      new Error(
        "Cannot find package 'sdk-child' imported from /node_modules/@slack/web-api/index.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    ),
    new Error('Invalid Slack configuration'),
  ])('preserves other provider loading errors', async (error) => {
    installFixture('8.1.123');
    await expect(
      loadSlackProviderModule(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
