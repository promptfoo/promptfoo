const { resolveSdk, readVersion, sdkImported } = vi.hoisted(() => ({
  resolveSdk: vi.fn(),
  readVersion: vi.fn(),
  sdkImported: vi.fn(),
}));

vi.mock('node:module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:module')>()),
  createRequire: () => ({ resolve: resolveSdk }),
}));
vi.mock('../../src/util/packageVersion', () => ({ getPackageVersion: readVersion }));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Transformers SDK compatibility', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveSdk.mockReset();
    readVersion.mockReset();
    sdkImported.mockReset();
    resolveSdk.mockReturnValue(
      '/fixture/node_modules/@huggingface/transformers/dist/transformers.node.cjs',
    );
    readVersion.mockReturnValue('4.0.0');
    vi.doMock('@huggingface/transformers', () => {
      sdkImported();
      return { pipeline: vi.fn() };
    });
  });

  afterEach(() => {
    vi.doUnmock('@huggingface/transformers');
    vi.resetAllMocks();
  });

  it.each(['4.0.0', '4.3.0'])('loads compatible SDK %s', async (version) => {
    readVersion.mockReturnValue(version);
    const { loadTransformers } = await import('../../src/providers/transformersAvailability');
    expect((await loadTransformers()).pipeline).toBeTypeOf('function');
    expect(readVersion).toHaveBeenCalledWith(
      '@huggingface/transformers',
      '/fixture/node_modules/@huggingface/transformers/dist/transformers.node.cjs',
    );
    expect(sdkImported).toHaveBeenCalledOnce();
  });

  it.each(['3.8.1', '5.0.0', 'not-a-version', null])(
    'rejects unsupported SDK %s before importing it',
    async (version) => {
      readVersion.mockReturnValue(version);
      const { loadTransformers } = await import('../../src/providers/transformersAvailability');
      await expect(loadTransformers()).rejects.toThrow(`found ${version ?? 'unknown'}`);
      expect(sdkImported).not.toHaveBeenCalled();
    },
  );

  it('reports a compatible SDK that fails during import', async () => {
    vi.doMock('@huggingface/transformers', () => {
      throw new Error('native runtime unavailable');
    });
    const { loadTransformers } = await import('../../src/providers/transformersAvailability');
    await expect(loadTransformers()).rejects.toThrow('Transformers.js could not be loaded');
  });

  it('reports a missing SDK with the co-install command', async () => {
    resolveSdk.mockImplementation(() => {
      throw new Error('MODULE_NOT_FOUND');
    });
    const { loadTransformers } = await import('../../src/providers/transformersAvailability');
    await expect(loadTransformers()).rejects.toThrow(
      'npm install promptfoo @huggingface/transformers@^4.0.0',
    );
    expect(sdkImported).not.toHaveBeenCalled();
  });
});
