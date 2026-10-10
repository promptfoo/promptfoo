import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('getAvailableProviders ui-providers.yaml hardening', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue('providers: []');
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

  it('drops non-string labels instead of serving an unrenderable value', async () => {
    const providers = await loadWith({
      providers: [{ id: 'openai:gpt-4o-mini', label: { name: 'Internal' } }],
    });
    expect(providers).toEqual([{ id: 'openai:gpt-4o-mini', label: undefined }]);
  });
});
