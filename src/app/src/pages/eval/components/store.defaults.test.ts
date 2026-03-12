import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResultsViewSettingsDefaults } from './store';

describe('getResultsViewSettingsDefaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the existing defaults when no env vars are set', () => {
    expect(getResultsViewSettingsDefaults()).toEqual({
      prettifyJson: false,
      showPassFail: true,
    });
  });

  it('overrides defaults from env vars', () => {
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_PRETTIFY_JSON', 'true');
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_SHOW_PASS_FAIL', 'false');

    expect(getResultsViewSettingsDefaults()).toEqual({
      prettifyJson: true,
      showPassFail: false,
    });
  });

  it('accepts common truthy and falsey env values', () => {
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_PRETTIFY_JSON', '1');
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_SHOW_PASS_FAIL', 'off');

    expect(getResultsViewSettingsDefaults()).toEqual({
      prettifyJson: true,
      showPassFail: false,
    });
  });

  it('falls back to defaults for invalid env values', () => {
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_PRETTIFY_JSON', 'maybe');
    vi.stubEnv('VITE_PROMPTFOO_WEB_VIEWER_TABLE_SETTING_SHOW_PASS_FAIL', 'sometimes');

    expect(getResultsViewSettingsDefaults()).toEqual({
      prettifyJson: false,
      showPassFail: true,
    });
  });
});
