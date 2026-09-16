import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('prefers explicit keys over provider and process environments', () => {
    mockProcessEnv({ OPENAI_API_KEY: 'process-key' });
    expect(
      resolveProviderApiKey({ apiKey: 'configured-key' }, { OPENAI_API_KEY: 'provider-key' }, [
        'OPENAI_API_KEY',
      ]),
    ).toBe('configured-key');
  });

  it.each(['configured', 'provider-env', 'process-env'] as const)(
    'does not use a redaction marker as a %s credential',
    (source) => {
      mockProcessEnv({
        AZURE_API_KEY: source === 'process-env' ? '[REDACTED]' : 'fallback-key',
        AZURE_OPENAI_API_KEY: 'legacy-key',
      });
      const config = source === 'configured' ? { apiKey: '[REDACTED]' } : {};
      const env = source === 'provider-env' ? { AZURE_API_KEY: '[REDACTED]' } : undefined;
      expect(resolveProviderApiKey(config, env, defaults)).toBe(
        source === 'process-env' ? 'legacy-key' : 'fallback-key',
      );
      expect(config).toEqual(source === 'configured' ? { apiKey: '[REDACTED]' } : {});
    },
  );

  it('returns no credential when every available value is redacted', () => {
    mockProcessEnv({ AZURE_API_KEY: '[REDACTED]', AZURE_OPENAI_API_KEY: '[REDACTED]' });
    expect(
      resolveProviderApiKey({ apiKey: '[REDACTED]' }, { AZURE_API_KEY: '[REDACTED]' }, defaults),
    ).toBeUndefined();
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
