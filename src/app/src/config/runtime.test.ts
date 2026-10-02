import { createMockResponse, resetCallApiMock } from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('runtime config', () => {
  beforeEach(() => {
    vi.resetModules();
    resetCallApiMock();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads web viewer table defaults from the server', async () => {
    vi.mocked(callApi).mockResolvedValue(
      createMockResponse({
        tableSettings: {
          prettifyJson: true,
          showPassFail: false,
        },
      }),
    );
    const { getRuntimeConfig, loadRuntimeConfig } = await import('./runtime');

    await loadRuntimeConfig();

    expect(callApi).toHaveBeenCalledWith('/app-config');
    expect(getRuntimeConfig()).toEqual({
      tableSettings: {
        prettifyJson: true,
        showPassFail: false,
      },
    });
  });

  it.each([
    ['a failed response', createMockResponse({}, { ok: false })],
    ['an invalid response', createMockResponse({ tableSettings: {} })],
  ])('keeps built-in defaults for %s', async (_label, response) => {
    vi.mocked(callApi).mockResolvedValue(response);
    const { getRuntimeConfig, loadRuntimeConfig } = await import('./runtime');

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toEqual({
      tableSettings: {
        prettifyJson: false,
        showPassFail: true,
      },
    });
  });

  it('keeps built-in defaults when the request fails', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('offline'));
    const { getRuntimeConfig, loadRuntimeConfig } = await import('./runtime');

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toEqual({
      tableSettings: {
        prettifyJson: false,
        showPassFail: true,
      },
    });
  });
});
