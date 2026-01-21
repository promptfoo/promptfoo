import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  doesProviderRefMatch,
  getProviderDescription,
  getProviderIdentifier,
  isProviderAllowed,
  providerToIdentifier,
} from '../../src/util/provider';

import type { ApiProvider } from '../../src/types/index';

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
    const provider = {
      id: () => 'openai:gpt-4',
      label: 'my-custom-label',
    } as ApiProvider;
    expect(getProviderIdentifier(provider)).toBe('my-custom-label');
  });

  it('returns id when no label', () => {
    const provider = {
      id: () => 'openai:gpt-4',
    } as ApiProvider;
    expect(getProviderIdentifier(provider)).toBe('openai:gpt-4');
  });
});

describe('getProviderDescription', () => {
  it('returns both label and id when both present', () => {
    const provider = {
      id: () => 'openai:gpt-4',
      label: 'my-custom-label',
    } as ApiProvider;
    expect(getProviderDescription(provider)).toBe('my-custom-label (openai:gpt-4)');
  });

  it('returns only id when no label', () => {
    const provider = {
      id: () => 'openai:gpt-4',
    } as ApiProvider;
    expect(getProviderDescription(provider)).toBe('openai:gpt-4');
  });

  it('returns only id when label equals id', () => {
    const provider = {
      id: () => 'openai:gpt-4',
      label: 'openai:gpt-4',
    } as ApiProvider;
    expect(getProviderDescription(provider)).toBe('openai:gpt-4');
  });
});

describe('doesProviderRefMatch', () => {
  const createProvider = (id: string, label?: string): ApiProvider =>
    ({
      id: () => id,
      label,
    }) as ApiProvider;

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
    ({
      id: () => id,
      label,
    }) as ApiProvider;

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
