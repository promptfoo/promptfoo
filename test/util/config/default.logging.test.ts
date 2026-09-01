import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogLevel, globalLogCallback, setLogCallback, setLogLevel } from '../../../src/logger';
import { clearConfigCache, loadDefaultConfig } from '../../../src/util/config/default';

// Exercise the real filesystem, module loader, and logger callback together.
describe('default config discovery logging', () => {
  let tempDir: string;
  let previousLogLevel: ReturnType<typeof getLogLevel>;
  let previousLogCallback: typeof globalLogCallback;
  const logCallback = vi.fn();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-config-logging-'));
    previousLogLevel = getLogLevel();
    previousLogCallback = globalLogCallback;
    logCallback.mockReset();
    clearConfigCache();
    setLogCallback(logCallback);
  });

  afterEach(() => {
    setLogCallback(previousLogCallback);
    setLogLevel(previousLogLevel);
    clearConfigCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each(['info', 'debug'] as const)(
    'does not report missing optional configs as failures at %s level',
    async (level) => {
      setLogLevel(level);

      await expect(loadDefaultConfig(tempDir)).resolves.toEqual({
        defaultConfig: {},
        defaultConfigPath: undefined,
      });

      if (level === 'info') {
        expect(logCallback).not.toHaveBeenCalled();
      } else {
        for (const extension of ['cjs', 'cts', 'js', 'mjs', 'mts', 'ts']) {
          expect(logCallback).toHaveBeenCalledWith(
            expect.stringContaining(`promptfooconfig.${extension}`),
          );
        }
        expect(logCallback).not.toHaveBeenCalledWith(
          expect.stringMatching(
            /ERR_MODULE_NOT_FOUND|Cannot find module|ESM import failed|\n\s+at /,
          ),
        );
      }
    },
  );

  it.each([
    { extension: 'mjs', source: "export default { prompts: ['hello'], providers: ['echo'] };" },
    { extension: 'cjs', source: "module.exports = { prompts: ['hello'], providers: ['echo'] };" },
    { extension: 'js', source: "module.exports = { prompts: ['hello'], providers: ['echo'] };" },
  ])('loads an existing .$extension config at debug level', async ({ extension, source }) => {
    // Native Node loads this CommonJS .js config via the fallback in an ESM package.
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}');
    const configPath = path.join(tempDir, `promptfooconfig.${extension}`);
    fs.writeFileSync(configPath, source);
    setLogLevel('debug');

    await expect(loadDefaultConfig(tempDir)).resolves.toEqual({
      defaultConfig: { prompts: ['hello'], providers: ['echo'] },
      defaultConfigPath: configPath,
    });
    expect(logCallback).not.toHaveBeenCalledWith(
      expect.stringMatching(/ERR_MODULE_NOT_FOUND|Cannot find module|\n\s+at /),
    );
  });

  describe.each(['info', 'debug'] as const)('real import failures at %s level', (level) => {
    it.each([
      {
        name: 'missing dependency',
        source: "import './missing-dependency.mjs';",
        error: { code: 'ERR_MODULE_NOT_FOUND' },
      },
      {
        name: 'invalid syntax',
        source: 'export default {;',
        // Vite reports parse failures as Error rather than Node's SyntaxError.
        error: { message: expect.stringMatching(/syntax|Unexpected token/i) },
      },
      {
        name: 'runtime failure',
        source: "throw new Error('config initialization failed');",
        error: { message: 'config initialization failed' },
      },
    ])('reports $name instead of ignoring the config', async ({ source, error }) => {
      fs.writeFileSync(path.join(tempDir, 'promptfooconfig.mjs'), source);
      setLogLevel(level);

      const thrown = await loadDefaultConfig(tempDir).catch((err) => err);
      expect(thrown).toMatchObject(error);
      expect(logCallback).toHaveBeenCalledWith(`ESM import failed: ${thrown}`);
      if (level === 'debug') {
        expect(logCallback).toHaveBeenCalledWith(thrown.stack);
      }
    });
  });
});
