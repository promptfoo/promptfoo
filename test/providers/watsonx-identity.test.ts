import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { WatsonXChatProvider, WatsonXProvider } from '../../src/providers/watsonx';

vi.mock('@ibm-cloud/watsonx-ai', () => ({
  WatsonXAI: { newInstance: vi.fn() },
}));

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  expect(WatsonXAI.newInstance).not.toHaveBeenCalled();
  expect(fetchWithCache).not.toHaveBeenCalled();
  vi.resetAllMocks();
});

describe.each([
  { mode: 'generation', Provider: WatsonXProvider, prefix: 'watsonx:' },
  { mode: 'chat', Provider: WatsonXChatProvider, prefix: 'watsonx:chat:' },
])('WatsonX $mode identity', ({ Provider, prefix }) => {
  const modelName = 'fixture/model:variant';
  const customId = 'custom-watsonx-provider';

  it('honors an explicit constructor ID without changing the model', () => {
    const provider = new Provider(modelName, { id: customId, config: {} });

    expect(provider.id()).toBe(customId);
    expect(provider.modelName).toBe(modelName);
  });

  it.each([undefined, ''])('preserves the default constructor ID for id=%j', (id) => {
    const provider = new Provider(modelName, { id, config: {} });

    expect(provider.id()).toBe(`watsonx:${modelName}`);
  });

  it('honors an explicit loader ID without changing routing or the model', async () => {
    const provider = await loadApiProvider(`${prefix}${modelName}`, {
      options: { id: customId, config: {} },
    });

    expect(provider).toBeInstanceOf(Provider);
    expect(provider.id()).toBe(customId);
    expect(provider).toMatchObject({ modelName });
  });

  it.each([undefined, ''])('preserves the default loader ID for id=%j', async (id) => {
    const provider = await loadApiProvider(`${prefix}${modelName}`, {
      options: { id, config: {} },
    });

    expect(provider).toBeInstanceOf(Provider);
    expect(provider.id()).toBe(`watsonx:${modelName}`);
    expect(provider).toMatchObject({ modelName });
  });
});
