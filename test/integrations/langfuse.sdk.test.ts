import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

// Exercise the installed SDK and Promptfoo's compatibility gate; only HTTP is mocked.
describe('Langfuse prompt management with the installed SDK', () => {
  let restoreEnv: () => void;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    restoreEnv = mockProcessEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
      LANGFUSE_HOST: 'https://langfuse.example.com',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    restoreEnv();
  });

  it.each(['text', 'chat'] as const)('fetches and compiles a %s prompt by label', async (type) => {
    fetchMock.mockResolvedValue(
      Response.json({
        name: 'greeting',
        version: 3,
        type,
        prompt:
          type === 'text'
            ? 'Hello {{name}}, count {{count}}'
            : [{ role: 'user', content: 'Hello {{name}}, count {{count}}' }],
        config: {},
        labels: ['production'],
        tags: [],
      }),
    );
    const { getPrompt } = await import('../../src/integrations/langfuse');

    const output = await getPrompt(
      'greeting',
      { name: 'World', count: 2 },
      type,
      undefined,
      'production',
    );

    expect(output).toBe(
      type === 'text'
        ? 'Hello World, count 2'
        : JSON.stringify([{ role: 'user', content: 'Hello World, count 2' }]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/api/public/v2/prompts/greeting');
    expect(new URL(String(url)).searchParams.get('label')).toBe('production');
    expect(options?.method).toBe('GET');
    expect(new Headers(options?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`,
    );
  });

  it('preserves prompt and version context when the SDK returns a missing-prompt error', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'Prompt not found' }, { status: 404 }));
    const { getPrompt } = await import('../../src/integrations/langfuse');

    await expect(getPrompt('missing', {}, 'text', 7)).rejects.toThrow(
      'Failed to fetch Langfuse prompt "missing" version 7',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('version')).toBe('7');
  });
});
