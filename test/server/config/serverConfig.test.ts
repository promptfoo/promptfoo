import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// loadServerConfig caches at module scope, so each test re-imports fresh modules
// (vi.resetModules in beforeEach) and configures the fs mock the fresh instance sees.
async function getProvidersForConfig(yamlContent: string) {
  const fs = await import('fs');
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);
  const { getAvailableProviders } = await import('../../../src/server/config/serverConfig');
  return getAvailableProviders();
}

describe('getAvailableProviders', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('serves string and object providers from ui-providers.yaml', async () => {
    const providers = await getProvidersForConfig(
      [
        'providers:',
        '  - openai:chat:gpt-5.6',
        '  - id: openai:chat:custom',
        "    label: 'Custom'",
      ].join('\n'),
    );

    expect(providers).toEqual([
      expect.objectContaining({ id: 'openai:chat:gpt-5.6' }),
      expect.objectContaining({ id: 'openai:chat:custom', label: 'Custom' }),
    ]);
  });

  it('skips providers whose id is not a string so one bad entry cannot 500 the catalog route', async () => {
    // GET /api/providers validates its response with a strict string-id schema;
    // a non-string id passing through here would fail that parse on every request.
    const providers = await getProvidersForConfig(
      ['providers:', '  - id: 123', '  - openai:chat:gpt-5.6'].join('\n'),
    );

    expect(providers).toEqual([expect.objectContaining({ id: 'openai:chat:gpt-5.6' })]);
  });

  it('skips providers with an empty id', async () => {
    const providers = await getProvidersForConfig(
      ['providers:', "  - id: ''", '  - openai:chat:gpt-5.6'].join('\n'),
    );

    expect(providers).toEqual([expect.objectContaining({ id: 'openai:chat:gpt-5.6' })]);
  });

  it('skips providers whose id contains only whitespace', async () => {
    const providers = await getProvidersForConfig(
      ['providers:', "  - id: '   '", '  - openai:chat:gpt-5.6'].join('\n'),
    );

    expect(providers).toEqual([expect.objectContaining({ id: 'openai:chat:gpt-5.6' })]);
  });

  it('drops non-string labels so catalog entries remain safe to render', async () => {
    const providers = await getProvidersForConfig(
      ['providers:', '  - id: openai:chat:gpt-5.6', '    label:', '      name: Internal'].join(
        '\n',
      ),
    );

    expect(providers).toEqual([{ id: 'openai:chat:gpt-5.6' }]);
  });

  it('keeps a loaded custom catalog restricted after its file is removed', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('providers:\n  - echo');
    const serverConfig = await import('../../../src/server/config/serverConfig');

    expect(serverConfig.getAvailableProviders()).toEqual([{ id: 'echo' }]);
    expect(serverConfig.hasCustomProviderConfig()).toBe(true);

    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(serverConfig.hasCustomProviderConfig()).toBe(true);
    expect(serverConfig.getAvailableProviders()).toEqual([{ id: 'echo' }]);
  });

  it('keeps unrestricted startup state cached when a file appears later', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const serverConfig = await import('../../../src/server/config/serverConfig');

    expect(serverConfig.hasCustomProviderConfig()).toBe(false);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('providers:\n  - echo');

    expect(serverConfig.hasCustomProviderConfig()).toBe(false);
    expect(serverConfig.getAvailableProviders()).toEqual([]);
  });

  it('keeps an invalid custom catalog restricted', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('providers: [');
    const serverConfig = await import('../../../src/server/config/serverConfig');

    expect(serverConfig.getAvailableProviders()).toEqual([]);
    expect(serverConfig.hasCustomProviderConfig()).toBe(true);
  });
});
