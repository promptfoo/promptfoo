import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  checkProviderApiKeys,
  doesProviderRefMatch,
  getProviderDescription,
  getProviderIdentifier,
  isAnthropicProvider,
  isGoogleProvider,
  isOpenAiProvider,
  isProviderAllowed,
  providerToIdentifier,
} from '../../src/util/provider';
import {
  canonicalizeProviderId,
  isProviderConfigFileReference,
  normalizeProviderRef,
} from '../../src/util/providerRef';
import { createMockProvider } from '../factories/provider';

import type { ApiProvider } from '../../src/types/index';

describe('normalizeProviderRef', () => {
  it('identifies provider config file references without treating script providers as config', () => {
    expect(isProviderConfigFileReference('file://providers.yaml')).toBe(true);
    expect(isProviderConfigFileReference('file://providers.yml')).toBe(true);
    expect(isProviderConfigFileReference('file://providers.json')).toBe(true);
    expect(isProviderConfigFileReference('file://provider.js')).toBe(false);
  });

  it('normalizes ProviderOptionsMap refs with explicit id overrides', () => {
    const descriptor = normalizeProviderRef({
      'openai:responses:gpt-5.4': {
        id: 'custom-openai',
        label: 'Fast OpenAI',
        config: { temperature: 0.2 },
      },
    });

    expect(descriptor).toMatchObject({
      kind: 'map',
      id: 'custom-openai',
      label: 'Fast OpenAI',
      loadProviderPath: 'openai:responses:gpt-5.4',
      loadOptions: {
        id: 'custom-openai',
        label: 'Fast OpenAI',
        config: { temperature: 0.2 },
      },
    });
  });

  it('does not treat ProviderOptions-shaped objects as ProviderOptionsMap refs', () => {
    expect(normalizeProviderRef({ config: { temperature: 0.2 } })).toMatchObject({
      kind: 'unknown',
      id: 'unknown',
    });
    expect(normalizeProviderRef({ prompts: ['prompt1'] })).toMatchObject({
      kind: 'unknown',
      id: 'unknown',
    });
    expect(normalizeProviderRef({ config: { id: 'openai:gpt-4' } })).toMatchObject({
      kind: 'unknown',
      id: 'unknown',
    });
  });

  it('requires ProviderOptionsMap refs to use a single provider id key', () => {
    expect(
      normalizeProviderRef({
        'openai:gpt-4': { config: { temperature: 0.2 } },
        'anthropic:messages:claude-sonnet-4-5': { config: { temperature: 0.1 } },
      }),
    ).toMatchObject({
      kind: 'unknown',
      id: 'unknown',
    });
  });

  it('guards every ProviderOptions key against ProviderOptionsMap misclassification', () => {
    // Each key from the ProviderOptions interface must be guarded so that
    // objects like { transform: "..." } are not mistaken for { "transform": { ...providerOpts } }.
    // If you add a key to ProviderOptions, add it here too.
    const providerOptionKeys = [
      'id',
      'label',
      'config',
      'prompts',
      'transform',
      'delay',
      'env',
      'inputs',
    ];
    for (const key of providerOptionKeys) {
      const obj = { [key]: { nested: true } };
      const descriptor = normalizeProviderRef(obj);
      expect(descriptor.kind, `key "${key}" should not produce kind 'map'`).not.toBe('map');
    }
  });

  it('uses function labels before positional custom-function fallbacks', () => {
    const labeled = Object.assign(async () => ({ output: 'ok' }), { label: 'custom-label' });
    const unlabeled = async () => ({ output: 'ok' });

    expect(normalizeProviderRef(labeled, { index: 3 })).toMatchObject({
      kind: 'function',
      id: 'custom-label',
      label: 'custom-label',
    });
    expect(normalizeProviderRef(unlabeled, { index: 3 })).toMatchObject({
      kind: 'function',
      id: 'custom-function-3',
    });
  });

  it('falls back to labels for malformed provider configs used by filtering', () => {
    expect(normalizeProviderRef({ id: '', label: 'Provider2' }, { index: 1 })).toMatchObject({
      kind: 'unknown',
      id: 'Provider2',
      label: 'Provider2',
    });
  });

  it('classifies string providers as named vs file based on extension', () => {
    expect(normalizeProviderRef('openai:responses:gpt-5.4')).toMatchObject({
      kind: 'named',
      id: 'openai:responses:gpt-5.4',
      loadProviderPath: 'openai:responses:gpt-5.4',
    });
    expect(normalizeProviderRef('file://providers.yaml')).toMatchObject({
      kind: 'file',
      id: 'file://providers.yaml',
      loadProviderPath: 'file://providers.yaml',
    });
    expect(normalizeProviderRef('file://provider.js')).toMatchObject({
      kind: 'named',
      id: 'file://provider.js',
      loadProviderPath: 'file://provider.js',
    });
  });

  it('normalizes ProviderOptionsMap without nested id override (key becomes id)', () => {
    const descriptor = normalizeProviderRef({
      'openai:responses:gpt-5.4': {
        config: { temperature: 0.2 },
      },
    });

    expect(descriptor).toMatchObject({
      kind: 'map',
      id: 'openai:responses:gpt-5.4',
      loadProviderPath: 'openai:responses:gpt-5.4',
      loadOptions: {
        id: 'openai:responses:gpt-5.4',
        config: { temperature: 0.2 },
      },
    });
  });

  it('returns kind unknown for empty string provider IDs', () => {
    expect(normalizeProviderRef('')).toMatchObject({ kind: 'unknown', id: 'unknown' });
    expect(normalizeProviderRef('', { index: 2 })).toMatchObject({
      kind: 'unknown',
      id: 'unknown-2',
    });
  });

  it('returns kind unknown for null, undefined, and non-provider types', () => {
    expect(normalizeProviderRef(null)).toMatchObject({ kind: 'unknown', id: 'unknown' });
    expect(normalizeProviderRef(undefined)).toMatchObject({ kind: 'unknown', id: 'unknown' });
    expect(normalizeProviderRef(42)).toMatchObject({ kind: 'unknown', id: 'unknown' });
    expect(normalizeProviderRef([])).toMatchObject({ kind: 'unknown', id: 'unknown' });
    expect(normalizeProviderRef([{ id: 'openai:gpt-4' }])).toMatchObject({
      kind: 'unknown',
      id: 'unknown',
    });
  });
});

describe('canonicalizeProviderId', () => {
  it('resolves relative file:// paths to absolute', () => {
    const cwd = process.cwd();
    expect(canonicalizeProviderId('file://./provider.js')).toBe(
      `file://${path.join(cwd, 'provider.js')}`,
    );
  });

  it('preserves absolute file:// paths', () => {
    expect(canonicalizeProviderId('file:///absolute/path.js')).toBe('file:///absolute/path.js');
  });

  it('resolves exec: paths with slashes', () => {
    const cwd = process.cwd();
    expect(canonicalizeProviderId('exec:./script.py')).toBe(`exec:${path.join(cwd, 'script.py')}`);
  });

  it('preserves exec: paths without slashes', () => {
    expect(canonicalizeProviderId('exec:my-script')).toBe('exec:my-script');
  });

  it('resolves python: paths with slashes', () => {
    const cwd = process.cwd();
    expect(canonicalizeProviderId('python:./provider.py')).toBe(
      `python:${path.join(cwd, 'provider.py')}`,
    );
  });

  it('resolves golang: paths with slashes', () => {
    const cwd = process.cwd();
    expect(canonicalizeProviderId('golang:./main.go')).toBe(`golang:${path.join(cwd, 'main.go')}`);
  });

  it('preserves golang: paths without slashes', () => {
    expect(canonicalizeProviderId('golang:my-binary')).toBe('golang:my-binary');
  });

  it('wraps bare .js/.ts/.mjs paths with file://', () => {
    const cwd = process.cwd();
    expect(canonicalizeProviderId('./provider.js')).toBe(`file://${path.join(cwd, 'provider.js')}`);
    expect(canonicalizeProviderId('./provider.ts')).toBe(`file://${path.join(cwd, 'provider.ts')}`);
    expect(canonicalizeProviderId('./provider.mjs')).toBe(
      `file://${path.join(cwd, 'provider.mjs')}`,
    );
  });

  it('does not wrap bare .js/.ts/.mjs without path separators', () => {
    expect(canonicalizeProviderId('provider.js')).toBe('provider.js');
  });

  it('passes through plain provider IDs unchanged', () => {
    expect(canonicalizeProviderId('openai:responses:gpt-5.4')).toBe('openai:responses:gpt-5.4');
    expect(canonicalizeProviderId('echo')).toBe('echo');
  });
});

describe('providerToIdentifier', () => {
  it('works with provider string', () => {
    expect(providerToIdentifier('gpt-3.5-turbo')).toStrictEqual('gpt-3.5-turbo');
  });

  it('works with provider id undefined', () => {
    expect(providerToIdentifier(undefined)).toBeUndefined();
  });

  it('works with ApiProvider', () => {
    const providerId = 'custom';
    const apiProvider = {
      id() {
        return providerId;
      },
    } as ApiProvider;

    expect(providerToIdentifier(apiProvider)).toStrictEqual(providerId);
  });

  it('works with ProviderOptions', () => {
    const providerId = 'custom';
    const providerOptions = {
      id: providerId,
    };

    expect(providerToIdentifier(providerOptions)).toStrictEqual(providerId);
  });

  it('uses label when present on ProviderOptions', () => {
    const providerOptions = {
      id: 'file://provider.js',
      label: 'my-provider',
    };

    expect(providerToIdentifier(providerOptions)).toStrictEqual('my-provider');
  });

  it('canonicalizes relative file paths to absolute', () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('file://./provider.js')).toStrictEqual(
      `file://${path.join(originalCwd, 'provider.js')}`,
    );
  });

  it('canonicalizes JavaScript files without file:// prefix', () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('./provider.js')).toStrictEqual(
      `file://${path.join(originalCwd, 'provider.js')}`,
    );
  });

  it('preserves absolute file paths', () => {
    expect(providerToIdentifier('file:///absolute/path/provider.js')).toStrictEqual(
      'file:///absolute/path/provider.js',
    );
  });

  it('canonicalizes exec: paths', () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('exec:./script.py')).toStrictEqual(
      `exec:${path.join(originalCwd, 'script.py')}`,
    );
  });

  it('canonicalizes python: paths', () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('python:./provider.py')).toStrictEqual(
      `python:${path.join(originalCwd, 'provider.py')}`,
    );
  });
});

describe('getProviderIdentifier', () => {
  it('returns label when present', () => {
    const provider = createMockProvider({ id: 'openai:gpt-4', label: 'my-custom-label' });
    expect(getProviderIdentifier(provider)).toBe('my-custom-label');
  });

  it('returns id when no label', () => {
    const provider = createMockProvider({ id: 'openai:gpt-4' });
    expect(getProviderIdentifier(provider)).toBe('openai:gpt-4');
  });
});

describe('getProviderDescription', () => {
  it('returns both label and id when both present', () => {
    const provider = createMockProvider({ id: 'openai:gpt-4', label: 'my-custom-label' });
    expect(getProviderDescription(provider)).toBe('my-custom-label (openai:gpt-4)');
  });

  it('returns only id when no label', () => {
    const provider = createMockProvider({ id: 'openai:gpt-4' });
    expect(getProviderDescription(provider)).toBe('openai:gpt-4');
  });

  it('returns only id when label equals id', () => {
    const provider = createMockProvider({ id: 'openai:gpt-4', label: 'openai:gpt-4' });
    expect(getProviderDescription(provider)).toBe('openai:gpt-4');
  });
});

describe('doesProviderRefMatch', () => {
  const createProvider = (id: string, label?: string): ApiProvider =>
    createMockProvider({ id, label });

  it('matches exact label', () => {
    const provider = createProvider('openai:gpt-4', 'fast-model');
    expect(doesProviderRefMatch('fast-model', provider)).toBe(true);
    expect(doesProviderRefMatch('slow-model', provider)).toBe(false);
  });

  it('matches exact id', () => {
    const provider = createProvider('openai:gpt-4');
    expect(doesProviderRefMatch('openai:gpt-4', provider)).toBe(true);
    expect(doesProviderRefMatch('openai:gpt-3.5', provider)).toBe(false);
  });

  it('matches wildcard on id', () => {
    const provider = createProvider('openai:gpt-4');
    expect(doesProviderRefMatch('openai:*', provider)).toBe(true);
    expect(doesProviderRefMatch('anthropic:*', provider)).toBe(false);
  });

  it('matches wildcard on label', () => {
    const provider = createProvider('openai:gpt-4', 'openai-fast');
    expect(doesProviderRefMatch('openai-*', provider)).toBe(true);
    expect(doesProviderRefMatch('anthropic-*', provider)).toBe(false);
  });

  it('matches legacy prefix on id', () => {
    const provider = createProvider('openai:gpt-4');
    expect(doesProviderRefMatch('openai', provider)).toBe(true);
    expect(doesProviderRefMatch('anthropic', provider)).toBe(false);
  });

  it('matches legacy prefix on label', () => {
    const provider = createProvider('custom-provider', 'openai:custom');
    expect(doesProviderRefMatch('openai', provider)).toBe(true);
  });

  it('does not match partial strings', () => {
    const provider = createProvider('openai:gpt-4');
    expect(doesProviderRefMatch('openai:gpt', provider)).toBe(false);
    expect(doesProviderRefMatch('gpt-4', provider)).toBe(false);
  });

  it('matches canonicalized file paths', () => {
    // Provider has relative path, ref uses absolute - should still match after canonicalization
    const absolutePath = path.resolve('./my-provider.js');
    const provider = createProvider(`file://${absolutePath}`);
    expect(doesProviderRefMatch('./my-provider.js', provider)).toBe(true);
    expect(doesProviderRefMatch(`file://${absolutePath}`, provider)).toBe(true);
  });
});

describe('isProviderAllowed', () => {
  const createProvider = (id: string, label?: string): ApiProvider =>
    createMockProvider({ id, label });

  it('allows all providers when no filter', () => {
    const provider = createProvider('openai:gpt-4');
    expect(isProviderAllowed(provider, undefined)).toBe(true);
  });

  it('blocks all providers with empty array', () => {
    const provider = createProvider('openai:gpt-4');
    expect(isProviderAllowed(provider, [])).toBe(false);
  });

  it('allows matching providers', () => {
    const provider = createProvider('openai:gpt-4', 'fast-model');
    expect(isProviderAllowed(provider, ['fast-model'])).toBe(true);
    expect(isProviderAllowed(provider, ['openai:gpt-4'])).toBe(true);
    expect(isProviderAllowed(provider, ['openai:*'])).toBe(true);
  });

  it('blocks non-matching providers', () => {
    const provider = createProvider('openai:gpt-4', 'fast-model');
    expect(isProviderAllowed(provider, ['slow-model'])).toBe(false);
    expect(isProviderAllowed(provider, ['anthropic:*'])).toBe(false);
  });

  it('allows if any filter matches', () => {
    const provider = createProvider('openai:gpt-4');
    expect(isProviderAllowed(provider, ['anthropic:*', 'openai:*'])).toBe(true);
    expect(isProviderAllowed(provider, ['anthropic:*', 'google:*'])).toBe(false);
  });
});

describe('isOpenAiProvider', () => {
  it('detects direct OpenAI providers', () => {
    expect(isOpenAiProvider('openai:chat:gpt-4o')).toBe(true);
    expect(isOpenAiProvider('openai:gpt-4')).toBe(true);
    expect(isOpenAiProvider('openai:completion:gpt-3.5-turbo')).toBe(true);
    expect(isOpenAiProvider('openai:embedding:text-embedding-ada-002')).toBe(true);
  });

  it('detects Azure OpenAI providers', () => {
    // azureopenai: is always OpenAI
    expect(isOpenAiProvider('azureopenai:chat:my-deployment')).toBe(true);
    // azure: with OpenAI model indicators
    expect(isOpenAiProvider('azure:chat:gpt-4-deployment')).toBe(true);
    expect(isOpenAiProvider('azure:chat:my-gpt-35-turbo')).toBe(true);
    expect(isOpenAiProvider('azure:completion:davinci-002')).toBe(true);
    expect(isOpenAiProvider('azure:embedding:text-embedding-ada-002')).toBe(true);
  });

  it('does not match Azure without OpenAI model indicators', () => {
    expect(isOpenAiProvider('azure:chat:my-custom-deployment')).toBe(false);
    expect(isOpenAiProvider('azure:foundry-agent:my-agent')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isOpenAiProvider('OpenAI:chat:gpt-4')).toBe(true);
    expect(isOpenAiProvider('AZUREOPENAI:chat:my-deployment')).toBe(true);
    expect(isOpenAiProvider('AZURE:chat:GPT-4-deployment')).toBe(true);
  });

  it('does not match non-OpenAI providers', () => {
    expect(isOpenAiProvider('anthropic:messages:claude-3-5-sonnet')).toBe(false);
    expect(isOpenAiProvider('google:gemini-pro')).toBe(false);
    expect(isOpenAiProvider('bedrock:anthropic.claude-3-5-sonnet')).toBe(false);
    expect(isOpenAiProvider('vertex:gemini-2.0-flash')).toBe(false);
  });
});

describe('isAnthropicProvider', () => {
  it('detects direct Anthropic providers', () => {
    expect(isAnthropicProvider('anthropic:messages:claude-3-5-sonnet')).toBe(true);
    expect(isAnthropicProvider('anthropic:completion:claude-2.1')).toBe(true);
    expect(isAnthropicProvider('anthropic:claude-opus-4-6')).toBe(true);
    expect(isAnthropicProvider('anthropic:claude-opus-4-5-20251101')).toBe(true);
  });

  it('detects Bedrock with Claude models', () => {
    expect(isAnthropicProvider('bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0')).toBe(true);
    expect(isAnthropicProvider('bedrock:anthropic.claude-opus-4-6-v1')).toBe(true);
    expect(isAnthropicProvider('bedrock:anthropic.claude-opus-4-5-20251101-v1:0')).toBe(true);
    expect(isAnthropicProvider('bedrock:converse:anthropic.claude-3-opus-20240229-v1:0')).toBe(
      true,
    );
    expect(isAnthropicProvider('bedrock:us.anthropic.claude-3-5-sonnet-20240620-v1:0')).toBe(true);
    expect(isAnthropicProvider('bedrock:eu.anthropic.claude-3-haiku-20240307-v1:0')).toBe(true);
  });

  it('detects Vertex with Claude models', () => {
    expect(isAnthropicProvider('vertex:claude-3-5-sonnet@20240620')).toBe(true);
    expect(isAnthropicProvider('vertex:claude-3-opus@20240229')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isAnthropicProvider('ANTHROPIC:messages:claude-3-5-sonnet')).toBe(true);
    expect(isAnthropicProvider('BEDROCK:anthropic.CLAUDE-3-5-sonnet')).toBe(true);
    expect(isAnthropicProvider('VERTEX:CLAUDE-3-opus')).toBe(true);
  });

  it('does not match non-Anthropic providers', () => {
    expect(isAnthropicProvider('openai:chat:gpt-4o')).toBe(false);
    expect(isAnthropicProvider('google:gemini-pro')).toBe(false);
    expect(isAnthropicProvider('bedrock:amazon.titan-text-express-v1')).toBe(false);
    expect(isAnthropicProvider('vertex:gemini-2.0-flash')).toBe(false);
  });
});

describe('isGoogleProvider', () => {
  it('detects direct Google AI Studio providers', () => {
    expect(isGoogleProvider('google:gemini-pro')).toBe(true);
    expect(isGoogleProvider('google:gemini-2.0-flash')).toBe(true);
    expect(isGoogleProvider('google:live:gemini-2.0-flash')).toBe(true);
    expect(isGoogleProvider('google:image:gemini-pro-vision')).toBe(true);
  });

  it('detects Vertex with Google models', () => {
    expect(isGoogleProvider('vertex:gemini-2.0-flash')).toBe(true);
    expect(isGoogleProvider('vertex:gemini-pro')).toBe(true);
    expect(isGoogleProvider('vertex:text-bison')).toBe(true);
    expect(isGoogleProvider('vertex:llama-3.3-70b')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isGoogleProvider('GOOGLE:gemini-pro')).toBe(true);
    expect(isGoogleProvider('VERTEX:GEMINI-2.0-flash')).toBe(true);
  });

  it('does not match Vertex with Claude models (they are Anthropic)', () => {
    expect(isGoogleProvider('vertex:claude-3-5-sonnet@20240620')).toBe(false);
    expect(isGoogleProvider('vertex:claude-3-opus@20240229')).toBe(false);
  });

  it('does not match non-Google providers', () => {
    expect(isGoogleProvider('openai:chat:gpt-4o')).toBe(false);
    expect(isGoogleProvider('anthropic:messages:claude-3-5-sonnet')).toBe(false);
    expect(isGoogleProvider('bedrock:anthropic.claude-3-5-sonnet')).toBe(false);
  });
});

describe('checkProviderApiKeys', () => {
  const providerWithKey = (id: string, extras: Record<string, unknown> = {}): ApiProvider =>
    Object.assign(createMockProvider({ id, config: {} }), {
      getApiKey: () => undefined,
      requiresApiKey: () => true,
      ...extras,
    }) as unknown as ApiProvider;

  it('detects missing API key and maps to correct env var', () => {
    const provider = providerWithKey('openai:gpt-4');

    const result = checkProviderApiKeys([provider]);
    expect(result.size).toBe(1);
    expect(result.get('OPENAI_API_KEY')).toEqual(['openai:gpt-4']);
  });

  it('skips providers with valid key, no getApiKey method, or requiresApiKey false', () => {
    const providers: ApiProvider[] = [
      providerWithKey('openai:gpt-4', { getApiKey: () => 'sk-1234' }),
      createMockProvider({ id: 'http:custom' }),
      providerWithKey('openai:gpt-4', { requiresApiKey: () => false }),
      Object.assign(
        createMockProvider({ id: 'litellm:gpt-4', config: { apiKeyRequired: false } }),
        { getApiKey: () => undefined },
      ) as unknown as ApiProvider,
    ];

    const result = checkProviderApiKeys(providers);
    expect(result.size).toBe(0);
  });

  it('skips azure providers (Azure AD token auth)', () => {
    const provider = providerWithKey('azure:gpt-4');

    const result = checkProviderApiKeys([provider]);
    expect(result.size).toBe(0);
  });

  it('deduplicates multiple providers sharing the same env var', () => {
    const providers: ApiProvider[] = [
      providerWithKey('openai:gpt-4'),
      providerWithKey('openai:gpt-5-mini'),
      Object.assign(
        createMockProvider({ id: 'anthropic:claude-sonnet-4-5-20250514', config: {} }),
        { getApiKey: () => undefined },
      ) as unknown as ApiProvider,
    ];

    const result = checkProviderApiKeys(providers);
    expect(result.size).toBe(2);
    expect(result.get('OPENAI_API_KEY')).toEqual(['openai:gpt-4', 'openai:gpt-5-mini']);
    expect(result.get('ANTHROPIC_API_KEY')).toEqual(['anthropic:claude-sonnet-4-5-20250514']);
  });
});
