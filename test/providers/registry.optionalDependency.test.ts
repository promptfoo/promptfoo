import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Provider registry optional dependencies', () => {
  afterEach(() => {
    vi.doUnmock('../../src/providers/openai/agents');
    vi.doUnmock('@openai/agents');
    vi.resetModules();
  });

  it('keeps the public entrypoint loadable when the Agents SDK is unavailable', async () => {
    vi.doMock('@openai/agents', () => {
      throw new Error('Cannot find package @openai/agents');
    });

    await expect(import('../../src/index')).resolves.toBeDefined();
  });

  it('explains how to install the OpenAI Agents SDK when that provider is requested', async () => {
    vi.doMock('../../src/providers/openai/agents', () => {
      throw new Error('Cannot find package @openai/agents');
    });

    const { providerMap } = await import('../../src/providers/registry');
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
    await expect(createProviderPromise).rejects.toThrow('npm install @openai/agents');
  });
});
