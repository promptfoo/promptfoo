import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/util/fetch/monkeyPatchFetch')>();
  return {
    ...actual,
    monkeyPatchFetch: vi.fn(),
  };
});

import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';
import { withPrivateRangeGuard } from '../../../src/util/fetch/guardContext';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';

const mockedMonkeyPatchFetch = vi.mocked(monkeyPatchFetch);

function getRequestUrl(call: unknown[]): string {
  const url = call[0];
  return typeof url === 'string' ? url : String(url);
}

describe('OpenAI assistant SDK transport under the private-range guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('never follows a public-to-private redirect from the SDK fetch', async () => {
    // The SDK's ordinary fetch would follow this 307 to link-local space
    // outside the guard. The guarded transport must refuse it instead.
    mockedMonkeyPatchFetch.mockImplementation(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        }),
    );

    const provider = new OpenAiAssistantProvider('asst_guard_test', {
      config: { apiKey: 'guard-test-key', apiBaseUrl: 'https://192.0.2.1' },
    });

    const result = await withPrivateRangeGuard(() => provider.callApi('ping'));

    expect(result.error).toBeDefined();
    expect(mockedMonkeyPatchFetch).toHaveBeenCalled();
    // Every attempt went to the public base URL; the private hop was never
    // requested, even across SDK retries.
    for (const call of mockedMonkeyPatchFetch.mock.calls) {
      expect(getRequestUrl(call)).toMatch(/^https:\/\/192\.0\.2\.1\//);
      expect(getRequestUrl(call)).not.toContain('169.254.169.254');
    }
  });

  it('uses the plain global fetch outside the guard context', async () => {
    // Outside a guarded server-route context the provider keeps its
    // previous transport: the guarded fetch delegates to global fetch, so
    // fetchWithProxy (and its redirect validation) is never entered. Serve
    // a full completed run through the global fetch spy and assert every
    // SDK request went through it.
    const jsonResponse = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const completedRun = { id: 'run_123', thread_id: 'thread_123', status: 'completed' };
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlString = String(url);
      if (urlString.includes('/messages/')) {
        return jsonResponse({
          role: 'assistant',
          content: [{ type: 'text', text: { value: 'Test response' } }],
        });
      }
      if (urlString.includes('/steps')) {
        return jsonResponse({
          data: [
            {
              id: 'step_1',
              step_details: {
                type: 'message_creation',
                message_creation: { message_id: 'msg_1' },
              },
            },
          ],
        });
      }
      return jsonResponse(completedRun);
    });

    const provider = new OpenAiAssistantProvider('asst_guard_test', {
      config: { apiKey: 'guard-test-key', apiBaseUrl: 'https://192.0.2.1' },
    });

    try {
      const result = await provider.callApi('ping');

      expect(globalFetchSpy).toHaveBeenCalled();
      expect(mockedMonkeyPatchFetch).not.toHaveBeenCalled();
      expect(result.output).toBe('[Assistant] Test response');
    } finally {
      globalFetchSpy.mockRestore();
    }
  });
});
