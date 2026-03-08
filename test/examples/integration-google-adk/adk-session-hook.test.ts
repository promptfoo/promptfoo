import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HOOK_PATH = path.resolve(
  process.cwd(),
  'examples/integration-google-adk/adk-session-hook.js',
);
const HOOK_EXTENSION = `file://${HOOK_PATH}:adkSessionHook`;
const originalEnv = { ...process.env };

describe('integration-google-adk session hook', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      IS_TESTING: 'true',
    };
    vi.doMock('../../../src/telemetry', () => ({
      default: {
        record: vi.fn(),
        shutdown: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('creates and cleans up all referenced sessions through the extension hook loader', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'session-alpha' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'session-beta' }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    const { runExtensionHook } = await import('../../../src/evaluatorHelpers');

    const context = {
      suite: {
        tests: [
          { vars: { session_id: 'session-alpha' } },
          { vars: { session_id: 'session-beta' } },
        ],
      },
    };

    await runExtensionHook([HOOK_EXTENSION], 'beforeAll', context as any);

    expect(context).toHaveProperty('_adkSessionIds', ['session-alpha', 'session-beta']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/session-alpha',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/session-beta',
      expect.objectContaining({ method: 'POST' }),
    );

    await runExtensionHook([HOOK_EXTENSION], 'afterAll', context as any);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/session-alpha',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/session-beta',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('falls back to the default conversation session when no session ids are provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'conversation' }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    const { runExtensionHook } = await import('../../../src/evaluatorHelpers');

    const context = {
      suite: {
        tests: [{ vars: {} }],
      },
    };

    await runExtensionHook([HOOK_EXTENSION], 'beforeAll', context as any);
    expect(context).toHaveProperty('_adkSessionIds', ['conversation']);

    await runExtensionHook([HOOK_EXTENSION], 'afterAll', context as any);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/conversation',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/apps/weather_agent/users/test_user/sessions/conversation',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
