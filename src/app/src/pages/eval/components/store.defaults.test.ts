import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadSettings() {
  vi.resetModules();
  const { useResultsViewSettingsStore } = await import('./store');
  return useResultsViewSettingsStore.getState();
}

describe('personal results table settings', () => {
  afterEach(() => {
    localStorage.removeItem('eval-settings');
  });

  it('only persists a display preference after the user chooses it', async () => {
    const settings = await loadSettings();
    settings.setStickyHeader(false);
    const saved = JSON.parse(localStorage.getItem('eval-settings')!).state;
    expect(saved).not.toHaveProperty('prettifyJson');
    expect(saved).not.toHaveProperty('showPassFail');

    settings.setPrettifyJson(false);
    expect((await loadSettings()).prettifyJson).toBe(false);
    expect((await loadSettings()).showPassFail).toBeUndefined();
  });

  it('restores explicit choices from older settings', async () => {
    localStorage.setItem(
      'eval-settings',
      JSON.stringify({ version: 1, state: { prettifyJson: false, showPassFail: true } }),
    );
    expect(await loadSettings()).toMatchObject({ prettifyJson: false, showPassFail: true });
  });
});
