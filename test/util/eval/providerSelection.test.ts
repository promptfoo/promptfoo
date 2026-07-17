import { describe, expect, it } from 'vitest';
import {
  applyProviderSelection,
  buildProviderPermissionConfig,
  buildProviderShareConfig,
  collectEffectiveTestProviderPermissions,
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

  // Fix 3 (thread 3481053703): the generic sanitizer treated the `auth`/`session`
  // container keys as whole secrets, so it discarded the non-secret authentication
  // structure and a bearer->api-key swap or token-endpoint change replayed silently.
  it('detects auth/session structure drift while allowing credential rotation', () => {
    const bearer = provider('http', 'target', {
      url: 'https://api.test/chat',
      auth: { type: 'bearer', token: 'sentinel-bearer-secret' },
      session: { source: 'response', header: 'x-session-id' },
    });
    const source = {
      id: 'http',
      label: 'target',
      config: {
        url: 'https://api.test/chat',
        auth: {
          type: 'bearer',
          tokenUrl: 'https://auth.test/token',
          token: 'sentinel-bearer-secret',
        },
        session: { source: 'response', header: 'x-session-id' },
      },
    };
    const selection = createProviderSelection([bearer], [source], [bearer]);
    // The redacted fingerprint never carries the raw secret leaf.
    expect(JSON.stringify(selection)).not.toContain('sentinel');

    // Credential rotation under an unchanged structure replays cleanly.
    const rotated = provider('http', 'target', {
      url: 'https://api.test/chat',
      auth: { type: 'bearer', token: 'sentinel-bearer-rotated' },
      session: { source: 'response', header: 'x-session-id' },
    });
    const rotatedSource = {
      ...source,
      config: {
        ...source.config,
        auth: {
          type: 'bearer',
          tokenUrl: 'https://auth.test/token',
          token: 'sentinel-bearer-rotated',
        },
      },
    };
    expect(applyProviderSelection([rotated], [rotatedSource], selection).providers).toEqual([
      rotated,
    ]);

    // Switching bearer -> api-key/query auth is structural drift -> fail closed.
    const apiKeyAuth = provider('http', 'target', {
      url: 'https://api.test/chat',
      auth: { type: 'api_key', in: 'query', name: 'key', token: 'sentinel-bearer-secret' },
      session: { source: 'response', header: 'x-session-id' },
    });
    const apiKeySource = {
      ...source,
      config: {
        ...source.config,
        auth: { type: 'api_key', in: 'query', name: 'key', token: 'sentinel-bearer-secret' },
      },
    };
    expect(() => applyProviderSelection([apiKeyAuth], [apiKeySource], selection)).toThrow(
      'no longer matches provider at index 0',
    );

    // Changing the OAuth token endpoint is also structural drift -> fail closed.
    const movedEndpointSource = {
      ...source,
      config: {
        ...source.config,
        auth: {
          type: 'bearer',
          tokenUrl: 'https://evil.test/token',
          token: 'sentinel-bearer-secret',
        },
      },
    };
    expect(() => applyProviderSelection([bearer], [movedEndpointSource], selection)).toThrow(
      'no longer matches provider at index 0',
    );
  });

  // Fix 5 (thread 3481053708): dropping `basePath` let the same relative file
  // provider ref resolve to different code under a different base directory.
  it('fails closed when a relative file provider resolves from a different base path', () => {
    const original = provider('python:provider.py', 'target', { basePath: '/project/a' });
    const source = {
      id: 'python:provider.py',
      label: 'target',
      config: { basePath: '/project/a' },
    };
    const selection = createProviderSelection([original], [source], [original]);

    const movedBase = provider('python:provider.py', 'target', { basePath: '/project/b' });
    const movedSource = {
      id: 'python:provider.py',
      label: 'target',
      config: { basePath: '/project/b' },
    };
    expect(() => applyProviderSelection([movedBase], [movedSource], selection)).toThrow(
      'no longer matches provider at index 0',
    );
  });

  // Fix 1 (thread 3481053696): a filtered run authorized only the top-level matrix,
  // so a per-test `test.provider` (executed by callActiveProvider) escaped the
  // permission boundary.
  it('authorizes effective per-test, grader, and red-team providers in the permission boundary', () => {
    const providers = [provider('openai:gpt-5', 'selected'), provider('http', 'unselected')];
    const providerConfigs: SourceProviders = [
      { id: 'openai:gpt-5', label: 'selected' },
      { id: 'http', label: 'unselected' },
    ];
    const selection = createProviderSelection(providers, providerConfigs, [providers[0]]);

    const config = {
      providers: providerConfigs,
      redteam: { provider: 'openai:redteam-grader' },
    };
    const effectiveSource = {
      tests: [
        {
          vars: {},
          // Resolved ApiProvider instance shape (id is a function).
          provider: { id: () => 'openai:test-override', label: 'override', config: {} },
        },
        {
          vars: {},
          options: { provider: 'openai:grader-model' },
          assert: [{ type: 'llm-rubric', provider: 'anthropic:assert-grader' }],
        },
      ],
      defaultTest: { provider: 'openai:default-target' },
      redteam: config.redteam,
    };

    const permission = buildProviderPermissionConfig(config, selection, effectiveSource);
    const permissionProviders = permission.providers as Array<string | { id: string }>;
    const ids = permissionProviders.map((p) => (typeof p === 'string' ? p : p.id));
    expect(ids).toEqual(
      expect.arrayContaining([
        'openai:gpt-5',
        'openai:test-override',
        'openai:grader-model',
        'anthropic:assert-grader',
        'openai:default-target',
        'openai:redteam-grader',
      ]),
    );

    // The standalone collector is deduplicating and skips the top-level matrix.
    const effective = collectEffectiveTestProviderPermissions(effectiveSource);
    expect(effective.map((p) => (typeof p === 'string' ? p : p.id))).toEqual([
      'openai:test-override',
      'openai:grader-model',
      'anthropic:assert-grader',
      'openai:default-target',
      'openai:redteam-grader',
    ]);
  });

  // Fix 2 (thread 3481053700): the share payload spread the raw config, leaking
  // secrets in `env`, `tests[*].provider`, `defaultTest`, and grader/red-team
  // provider configs.
  it('strips secrets from every provider-bearing surface in the share payload', () => {
    const providers = [provider('openai:gpt-5', 'selected')];
    const providerConfigs: SourceProviders = [
      { id: 'openai:gpt-5', label: 'selected', config: { apiKey: 'sentinel-top-secret' } },
    ];
    const selection = createProviderSelection(providers, providerConfigs, [providers[0]]);

    const config = {
      env: { OPENAI_API_KEY: 'sentinel-env-secret' },
      prompts: ['Hello'],
      providers: providerConfigs,
      defaultTest: {
        options: {
          provider: { id: 'openai:grader', config: { apiKey: 'sentinel-default-secret' } },
        },
      },
      tests: [
        {
          vars: { input: 'x' },
          provider: { id: 'http', config: { headers: { authorization: 'sentinel-test-secret' } } },
        },
        {
          vars: { input: 'y' },
          assert: [
            {
              type: 'llm-rubric',
              provider: { id: 'openai:g', config: { apiKey: 'sentinel-assert-secret' } },
            },
          ],
        },
      ],
      redteam: { provider: { id: 'http', config: { apiKey: 'sentinel-redteam-secret' } } },
    };

    const share = buildProviderShareConfig(config, selection) as Record<string, unknown>;
    expect(JSON.stringify(share)).not.toContain('sentinel');
    // Local env data is omitted entirely.
    expect(share).not.toHaveProperty('env');
    // Top-level providers are projected to their least-privilege identity.
    expect(share.providers).toEqual([{ id: 'openai:gpt-5', label: 'selected' }]);
    // Non-secret structure survives.
    expect(share.prompts).toEqual(['Hello']);
    expect((share.tests as Array<{ vars: unknown }>).map((t) => t.vars)).toEqual([
      { input: 'x' },
      { input: 'y' },
    ]);
  });
});
