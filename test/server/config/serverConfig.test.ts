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

  it.each([{}, 'invalid', { providers: 'invalid' }])(
    'keeps empty or invalid existing catalogs restricted: %j',
    async (config) => {
      expect(await loadWith(config)).toEqual([]);
      const mod = await import('../../../src/server/config/serverConfig');
      expect(mod.hasCustomProviderConfig()).toBe(true);
    },
  );

  it('keeps a malformed file restricted', async () => {
    mocks.loadYaml.mockImplementation(() => {
      throw new Error('Invalid YAML');
    });
    const mod = await import('../../../src/server/config/serverConfig');
    expect(mod.getAvailableProviders()).toEqual([]);
    expect(mod.hasCustomProviderConfig()).toBe(true);
  });

  it('caches catalog contents and presence together until restart', async () => {
    const approved = { id: 'echo', label: 'Approved' };
    expect(await loadWith({ providers: [approved] })).toEqual([approved]);
    const mod = await import('../../../src/server/config/serverConfig');
    expect(mod.hasCustomProviderConfig()).toBe(true);

    mocks.loadYaml.mockReturnValue({ providers: [{ id: 'echo', label: 'Changed' }] });
    expect(mod.getAvailableProviders()).toEqual([approved]);
    mocks.existsSync.mockReturnValue(false);
    expect(mod.getAvailableProviders()).toEqual([approved]);
    expect(mod.hasCustomProviderConfig()).toBe(true);
    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const restarted = await import('../../../src/server/config/serverConfig');
    expect(restarted.getAvailableProviders()).toEqual([]);
    expect(restarted.hasCustomProviderConfig()).toBe(false);

    mocks.existsSync.mockReturnValue(true);
    expect(restarted.getAvailableProviders()).toEqual([]);
    expect(restarted.hasCustomProviderConfig()).toBe(false);
    vi.resetModules();
    const reloaded = await import('../../../src/server/config/serverConfig');
    expect(reloaded.getAvailableProviders()).toEqual([{ id: 'echo', label: 'Changed' }]);
    expect(reloaded.hasCustomProviderConfig()).toBe(true);
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
