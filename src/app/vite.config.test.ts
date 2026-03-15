import path from 'path';

import { describe, expect, it } from 'vitest';
import {
  browserModuleReplacements,
  browserModulesPlugin,
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
