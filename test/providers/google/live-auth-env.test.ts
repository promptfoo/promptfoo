import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GoogleAuth } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getEnvOverrides } from '../../../src/envars';
import { loadApiProvider } from '../../../src/providers';
import { GoogleLiveProvider } from '../../../src/providers/google/live';
import { getProviderFromCloud } from '../../../src/util/cloud';
import { mockProcessEnv } from '../../util/utils';

import type { CompletionOptions } from '../../../src/providers/google/types';

vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn() }));
vi.mock('../../../src/util/cloud', async (original) => ({
  ...(await original()),
  getProviderFromCloud: vi.fn(),
}));

let restoreEnv: () => void;
let tempDir: string;

beforeEach(() => {
  restoreEnv = mockProcessEnv({
    GOOGLE_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    PALM_API_KEY: undefined,
    VERTEX_API_KEY: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
  });
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-live-auth-'));
  vi.mocked(GoogleAuth)
    .mockReset()
    .mockImplementation(function () {
      return {
        getClient: async () => ({ getAccessToken: async () => ({ token: 'fixture-token' }) }),
        getProjectId: async () => 'fixture-project',
      } as unknown as GoogleAuth;
    });
  vi.mocked(getProviderFromCloud).mockReset();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function connection(
  provider: GoogleLiveProvider,
  config: CompletionOptions = provider.config,
) {
  return cliState.withEnv(getEnvOverrides() ?? {}, () =>
    (
      provider as unknown as {
        getConnection(config: CompletionOptions): Promise<{ url: string }>;
      }
    ).getConnection(config),
  );
}

async function expectAuth(provider: GoogleLiveProvider, adc: boolean) {
  const result = await connection(provider);
  expect(result.url).toContain(adc ? 'access_token=fixture-token' : 'key=fixture-key');
  if (adc) {
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: 'fixture-adc.json' }),
    );
  } else {
    expect(GoogleAuth).not.toHaveBeenCalled();
  }
}

describe.each(['google:live:gemini-3.8-live', 'palm:live:gemini-3.8-live'])(
  '%s scoped authentication',
  (id) => {
    it.each(['direct', 'loaded'] as const)(
      'uses higher ADC before a lower key (%s)',
      async (kind) => {
        await cliState.withEnv({ GOOGLE_API_KEY: 'lower-key' }, async () => {
          const options = { env: { GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json' } };
          const provider =
            kind === 'direct'
              ? new GoogleLiveProvider('gemini-3.8-live', options)
              : ((await loadApiProvider(id, { options })) as GoogleLiveProvider);
          await expectAuth(provider, true);
        });
      },
    );

    it.each(['direct', 'loaded'] as const)(
      'keeps a higher key before lower ADC (%s)',
      async (kind) => {
        await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json' }, async () => {
          const options = { env: { GEMINI_API_KEY: 'fixture-key' } };
          const provider =
            kind === 'direct'
              ? new GoogleLiveProvider('gemini-3.8-live', options)
              : ((await loadApiProvider(id, { options })) as GoogleLiveProvider);
          await expectAuth(provider, false);
        });
      },
    );

    it('uses suite ADC before a file key', async () => {
      await cliState.withEnvFileOverrides({ GOOGLE_API_KEY: 'lower-key' }, () =>
        cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json' }, async () =>
          expectAuth(new GoogleLiveProvider('gemini-3.8-live', {}), true),
        ),
      );
    });

    it('keeps same-layer ADC ahead of a key', async () => {
      const provider = (await loadApiProvider(id, {
        options: {
          env: { GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json', GOOGLE_API_KEY: 'lower-key' },
        },
      })) as GoogleLiveProvider;
      await expectAuth(provider, true);
    });

    it.each(['direct', 'loaded'] as const)(
      'rejects an empty ADC mask before lower keys (%s)',
      async (kind) => {
        await cliState.withEnv({ GOOGLE_API_KEY: 'lower-key' }, async () => {
          const options = { env: { GOOGLE_APPLICATION_CREDENTIALS: '' } };
          const provider =
            kind === 'direct'
              ? new GoogleLiveProvider('gemini-3.8-live', options)
              : ((await loadApiProvider(id, { options })) as GoogleLiveProvider);
          await expect(connection(provider)).rejects.toThrow(
            'Scoped GOOGLE_APPLICATION_CREDENTIALS is empty',
          );
          expect(GoogleAuth).not.toHaveBeenCalled();
        });
      },
    );

    it('lets an empty key mask reach lower ADC rather than another lower key', async () => {
      await cliState.withEnvFileOverrides(
        { GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json', GEMINI_API_KEY: 'lower-key' },
        () =>
          cliState.withEnv({ GOOGLE_API_KEY: '' }, async () =>
            expectAuth(new GoogleLiveProvider('gemini-3.8-live', {}), true),
          ),
      );
    });

    it.each(['', 'incidental-host-adc.json'])(
      'keeps host API keys ahead of incidental host ADC (%s)',
      async (adc) => {
        mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: adc, GOOGLE_API_KEY: 'fixture-key' });
        await expectAuth(new GoogleLiveProvider('gemini-3.8-live', {}), false);
      },
    );

    it('keeps explicit config keys ahead of scoped ADC', async () => {
      const provider = (await loadApiProvider(id, {
        options: { config: { apiKey: 'fixture-key' }, env: { GOOGLE_APPLICATION_CREDENTIALS: '' } },
      })) as GoogleLiveProvider;
      await expectAuth(provider, false);
    });

    it.each(['file', 'nested-file', 'cloud-file'] as const)(
      'preserves auth layer ordering through %s wrappers',
      async (kind) => {
        const inner = path.join(tempDir, 'inner.yaml');
        fs.writeFileSync(
          inner,
          JSON.stringify({ id, env: { GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json' } }),
        );
        let route = `file://${inner}`;
        if (kind !== 'file') {
          const outer = path.join(tempDir, 'outer.yaml');
          fs.writeFileSync(
            outer,
            JSON.stringify({ id: '{{ env.LIVE_INNER }}', env: { LIVE_INNER: route } }),
          );
          route = `file://${outer}`;
        }
        if (kind === 'cloud-file') {
          vi.mocked(getProviderFromCloud).mockResolvedValue({ id: route });
          route = 'promptfoo://provider/12345678-1234-1234-1234-123456789abc';
        }
        const provider = (await loadApiProvider(route, {
          options: { env: { GEMINI_API_KEY: 'fixture-key', LIVE_INNER: `file://${inner}` } },
        })) as GoogleLiveProvider;
        await expectAuth(provider, false);
      },
    );
  },
);
