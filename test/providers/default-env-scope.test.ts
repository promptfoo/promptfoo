import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getAnthropicProviders } from '../../src/providers/anthropic/defaults';
import {
  AnthropicGenericProvider,
  buildIsolatedAnthropicClientOptions,
} from '../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { getDefaultProviders } from '../../src/providers/defaults';
import { hasGoogleDefaultCredentials } from '../../src/providers/google/util';
import { hasCodexDefaultCredentials } from '../../src/providers/openai/codexDefaults';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/google/util')>()),
  hasGoogleDefaultCredentials: vi.fn(),
}));
vi.mock('../../src/providers/openai/codexDefaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/openai/codexDefaults')>()),
  hasCodexDefaultCredentials: vi.fn(),
}));

function clientOptions(provider: AnthropicGenericProvider) {
  return Reflect.get(provider.anthropic, '_options');
}

describe('default provider environment ownership', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.mocked(hasGoogleDefaultCredentials).mockReset().mockResolvedValue(false);
    vi.mocked(hasCodexDefaultCredentials).mockReset().mockReturnValue(false);
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('creates new Anthropic clients for sequential scopes with omitted or partial env arguments', () => {
    for (const explicit of [undefined, { ANTHROPIC_BASE_URL: 'https://explicit.example.test' }]) {
      const bundles = ['first', 'second'].map((name) =>
        cliState.withEnv(
          {
            ANTHROPIC_API_KEY: `${name}-key`,
            ANTHROPIC_BASE_URL: `https://${name}.example.test`,
            ANTHROPIC_CUSTOM_HEADERS: `X-Scope: ${name}`,
          },
          () => getAnthropicProviders(explicit),
        ),
      );
      expect(bundles[0].gradingProvider).not.toBe(bundles[1].gradingProvider);
      for (const [i, bundle] of bundles.entries()) {
        for (const provider of [
          bundle.gradingProvider,
          bundle.llmRubricProvider,
          bundle.webSearchProvider,
        ]) {
          const options = clientOptions(provider as AnthropicGenericProvider);
          const name = i === 0 ? 'first' : 'second';
          expect(options.apiKey).toBe(`${name}-key`);
          expect(options.baseURL).toBe(
            explicit?.ANTHROPIC_BASE_URL ?? `https://${name}.example.test`,
          );
          expect(options.defaultHeaders['X-Scope']).toBe(name);
        }
      }
    }
  });
  it('isolates overlapping async default selections', async () => {
    const bundles = await Promise.all(
      ['first', 'second'].map((name) =>
        cliState.withEnv({ ANTHROPIC_API_KEY: `${name}-key` }, async () => {
          await Promise.resolve();
          return getDefaultProviders();
        }),
      ),
    );
    expect(clientOptions(bundles[0].gradingProvider as AnthropicGenericProvider).apiKey).toBe(
      'first-key',
    );
    expect(clientOptions(bundles[1].gradingProvider as AnthropicGenericProvider).apiKey).toBe(
      'second-key',
    );
  });
  it.each(['OPENAI_API_KEY', 'MISTRAL_API_KEY'])(
    'retains explicit %s for the returned default bundle',
    async (key) => {
      const bundles = await Promise.all(
        ['first', 'second'].map((name) => getDefaultProviders({ [key]: `${name}-key` })),
      );
      await cliState.withEnv({ [key]: 'later-suite-key' }, async () => {
        for (const [i, bundle] of bundles.entries()) {
          for (const provider of [
            bundle.gradingProvider,
            bundle.gradingJsonProvider,
            bundle.embeddingProvider,
            bundle.suggestionsProvider,
          ]) {
            expect(Reflect.get(provider, 'getApiKey').call(provider)).toBe(
              i === 0 ? 'first-key' : 'second-key',
            );
          }
        }
      });
    },
  );
  it('prefers explicit Azure default deployment names to ambient deployments', async () => {
    await cliState.withEnv(
      {
        AZURE_OPENAI_DEPLOYMENT_NAME: 'suite-chat',
        AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'suite-embedding',
      },
      async () => {
        const providers = await getDefaultProviders({
          AZURE_OPENAI_API_KEY: 'fake-key',
          AZURE_OPENAI_API_HOST: 'example.test',
          AZURE_DEPLOYMENT_NAME: 'provider-chat',
          AZURE_OPENAI_DEPLOYMENT_NAME: 'provider-chat',
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'provider-embedding',
        });
        expect(providers.gradingProvider.id()).toContain('provider-chat');
        expect(providers.embeddingProvider.id()).toContain('provider-embedding');
      },
    );
  });

  it('passes invocation-file headers into the Anthropic SDK and suppresses inherited shell names', () => {
    mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Shell: shell-value\nX-Api-Key: shell-key' });
    cliState.withEnvFileOverrides({ ANTHROPIC_CUSTOM_HEADERS: 'X-File: file-value' }, () => {
      const provider = new AnthropicMessagesProvider('claude-sonnet-5', {
        config: { apiKey: 'fake-key' },
      });
      expect(clientOptions(provider).defaultHeaders).toMatchObject({
        'X-File': 'file-value',
        'X-Shell': null,
        'X-Api-Key': 'fake-key',
        'x-api-key': 'fake-key',
      });
      expect(Reflect.get(provider, 'hasCustomHeaders').call(provider)).toBe(true);
    });
  });
  it('preserves explicit empty header overrides and suppresses file/shell headers on foreign endpoints', () => {
    mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Shell: shell-value' });
    cliState.withEnvFileOverrides({ ANTHROPIC_CUSTOM_HEADERS: 'X-File: file-value' }, () => {
      cliState.withEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Suite: suite-value' }, () => {
        const provider = new AnthropicMessagesProvider('claude-sonnet-5', {
          env: { ANTHROPIC_CUSTOM_HEADERS: '' },
          config: { apiKey: 'fake-key' },
        });
        expect(clientOptions(provider).defaultHeaders['X-Shell']).toBeNull();
        expect(clientOptions(provider).defaultHeaders['X-File']).toBeUndefined();
        expect(clientOptions(provider).defaultHeaders['X-Suite']).toBeUndefined();
      });
      const foreign = buildIsolatedAnthropicClientOptions(
        { defaultHeaders: { 'X-File': 'file-value', 'X-Shell': 'shell-value' } },
        undefined,
        'foreign-key',
      );
      expect(foreign.defaultHeaders).toMatchObject({
        'X-File': null,
        'X-Shell': null,
        'x-api-key': 'foreign-key',
      });
    });
  });
});
