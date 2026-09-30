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
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

const config = {
  id: 'huggingface:chat:fixture-model',
  env: { HF_TOKEN: 'named-template-token' },
  config: { apiKey: '{{env.HF_TOKEN}}' },
};
const explicit = (provider: object) => Reflect.get(provider, 'getApiKey').call(provider);

describe('explicit environment templates across credential aliases', () => {
  it('retains named suite values for inline explicit config and labels', async () => {
    const provider = await loadApiProvider(config.id, {
      env: config.env,
      options: {
        config: config.config,
        label: '{{env.HF_TOKEN}}',
        env: { HF_API_TOKEN: 'implicit-provider-token' },
      },
    });
    expect(explicit(provider)).toBe('named-template-token');
    expect(provider.label).toBe('named-template-token');
  });
  it('retains named file values for explicit config before implicit alias precedence', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-template-'));
    const file = path.join(dir, 'provider.json');
    fs.writeFileSync(file, JSON.stringify(config));
    try {
      const provider = await loadApiProvider(`file://${file}`, {
        options: { env: { HF_API_TOKEN: 'implicit-provider-token' } },
      });
      expect(explicit(provider)).toBe('named-template-token');
      const implicitConfig = { ...config, config: {} };
      fs.writeFileSync(file, JSON.stringify(implicitConfig));
      const implicit = await loadApiProvider(`file://${file}`, {
        options: { env: { HF_API_TOKEN: 'implicit-provider-token' } },
      });
      expect(explicit(implicit)).toBe('implicit-provider-token');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('retains named cloud values for explicit config before implicit alias precedence', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue(config);
    const provider = await loadApiProvider(
      'promptfoo://provider/00000000-0000-0000-0000-000000000001',
      { options: { env: { HF_API_TOKEN: 'implicit-provider-token' } } },
    );
    expect(explicit(provider)).toBe('named-template-token');
  });
});

describe('referenced provider template boundaries', () => {
  const cloudPath = 'promptfoo://provider/00000000-0000-0000-0000-000000000001';
  it.each(['PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'PROMPTFOO_DISABLE_TEMPLATING'])(
    'applies %s from both cloud and local env before rendering',
    async (flag) => {
      mockProcessEnv({ FIXTURE_MARKER: 'shell-fixture' });
      for (const source of ['cloud', 'local']) {
        vi.mocked(getProviderFromCloud).mockResolvedValue({
          id: config.id,
          config: { apiKey: '{{env.FIXTURE_MARKER}}' },
          ...(source === 'cloud' ? { env: { [flag]: 'true' } } : {}),
        });
        const provider = await loadApiProvider(cloudPath, {
          options: source === 'local' ? { env: { [flag]: 'true' } } : {},
        });
        expect(explicit(provider)).toBe('{{env.FIXTURE_MARKER}}');
      }
    },
  );
  it.each(['file', 'cloud'])('renders %s configuration and labels once', async (source) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-template-once-'));
    try {
      const referenced = {
        id: config.id,
        label: '{{env.FIXTURE_MARKER}}',
        env: { FIXTURE_MARKER: '{{env.OTHER_FIXTURE}}', OTHER_FIXTURE: 'second-pass-fixture' },
        config: { apiKey: '{{env.FIXTURE_MARKER}}' },
      };
      const file = path.join(dir, 'provider.json');
      fs.writeFileSync(file, JSON.stringify(referenced));
      vi.mocked(getProviderFromCloud).mockResolvedValue(referenced);
      const provider = await loadApiProvider(source === 'file' ? `file://${file}` : cloudPath);
      expect(explicit(provider)).toBe('{{env.OTHER_FIXTURE}}');
      expect(provider.label).toBe('{{env.OTHER_FIXTURE}}');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each(['file', 'cloud'])(
    'keeps the resolved %s provider id when aliases select a different implicit region',
    async (source) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-template-id-'));
      try {
        const referenced = {
          id: 'sagemaker:llama:{{env.AWS_REGION}}-fixture',
          env: { AWS_REGION: 'us-east-1' },
        };
        const file = path.join(dir, 'provider.json');
        fs.writeFileSync(file, JSON.stringify(referenced));
        vi.mocked(getProviderFromCloud).mockResolvedValue(referenced);
        const provider = await loadApiProvider(source === 'file' ? `file://${file}` : cloudPath, {
          options: { env: { AWS_DEFAULT_REGION: 'us-west-2' } },
        });
        expect(provider.id()).toBe('sagemaker:llama:us-east-1-fixture');
        expect(Reflect.get(provider, 'getEndpointName').call(provider)).toBe('us-east-1-fixture');
        expect(Reflect.get(provider, 'getRegion').call(provider)).toBe('us-west-2');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
