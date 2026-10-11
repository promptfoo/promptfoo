import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  loadYaml: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

vi.mock('../../../src/util/yamlLoad', () => ({
  loadYaml: mocks.loadYaml,
}));

describe('getAvailableProviders configured provider catalog', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue('providers: []');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  async function loadWith(config: unknown) {
    mocks.loadYaml.mockReturnValue(config);
    const mod = await import('../../../src/server/config/serverConfig');
    return mod.getAvailableProviders();
  }

  it('returns empty array when no providers are configured', async () => {
    const providers = await loadWith({});
    expect(providers).toEqual([]);
  });

  it('skips entries whose id is not a non-empty string', async () => {
    const providers = await loadWith({
      providers: [{ id: 123 }, { id: '' }, { id: 'openai:gpt-4o-mini' }],
    });
    expect(providers).toEqual([{ id: 'openai:gpt-4o-mini' }]);
  });

  it('preserves arbitrary string environment overrides from configured providers', async () => {
    const provider = {
      id: 'openai:chat:internal',
      config: { apiKeyEnvar: 'TEAM_KEY' },
      env: { TEAM_KEY: 'fixture' },
    };
    expect(await loadWith({ providers: [provider] })).toEqual([provider]);
  });

  it('skips entries with labels the UI cannot render', async () => {
    const providers = await loadWith({
      providers: [{ id: 'openai:gpt-4o-mini', label: { name: 'Internal' } }],
    });
    expect(providers).toEqual([]);
  });
});
