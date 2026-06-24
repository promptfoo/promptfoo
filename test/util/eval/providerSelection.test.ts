import { describe, expect, it } from 'vitest';
import {
  applyProviderSelection,
  buildProviderPermissionConfig,
  buildProviderShareConfig,
  createProviderSelection,
} from '../../../src/util/eval/providerSelection';

import type { TestSuite, TestSuiteConfig } from '../../../src/types';

type SourceProviders = Extract<NonNullable<TestSuiteConfig['providers']>, unknown[]>;

function provider(id: string, label?: string, config?: Record<string, unknown>) {
  return {
    id: () => id,
    label,
    config,
    callApi: async () => ({ output: 'ok' }),
  } as TestSuite['providers'][number];
}

describe('provider selection', () => {
  const cloudProviderId = 'promptfoo://provider/11111111-1111-4111-8111-111111111111';
  const linkedTargetId = 'promptfoo://provider/22222222-2222-4222-8222-222222222222';

  it('preserves authorization identity without provider secrets', () => {
    const providers = [
      provider('echo', 'direct'),
      provider('openai:gpt-5', 'cloud target', { apiKey: 'cloud-secret' }),
      provider('http', 'linked target', {
        headers: { authorization: 'linked-secret' },
        linkedTargetId,
      }),
    ];
    const providerConfigs: SourceProviders = [
      { id: 'echo', label: 'direct', config: { apiKey: 'direct-secret' } },
      cloudProviderId,
      {
        id: 'http',
        label: 'linked target',
        config: { headers: { authorization: 'linked-secret' }, linkedTargetId },
      },
    ];

    const selection = createProviderSelection(providers, providerConfigs, [
      providers[1],
      providers[2],
    ]);

    expect(selection.providers).toEqual([
      expect.objectContaining({
        index: 1,
        id: 'openai:gpt-5',
        label: 'cloud target',
        cloudProviderId,
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        index: 2,
        id: 'http',
        label: 'linked target',
        linkedTargetId,
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(JSON.stringify(selection)).not.toContain('secret');

    const config = {
      env: { API_KEY: 'top-level-secret' },
      metadata: { configId: 'config-id', ignored: 'value', teamId: 'team-id' },
      prompts: ['Hello'],
      providers: providerConfigs,
      tests: [{ vars: { input: 'test' } }],
    };
    const permissionConfig = buildProviderPermissionConfig(config, selection);
    expect(permissionConfig).toEqual({
      metadata: { configId: 'config-id', teamId: 'team-id' },
      prompts: [],
      providers: [
        cloudProviderId,
        { id: 'http', label: 'linked target', config: { linkedTargetId } },
      ],
    });
    expect(JSON.stringify(permissionConfig)).not.toContain('secret');

    const shareConfig = buildProviderShareConfig(config, selection);
    expect(shareConfig.providers).toEqual(permissionConfig.providers);
    expect(shareConfig.prompts).toEqual(['Hello']);
    expect(shareConfig.tests).toEqual([{ vars: { input: 'test' } }]);
  });

  it('replays the exact ordered provider subset and fails closed on identity drift', () => {
    const providers = [provider('echo', 'first'), provider('http', 'second')];
    const providerConfigs: SourceProviders = [
      { id: 'echo', label: 'first' },
      { id: 'http', label: 'second' },
    ];
    const selection = createProviderSelection(providers, providerConfigs, [providers[1]]);

    expect(applyProviderSelection(providers, providerConfigs, selection)).toEqual({
      providers: [providers[1]],
      providerConfigs: [providerConfigs[1]],
    });

    const reorderedProviders = [providers[1], providers[0]];
    expect(() => applyProviderSelection(reorderedProviders, providerConfigs, selection)).toThrow(
      'no longer matches provider at index 1',
    );
  });

  it('fails closed when executable provider configuration drifts under the same identity', () => {
    const original = provider('http', 'target', { url: 'https://old.example.test' });
    const source = {
      id: 'http',
      label: 'target',
      config: { url: 'https://old.example.test' },
    };
    const selection = createProviderSelection([original], [source], [original]);
    const changed = provider('http', 'target', { url: 'https://new.example.test' });

    expect(() => applyProviderSelection([changed], [source], selection)).toThrow(
      'no longer matches provider at index 0',
    );
  });

  it('fails closed when provider-level execution options drift', () => {
    const original = provider('http', 'target', { url: 'https://example.test' });
    const source = {
      id: 'http',
      label: 'target',
      config: { url: 'https://example.test' },
      transform: 'output.safe',
    };
    const selection = createProviderSelection([original], [source], [original]);

    expect(() =>
      applyProviderSelection([original], [{ ...source, transform: 'output.changed' }], selection),
    ).toThrow('no longer matches provider at index 0');
  });

  it('fails closed when a function-valued provider transform drifts', () => {
    const original = provider('http', 'target', { url: 'https://example.test' });
    const source = {
      id: 'http',
      label: 'target',
      transform: function transform(output: string) {
        return `safe:${output}`;
      },
    };
    const selection = createProviderSelection([original], [source], [original]);
    const changedSource = {
      ...source,
      transform: function transform(output: string) {
        return `changed:${output}`;
      },
    };

    expect(() => applyProviderSelection([original], [changedSource], selection)).toThrow(
      'no longer matches provider at index 0',
    );
  });

  it('fails closed when a custom provider implementation drifts', () => {
    const original = provider('custom', 'target');
    const source = { id: 'custom', label: 'target' };
    const selection = createProviderSelection([original], [source], [original]);
    const changed = {
      ...original,
      callApi: async () => ({ output: 'changed' }),
    };

    expect(() => applyProviderSelection([changed], [source], selection)).toThrow(
      'no longer matches provider at index 0',
    );
  });

  it('allows credential rotation when provider execution semantics are unchanged', () => {
    const original = provider('http', 'target', {
      apiKey: 'old-secret',
      url: 'https://example.test',
    });
    const source = {
      id: 'http',
      label: 'target',
      config: { apiKey: 'old-secret', url: 'https://example.test' },
    };
    const selection = createProviderSelection([original], [source], [original]);
    const rotated = provider('http', 'target', {
      apiKey: 'new-secret',
      url: 'https://example.test',
    });
    const rotatedSource = {
      ...source,
      config: { ...source.config, apiKey: 'new-secret' },
    };

    expect(applyProviderSelection([rotated], [rotatedSource], selection).providers).toEqual([
      rotated,
    ]);
  });

  it('rejects missing or misaligned provider provenance', () => {
    const providers = [provider('echo')];
    expect(() => createProviderSelection(providers, undefined, providers)).toThrow(
      'Provider selection provenance mismatch',
    );
    expect(() => createProviderSelection(providers, [], providers)).toThrow(
      'Provider selection provenance mismatch',
    );
  });
});
