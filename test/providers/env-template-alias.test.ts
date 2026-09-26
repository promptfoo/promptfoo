import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers/index';
import { getProviderFromCloud } from '../../src/util/cloud';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/cloud')>()),
  getProviderFromCloud: vi.fn(),
}));
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({ HF_TOKEN: undefined, HF_API_TOKEN: undefined });
  vi.mocked(getProviderFromCloud).mockReset();
});
afterEach(() => { restore(); vi.restoreAllMocks(); });

const config = { id: 'huggingface:chat:fixture-model', env: { HF_TOKEN: 'named-template-token' }, config: { apiKey: '{{env.HF_TOKEN}}' } };
const explicit = (provider: object) => Reflect.get(provider, 'getApiKey').call(provider);

describe('explicit environment templates across credential aliases', () => {
  it('retains named suite values for inline explicit config and labels', async () => {
    const provider = await loadApiProvider(config.id, { env: config.env, options: { config: config.config, label: '{{env.HF_TOKEN}}', env: { HF_API_TOKEN: 'implicit-provider-token' } } });
    expect(explicit(provider)).toBe('named-template-token');
    expect(provider.label).toBe('named-template-token');
  });
  it('retains named file values for explicit config before implicit alias precedence', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-template-'));
    const file = path.join(dir, 'provider.json');
    fs.writeFileSync(file, JSON.stringify(config));
    try {
      const provider = await loadApiProvider(`file://${file}`, { options: { env: { HF_API_TOKEN: 'implicit-provider-token' } } });
      expect(explicit(provider)).toBe('named-template-token');
      const implicitConfig = { ...config, config: {} };
      fs.writeFileSync(file, JSON.stringify(implicitConfig));
      const implicit = await loadApiProvider(`file://${file}`, { options: { env: { HF_API_TOKEN: 'implicit-provider-token' } } });
      expect(explicit(implicit)).toBe('implicit-provider-token');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('retains named cloud values for explicit config before implicit alias precedence', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue(config);
    const provider = await loadApiProvider('promptfoo://provider/00000000-0000-0000-0000-000000000001', { options: { env: { HF_API_TOKEN: 'implicit-provider-token' } } });
    expect(explicit(provider)).toBe('named-template-token');
  });
});
