import path from 'path';

import { describe, expect, it } from 'vitest';
import {
  assertDevApiPortsDoNotCollide,
  browserModuleReplacements,
  browserModulesPlugin,
  pointsAtDevUiPort,
  vendorCodeSplittingGroups,
} from './vite.shared';

const plugin = browserModulesPlugin();
const resolveId =
  typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler;

describe('browserModulesPlugin', () => {
  it('replaces logger imports with the browser logger', async () => {
    const loggerReplacement = browserModuleReplacements.find((replacement) =>
      replacement.browserPath.endsWith('logger.browser.ts'),
    );

    expect(loggerReplacement).toBeDefined();
    expect(resolveId).toBeDefined();

    const resolvedId = await resolveId?.(
      './logger',
      path.resolve(path.dirname(loggerReplacement!.nodePath), 'remoteScoring.ts'),
    );

    expect(resolvedId).toBe(loggerReplacement?.browserPath);
  });

  it('replaces createHash imports with the browser implementation', async () => {
    const createHashReplacement = browserModuleReplacements.find((replacement) =>
      replacement.browserPath.endsWith('createHash.browser.ts'),
    );

    expect(createHashReplacement).toBeDefined();
    expect(resolveId).toBeDefined();

    const resolvedId = await resolveId?.(
      './createHash',
      path.resolve(path.dirname(createHashReplacement!.nodePath), 'database.ts'),
    );

    expect(resolvedId).toBe(createHashReplacement?.browserPath);
  });

  it('ignores unrelated imports', async () => {
    expect(resolveId).toBeDefined();

    const resolvedId = await resolveId?.(
      './other-util',
      path.resolve(path.dirname(browserModuleReplacements[1].nodePath), 'database.ts'),
    );

    expect(resolvedId).toBeNull();
  });
});

describe('assertDevApiPortsDoNotCollide', () => {
  const base = {
    nodeEnv: 'development',
    apiPort: '18601',
    remoteApiBaseUrl: 'http://localhost:18601',
  };

  it('allows the default dev ports', () => {
    expect(() => assertDevApiPortsDoNotCollide(base)).not.toThrow();
  });

  it('rejects an API port equal to the dev UI port', () => {
    expect(() =>
      assertDevApiPortsDoNotCollide({
        ...base,
        apiPort: '15500',
        remoteApiBaseUrl: 'http://localhost:15500',
      }),
    ).toThrow(/collides with the dev UI port/);
  });

  it('rejects a remote API base URL that resolves to the dev UI port', () => {
    for (const remoteApiBaseUrl of [
      'http://localhost:15500',
      'http://127.0.0.1:15500',
      'http://[::1]:15500',
    ]) {
      expect(() => assertDevApiPortsDoNotCollide({ ...base, remoteApiBaseUrl })).toThrow(
        /resolves to the dev UI port/,
      );
    }
  });

  it('does not enforce outside development', () => {
    expect(() =>
      assertDevApiPortsDoNotCollide({
        nodeEnv: 'production',
        apiPort: '15500',
        remoteApiBaseUrl: 'http://localhost:15500',
      }),
    ).not.toThrow();
  });

  it('ignores non-UI ports and unparseable URLs', () => {
    expect(pointsAtDevUiPort('http://localhost:18601')).toBe(false);
    expect(pointsAtDevUiPort('https://api.example.com')).toBe(false);
    expect(pointsAtDevUiPort('')).toBe(false);
    expect(pointsAtDevUiPort('not a url')).toBe(false);
  });
});

describe('vendorCodeSplittingGroups', () => {
  it('uses stable vendor chunk groups for supported heavy dependencies', () => {
    expect(vendorCodeSplittingGroups.map((group) => group.name)).toEqual([
      'vendor-react',
      'vendor-charts',
      'vendor-markdown',
      'vendor-utils',
    ]);
  });

  it('does not isolate prismjs into its own chunk', () => {
    expect(
      vendorCodeSplittingGroups.some((group) => group.test.test('/node_modules/prismjs/prism.js')),
    ).toBe(false);
  });
});
