import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { resolveProviderApiKey } from '../../src/providers/credentials';
import { mockProcessEnv } from '../util/utils';

const defaults = ['AZURE_API_KEY', 'AZURE_OPENAI_API_KEY'];

let restoreEnvironment: () => void;
beforeEach(() => {
  restoreEnvironment = mockProcessEnv();
});
afterEach(() => {
  restoreEnvironment();
  vi.restoreAllMocks();
});

describe('provider credential policy', () => {
  it.each(['OPENAI_API_KEY', 'CUSTOM_API_KEY'])(
    'honors an explicitly empty override for %s',
    (name) => {
      mockProcessEnv({ [name]: 'process-key' });
      expect(
        resolveProviderApiKey(
          name === 'CUSTOM_API_KEY' ? { apiKeyEnvar: name } : {},
          { [name]: '' },
          ['OPENAI_API_KEY'],
        ),
      ).toBeUndefined();
    },
  );

  it('keeps an unmasked alias available when another key is explicitly empty', () => {
    mockProcessEnv({ AZURE_API_KEY: 'masked-key', AZURE_OPENAI_API_KEY: 'alias-key' });
    expect(resolveProviderApiKey({}, { AZURE_API_KEY: '' }, defaults)).toBe('alias-key');
  });

  it('prefers explicit keys over provider and process environments', () => {
    mockProcessEnv({ OPENAI_API_KEY: 'process-key' });
    expect(
      resolveProviderApiKey({ apiKey: 'configured-key' }, { OPENAI_API_KEY: 'provider-key' }, [
        'OPENAI_API_KEY',
      ]),
    ).toBe('configured-key');
  });

  it('prefers provider environment for a named credential', () => {
    mockProcessEnv({ TOGETHER_API_KEY: 'process-key' });
    expect(
      resolveProviderApiKey(
        { apiKeyEnvar: 'TOGETHER_API_KEY' },
        { TOGETHER_API_KEY: 'provider-key' },
        ['OPENAI_API_KEY'],
      ),
    ).toBe('provider-key');
  });

  it('uses the process environment when the selected provider override is absent', () => {
    mockProcessEnv({ TOGETHER_API_KEY: 'process-key' });
    expect(
      resolveProviderApiKey({ apiKeyEnvar: 'TOGETHER_API_KEY' }, undefined, ['OPENAI_API_KEY']),
    ).toBe('process-key');
  });

  it('does not substitute another vendor credential for a missing named credential', () => {
    mockProcessEnv({ TOGETHER_API_KEY: undefined, OPENAI_API_KEY: 'openai-key' });
    expect(
      resolveProviderApiKey(
        { apiKeyEnvar: 'TOGETHER_API_KEY' },
        { OPENAI_API_KEY: 'openai-override' },
        ['OPENAI_API_KEY'],
      ),
    ).toBeUndefined();
  });

  it.each(['suite', 'file'] as const)('prefers a %s alias over the host primary key', (layer) => {
    mockProcessEnv({ AZURE_API_KEY: 'host-key' });
    const run =
      layer === 'suite'
        ? cliState.withEnv.bind(cliState)
        : cliState.withEnvFileOverrides.bind(cliState);
    run({ AZURE_OPENAI_API_KEY: 'scoped-key' }, () => {
      expect(resolveProviderApiKey(undefined, undefined, defaults)).toBe('scoped-key');
    });
  });

  it('prefers suite aliases over file aliases while preserving per-name masks', () => {
    cliState.withEnvFileOverrides(
      { AZURE_API_KEY: 'file-primary', AZURE_OPENAI_API_KEY: 'file-alias' },
      () => {
        cliState.withEnv({ AZURE_OPENAI_API_KEY: 'suite-alias' }, () => {
          expect(resolveProviderApiKey(undefined, undefined, defaults)).toBe('suite-alias');
        });
        cliState.withEnv({ AZURE_OPENAI_API_KEY: '' }, () => {
          expect(resolveProviderApiKey(undefined, undefined, defaults)).toBe('file-primary');
        });
      },
    );
  });

  it('preserves legacy aliases while preferring provider overrides over process defaults', () => {
    mockProcessEnv({ AZURE_API_KEY: 'process-key', AZURE_OPENAI_API_KEY: 'legacy-process-key' });
    expect(
      resolveProviderApiKey({}, { AZURE_OPENAI_API_KEY: 'legacy-provider-key' }, defaults),
    ).toBe('legacy-provider-key');
    expect(resolveProviderApiKey({}, undefined, defaults)).toBe('process-key');
    mockProcessEnv({ AZURE_API_KEY: undefined });
    expect(resolveProviderApiKey({}, undefined, defaults)).toBe('legacy-process-key');
  });
});
