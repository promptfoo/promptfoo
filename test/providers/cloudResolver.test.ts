import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { loadApiProviders } from '../../src/providers/index';
import { getProviderFromCloud, withCloudProviderResolver } from '../../src/util/cloud';
import { renderConfigEnvTemplates } from '../../src/util/config/load';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

import type { ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/util/fetch/index');

const cloudId = '00000000-0000-4000-8000-000000000001';
const cloudPath = `promptfoo://provider/${cloudId}`;

beforeEach(() => {
  vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('prepared cloud provider loading', () => {
  it.each([
    { key: 'OPENAI_API_BASE_URL', saved: undefined, local: undefined, expected: 'suite' },
    { key: 'OPENAI_API_BASE_URL', saved: 'saved', local: undefined, expected: 'saved' },
    { key: 'OPENAI_API_BASE_URL', saved: 'saved', local: 'local', expected: 'local' },
    { key: 'CUSTOM_TARGET_URL', saved: undefined, local: undefined, expected: 'suite' },
    { key: 'CUSTOM_TARGET_URL', saved: 'saved', local: undefined, expected: 'saved' },
    { key: 'CUSTOM_TARGET_URL', saved: 'saved', local: 'local', expected: 'local' },
  ])(
    'keeps suite < saved < local env precedence for $key: $expected',
    async ({ key, saved, local, expected }) => {
      const savedProvider = {
        id: 'echo',
        config: { endpoint: `{{ env.${key} }}` },
        env: saved ? { [key]: saved } : undefined,
      };
      const suite = renderConfigEnvTemplates({
        env: { [key]: 'suite' },
        providers: [{ [cloudPath]: { env: local ? { [key]: local } : undefined } }],
      });

      const [provider] = await withCloudProviderResolver(
        () => savedProvider,
        () => loadApiProviders(suite.providers, { env: suite.env }),
      );

      expect(provider.config?.endpoint).toBe(expected);
      expect(savedProvider.config.endpoint).toBe(`{{ env.${key} }}`);
      expect(fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it('does not add a suite rendering pass or dereference file-valued saved settings', async () => {
    const savedProvider = {
      id: 'echo',
      label: '{{ env.CUSTOM_TARGET_URL }}',
      env: {
        CUSTOM_TARGET_URL: '{{ env.OPENAI_ORGANIZATION }}',
        OPENAI_ORGANIZATION: 'would-be-an-extra-pass',
      },
      config: {
        endpoint: '{{ env.CUSTOM_TARGET_URL }}',
        document: 'file://keep-as-provider-data.txt',
      },
    };
    const suite = renderConfigEnvTemplates({
      env: { CUSTOM_TARGET_URL: 'suite' },
      providers: [cloudPath],
    });

    const [provider] = await withCloudProviderResolver(
      () => savedProvider,
      () => loadApiProviders(suite.providers, { env: suite.env }),
    );

    expect(provider.config?.endpoint).toBe('{{ env.OPENAI_ORGANIZATION }}');
    expect(provider.label).toBe('{{ env.OPENAI_ORGANIZATION }}');
    expect(provider.config?.document).toBe('file://keep-as-provider-data.txt');
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('keeps the normal suite-rendered local override separate from saved settings', async () => {
    const suite = renderConfigEnvTemplates({
      env: { OPENAI_API_BASE_URL: 'suite' },
      providers: [{ [cloudPath]: { config: { endpoint: '{{ env.OPENAI_API_BASE_URL }}' } } }],
    });
    const [provider] = await withCloudProviderResolver(
      () => ({
        id: 'echo',
        env: { OPENAI_API_BASE_URL: 'saved' },
        config: { endpoint: 'saved default', other: '{{ env.OPENAI_API_BASE_URL }}' },
      }),
      () => loadApiProviders(suite.providers, { env: suite.env }),
    );

    expect(provider.config).toMatchObject({ endpoint: 'suite', other: 'saved' });
  });

  it('leaves reusable saved settings untouched when templating is disabled', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    const savedProvider = { id: 'echo', config: Object.freeze({ prefix: 'saved' }) };
    try {
      const [provider] = await withCloudProviderResolver(
        () => savedProvider,
        () => loadApiProviders([cloudPath]),
      );
      expect(provider.config?.linkedTargetId).toBe(cloudPath);
      expect(savedProvider.config).toEqual({ prefix: 'saved' });
    } finally {
      restoreEnv();
    }
  });

  it('supplies each occurrence options while leaving lookup-only calls separate', async () => {
    const resolver = vi.fn((_id: string, localOptions?: ProviderOptions) => ({
      id: 'echo',
      config: { prepared: localOptions?.config?.useUploaded ? 'uploaded' : 'saved' },
    }));
    const suite = renderConfigEnvTemplates({
      env: { OPENAI_API_BASE_URL: 'suite' },
      providers: [
        { [cloudPath]: { config: { useUploaded: false, note: 'first' } } },
        { [cloudPath]: { config: { useUploaded: true, note: 'second' } } },
      ],
    });

    await withCloudProviderResolver(resolver, async () => {
      expect((await getProviderFromCloud(cloudId)).config?.prepared).toBe('saved');
      const providers = await loadApiProviders(suite.providers, { env: suite.env });
      expect(providers.map((provider) => provider.config)).toMatchObject([
        { prepared: 'saved', useUploaded: false, note: 'first' },
        { prepared: 'uploaded', useUploaded: true, note: 'second' },
      ]);
    });

    expect(resolver).toHaveBeenCalledWith(cloudId, undefined);
    expect(resolver).toHaveBeenCalledWith(
      cloudId,
      expect.objectContaining({ config: { useUploaded: true, note: 'second' } }),
    );
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
});
