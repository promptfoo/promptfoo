import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { loadApiProvider } from '../../src/providers/index';
import { createNscaleProvider } from '../../src/providers/nscale';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { mockProcessEnv } from '../util/utils';

function apiKey(provider: object): string | undefined {
  return Reflect.get(provider, 'getApiKey').call(provider);
}

const routes = [
  ['replicate:owner/model', 'REPLICATE_API_KEY', 'REPLICATE_API_TOKEN'],
  ['replicate:image:owner/model', 'REPLICATE_API_KEY', 'REPLICATE_API_TOKEN'],
  ['replicate:moderation:owner/model', 'REPLICATE_API_KEY', 'REPLICATE_API_TOKEN'],
  ['nscale:chat:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
  ['nscale:completion:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
  ['nscale:embedding:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
  ['nscale:embeddings:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
  ['nscale:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
  ['nscale:image:model', 'NSCALE_SERVICE_TOKEN', 'NSCALE_API_KEY'],
] as const;

describe('native credential alias scopes', () => {
  let restoreEnv: () => void;
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-native-alias-'));
    restoreEnv = mockProcessEnv({}, { clear: true });
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  describe.each(['direct', 'file'] as const)('%s provider configuration', (kind) => {
    it.each(routes)(
      '%s gives the provider alias priority over the suite alias',
      async (route, first, second) => {
        const options = ProviderOptionsSchema.parse({
          id: route,
          env: { [second]: 'provider-key' },
        });
        const file = path.join(directory, 'provider.json');
        fs.writeFileSync(file, JSON.stringify(options));
        const provider = await cliState.withEnv({ [first]: 'suite-key' }, () =>
          loadApiProvider(kind === 'file' ? `file://${file}` : route, {
            ...(kind === 'direct' ? { options } : {}),
          }),
        );
        expect(apiKey(provider)).toBe('provider-key');
      },
    );
  });

  describe.each(routes.filter(([route]) => route.startsWith('replicate:')))(
    '%s credential masks',
    (route) => {
      it.each([
        [{ REPLICATE_API_KEY: '', REPLICATE_API_TOKEN: '' }, undefined],
        [{ REPLICATE_API_TOKEN: '' }, 'host-key'],
        [{ REPLICATE_API_KEY: '' }, 'host-token'],
        [
          { REPLICATE_API_KEY: 'provider-key', REPLICATE_API_TOKEN: 'provider-token' },
          'provider-key',
        ],
        [{}, 'host-token'],
      ])('preserves per-name masks and legacy alias order: %j', async (env, expected) => {
        mockProcessEnv({ REPLICATE_API_KEY: 'host-key', REPLICATE_API_TOKEN: 'host-token' });
        const provider = await loadApiProvider(route, {
          options: ProviderOptionsSchema.parse({ env }),
        });
        expect(apiKey(provider)).toBe(expected);
      });

      it('does not revive the only available host alias after an empty mask', async () => {
        mockProcessEnv({ REPLICATE_API_KEY: 'host-key' });
        const provider = await loadApiProvider(route, {
          options: ProviderOptionsSchema.parse({ env: { REPLICATE_API_KEY: '' } }),
        });
        expect(apiKey(provider)).toBeUndefined();
      });
    },
  );

  it.each(['chat', 'completion', 'embedding'])(
    'reuses an unbound Nscale %s provider across native credential aliases',
    async (mode) => {
      mockProcessEnv({ NSCALE_SERVICE_TOKEN: 'host-service' });
      const provider = createNscaleProvider(`nscale:${mode}:model`);
      for (const [env, expected] of [
        [{ NSCALE_SERVICE_TOKEN: 'scope-service' }, 'scope-service'],
        [{ NSCALE_API_KEY: 'scope-key' }, 'scope-key'],
        [{ NSCALE_SERVICE_TOKEN: 'scope-service' }, 'scope-service'],
      ] as const) {
        await cliState.withEnv(env, async () => {
          expect(apiKey(provider)).toBe(expected);
        });
      }
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s prefers a same-scope service token and supports the legacy key alone',
    async (route) => {
      const both = await loadApiProvider(route, {
        options: { env: { NSCALE_SERVICE_TOKEN: 'service', NSCALE_API_KEY: 'legacy' } },
      });
      expect(apiKey(both)).toBe('service');
      const legacy = await loadApiProvider(route, {
        options: { env: { NSCALE_API_KEY: 'legacy' } },
      });
      expect(apiKey(legacy)).toBe('legacy');
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s does not borrow a host OpenAI key when native credentials are absent',
    async (route) => {
      mockProcessEnv({ OPENAI_API_KEY: 'host-openai' });
      const provider = await loadApiProvider(route);
      expect(apiKey(provider)).toBeUndefined();
      await expect(provider.callApi('offline fixture')).rejects.toThrow('NSCALE_SERVICE_TOKEN');
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s resolves native aliases by scope and retains per-variable masks',
    async (route) => {
      mockProcessEnv({ NSCALE_SERVICE_TOKEN: 'host-service', NSCALE_API_KEY: 'host-key' });
      const provider = await loadApiProvider(route, {
        options: ProviderOptionsSchema.parse({
          env: { NSCALE_SERVICE_TOKEN: '', NSCALE_API_KEY: 'provider-key' },
        }),
      });
      expect(apiKey(provider)).toBe('provider-key');
      const masked = await loadApiProvider(route, {
        options: ProviderOptionsSchema.parse({
          env: { NSCALE_SERVICE_TOKEN: '', NSCALE_API_KEY: '' },
        }),
      });
      expect(apiKey(masked)).toBeUndefined();
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s allows an unmasked file alias after a higher empty mask',
    async (route) => {
      mockProcessEnv({ NSCALE_SERVICE_TOKEN: 'host-service' });
      await cliState.withEnvFileOverrides({ NSCALE_API_KEY: 'file-key' }, async () => {
        const provider = await loadApiProvider(route, {
          options: ProviderOptionsSchema.parse({ env: { NSCALE_SERVICE_TOKEN: '' } }),
        });
        expect(apiKey(provider)).toBe('file-key');
      });
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s preserves explicit named credentials without native fallback',
    async (route) => {
      mockProcessEnv({ OPENAI_API_KEY: 'host-openai', NSCALE_SERVICE_TOKEN: 'host-service' });
      const options = ProviderOptionsSchema.parse({
        config: { apiKeyEnvar: 'OPENAI_API_KEY' },
        env: { OPENAI_API_KEY: '' },
      });
      expect(apiKey(await loadApiProvider(route, { options }))).toBeUndefined();
      expect(
        apiKey(
          await loadApiProvider(route, {
            options: { ...options, config: { ...options.config, apiKey: 'explicit' } },
          }),
        ),
      ).toBe('explicit');
    },
  );

  it.each(['nscale:chat:model', 'nscale:image:model'])(
    '%s preserves host-only service-token priority and undefined overlays',
    async (route) => {
      mockProcessEnv({ NSCALE_SERVICE_TOKEN: 'host-service', NSCALE_API_KEY: 'host-key' });
      expect(apiKey(await loadApiProvider(route))).toBe('host-service');
      expect(
        apiKey(
          await loadApiProvider(route, {
            env: { NSCALE_API_KEY: 'suite-key' },
            options: { env: { NSCALE_API_KEY: undefined } },
          }),
        ),
      ).toBe('suite-key');
    },
  );
});
