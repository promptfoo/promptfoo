import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('runtime config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads web viewer table defaults from the server', async () => {
    const { mockCallApiResponse } = await import('@app/tests/apiMocks');
    const callApiMock = mockCallApiResponse({
      tableSettings: {
        prettifyJson: true,
        showPassFail: false,
      },
    });
    const { getRuntimeConfig, loadRuntimeConfig } = await import('./runtime');

    await loadRuntimeConfig();

    expect(callApiMock).toHaveBeenCalledWith('/app-config');
    expect(getRuntimeConfig()).toEqual({
      tableSettings: {
        prettifyJson: true,
        showPassFail: false,
      },
    });
  });

  it.each([
    { body: {}, label: 'a failed response', ok: false },
    { body: { tableSettings: {} }, label: 'an invalid response', ok: true },
  ])('keeps built-in defaults for $label', async ({ body, ok }) => {
    const { mockCallApiResponse } = await import('@app/tests/apiMocks');
    mockCallApiResponse(body, { ok });
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
    const { rejectCallApi } = await import('@app/tests/apiMocks');
    rejectCallApi(new Error('offline'));
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
