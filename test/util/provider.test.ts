import * as path from 'path';

import { describe, expect, it } from 'vitest';
import { providerToIdentifier } from '../../src/util/provider';

import type { ApiProvider } from '../../src/types/index';

describe('providerToIdentifier', () => {
  it('works with provider string', async () => {
    expect(providerToIdentifier('gpt-3.5-turbo')).toStrictEqual('gpt-3.5-turbo');
  });

  it('works with provider id undefined', async () => {
    expect(providerToIdentifier(undefined)).toBeUndefined();
  });

  it('works with ApiProvider', async () => {
    const providerId = 'custom';
    const apiProvider = {
      id() {
        return providerId;
      },
    } as ApiProvider;

    expect(providerToIdentifier(apiProvider)).toStrictEqual(providerId);
  });

  it('works with ProviderOptions', async () => {
    const providerId = 'custom';
    const providerOptions = {
      id: providerId,
    };

    expect(providerToIdentifier(providerOptions)).toStrictEqual(providerId);
  });

  it('uses label when present on ProviderOptions', async () => {
    const providerOptions = {
      id: 'file://provider.js',
      label: 'my-provider',
    };

    expect(providerToIdentifier(providerOptions)).toStrictEqual('my-provider');
  });

  it('canonicalizes relative file paths to absolute', async () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('file://./provider.js')).toStrictEqual(
      `file://${path.join(originalCwd, 'provider.js')}`,
    );
  });

  it('canonicalizes JavaScript files without file:// prefix', async () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('./provider.js')).toStrictEqual(
      `file://${path.join(originalCwd, 'provider.js')}`,
    );
  });

  it('preserves absolute file paths', async () => {
    expect(providerToIdentifier('file:///absolute/path/provider.js')).toStrictEqual(
      'file:///absolute/path/provider.js',
    );
  });

  it('canonicalizes exec: paths', async () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('exec:./script.py')).toStrictEqual(
      `exec:${path.join(originalCwd, 'script.py')}`,
    );
  });

  it('canonicalizes python: paths', async () => {
    const originalCwd = process.cwd();
    expect(providerToIdentifier('python:./provider.py')).toStrictEqual(
      `python:${path.join(originalCwd, 'provider.py')}`,
    );
  });
});
