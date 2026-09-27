import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Provider registry optional dependencies', () => {
  afterEach(() => {
    vi.doUnmock('@openai/agents');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('keeps the public entrypoint loadable when the Agents SDK is unavailable', async () => {
    vi.doMock('@openai/agents', () => {
      throw new Error('Cannot find package @openai/agents');
    });

    await expect(import('../../src/index')).resolves.toBeDefined();
  });

  it('explains how to install the OpenAI Agents SDK when that provider is requested', async () => {
    const { providerMap } = await import('../../src/providers/registry');
    const esm = await import('../../src/esm');
    vi.spyOn(esm, 'resolvePackageEntryPoint').mockReturnValue(null);
    const factory = providerMap.find((providerFactory) =>
      providerFactory.test('openai:agents:default-agent'),
    );

    expect(factory).toBeDefined();
    const createProviderPromise = factory!.create(
      'openai:agents:default-agent',
      {},
      { basePath: process.cwd() },
    );

    await expect(createProviderPromise).rejects.toThrow(
      'The @openai/agents package is required for OpenAI Agents providers.',
    );
    await expect(createProviderPromise).rejects.toThrow(
      'npm install promptfoo @openai/agents@^0.11.8',
    );
  });
});
