import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDirectory } from '../../src/esm';
import { loadLangfuseClient } from '../../src/integrations/langfuse-availability';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  getDirectory: vi.fn(),
}));

describe('optional Langfuse client module', () => {
  let directory: string;

  function installFixture(version?: unknown) {
    const sdkDirectory = path.join(directory, 'node_modules/@langfuse/client');
    fs.mkdirSync(path.join(sdkDirectory, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(sdkDirectory, 'package.json'),
      JSON.stringify({
        name: '@langfuse/client',
        version,
        exports: { '.': { import: './dist/index.mjs', require: './dist/index.cjs' } },
      }),
    );
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.mjs'), 'export {};');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/index.cjs'), 'module.exports = {};');
    return sdkDirectory;
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-langfuse-availability-'));
    vi.mocked(getDirectory).mockReturnValue(path.join(directory, 'dist/src'));
  });

  afterEach(() => {
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('explains co-installation before loading the client when the SDK is absent', async () => {
    const load = vi.fn();
    await expect(loadLangfuseClient(load)).rejects.toThrow(
      'npm install promptfoo @langfuse/client@^5.11.1',
    );
    await expect(loadLangfuseClient(load)).rejects.toThrow(
      'npm install -g promptfoo @langfuse/client@^5.11.1',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it.each(['4.99.0', '5.11.0', '6.0.0', 'invalid', undefined])(
    'rejects unsupported SDK metadata %j before loading the client',
    async (version) => {
      installFixture(version);
      const load = vi.fn();
      await expect(loadLangfuseClient(load)).rejects.toThrow(
        `requires @langfuse/client@^5.11.1 (found ${version ?? 'unknown'})`,
      );
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('loads a compatible SDK with restricted package metadata exports', async () => {
    installFixture('5.11.123');
    const module = { LangfuseClient: vi.fn() };
    await expect(loadLangfuseClient(async () => module)).resolves.toBe(module);
  });

  it("checks Promptfoo's SDK rather than an unrelated current-directory installation", async () => {
    installFixture('5.11.123');
    const unrelatedDirectory = path.join(directory, 'another-project');
    const unrelatedSdk = path.join(unrelatedDirectory, 'node_modules/@langfuse/client');
    fs.mkdirSync(unrelatedSdk, { recursive: true });
    fs.writeFileSync(
      path.join(unrelatedSdk, 'package.json'),
      JSON.stringify({ name: '@langfuse/client', version: '4.99.0', main: './index.js' }),
    );
    fs.writeFileSync(path.join(unrelatedSdk, 'index.js'), 'module.exports = {};');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDirectory);
    try {
      await expect(loadLangfuseClient(async () => 'compatible')).resolves.toBe('compatible');
    } finally {
      cwd.mockRestore();
    }
  });

  it('preserves malformed metadata errors instead of reporting a missing SDK', async () => {
    const sdkDirectory = installFixture('5.11.123');
    fs.writeFileSync(path.join(sdkDirectory, 'dist/package.json'), '{');
    await expect(loadLangfuseClient(vi.fn())).rejects.toThrow(SyntaxError);
  });

  it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
    'explains an SDK that becomes unavailable during loading (%s)',
    async (code) => {
      installFixture('5.11.123');
      const error = Object.assign(new Error("Cannot find package '@langfuse/client'"), { code });
      await expect(
        loadLangfuseClient(async () => {
          throw error;
        }),
      ).rejects.toThrow('npm install promptfoo @langfuse/client@^5.11.1');
    },
  );

  it.each([
    Object.assign(
      new Error(
        "Cannot find package 'sdk-child' imported from /node_modules/@langfuse/client/index.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    ),
    new Error('Invalid Langfuse configuration'),
  ])('preserves other client loading errors', async (error) => {
    installFixture('5.11.123');
    await expect(
      loadLangfuseClient(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
