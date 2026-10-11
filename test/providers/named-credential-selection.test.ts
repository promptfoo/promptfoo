import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { getProviderFromCloud } from '../../src/util/cloud';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviderFromCloud: vi.fn(),
}));

let directory: string;
let restoreEnv: () => void;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-named-key-'));
  restoreEnv = mockProcessEnv({ NSCALE_API_KEY: 'host-key' }, { clear: true });
  vi.mocked(getProviderFromCloud).mockReset();
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe.each(['direct', 'file', 'nested file', 'cloud'] as const)(
  '%s named credential',
  (kind) => {
    it.each(['nscale:chat:model', 'nscale:image:model'])(
      '%s retains the explicitly selected lower alias after the loader exits',
      async (route) => {
        const options = ProviderOptionsSchema.parse({
          id: route,
          config: { apiKeyEnvar: '{{ env.OPENAI_ORGANIZATION }}' },
          env: { NSCALE_SERVICE_TOKEN: 'provider-token', OPENAI_ORGANIZATION: 'NSCALE_API_KEY' },
        });
        const inner = path.join(directory, 'inner.json');
        fs.writeFileSync(inner, JSON.stringify(options));
        const outer = path.join(directory, 'outer.json');
        fs.writeFileSync(
          outer,
          JSON.stringify({
            id: '{{ env.OPENAI_API_BASE_URL }}',
          }),
        );
        mockProcessEnv({ OPENAI_API_BASE_URL: `file://${inner}` });
        vi.mocked(getProviderFromCloud).mockResolvedValue({ ...options, id: route });
        const providerPath =
          kind === 'direct'
            ? route
            : kind === 'cloud'
              ? 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
              : `file://${kind === 'file' ? inner : outer}`;
        const provider = await loadApiProvider(providerPath, {
          env: { NSCALE_API_KEY: 'suite-key' },
          ...(kind === 'direct' ? { options } : {}),
        });
        expect(Reflect.get(provider, 'getApiKey').call(provider)).toBe('suite-key');
      },
    );
  },
);

it.each([
  ['empty selected value', '', undefined],
  ['undefined overlay', undefined, 'suite-key'],
  ['explicit selected value', 'provider-key', 'provider-key'],
] as const)('keeps named credential precedence for %s', async (_name, selected, expected) => {
  const provider = await loadApiProvider('nscale:chat:model', {
    env: { NSCALE_API_KEY: 'suite-key' },
    options: {
      config: { apiKeyEnvar: 'NSCALE_API_KEY' },
      env: { NSCALE_API_KEY: selected, NSCALE_SERVICE_TOKEN: 'provider-token' },
    },
  });
  expect(Reflect.get(provider, 'getApiKey').call(provider)).toBe(expected);
});

it('retains host lookup when the selected name is absent from all supplied scopes', async () => {
  const provider = await loadApiProvider('nscale:chat:model', {
    options: {
      config: { apiKeyEnvar: 'NSCALE_API_KEY' },
      env: { NSCALE_SERVICE_TOKEN: 'provider-token' },
    },
  });
  expect(Reflect.get(provider, 'getApiKey').call(provider)).toBe('host-key');
});
