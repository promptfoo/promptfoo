import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

async function loadSettingsStore(prettifyJson: boolean, showPassFail: boolean) {
  const { mockCallApiResponse } = await import('@app/tests/apiMocks');
  mockCallApiResponse({
    tableSettings: { prettifyJson, showPassFail },
  });

  const { loadRuntimeConfig } = await import('@app/config/runtime');
  await loadRuntimeConfig();

  return (await import('./store')).useResultsViewSettingsStore;
}

describe('results view runtime defaults', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  it('uses server-provided defaults for a new browser', async () => {
    const store = await loadSettingsStore(true, false);

    expect(store.getState().prettifyJson).toBe(true);
    expect(store.getState().showPassFail).toBe(false);
  });

  it('keeps saved browser preferences ahead of server-provided defaults', async () => {
    localStorage.setItem(
      'eval-settings',
      JSON.stringify({
        state: {
          prettifyJson: false,
          showPassFail: true,
        },
        version: 2,
      }),
    );

    const store = await loadSettingsStore(true, false);

    expect(store.getState().prettifyJson).toBe(false);
    expect(store.getState().showPassFail).toBe(true);
  });
});
