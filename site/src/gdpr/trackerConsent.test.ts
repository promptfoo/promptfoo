import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scripts = Object.fromEntries(
  ['consent', 'scripts-analytics', 'scripts-marketing'].map((name) => [
    name,
    fs.readFileSync(path.resolve(__dirname, `../../static/js/${name}.js`), 'utf-8'),
  ]),
);

function runScript(name: string) {
  new Function(scripts[name])();
}

function consent(analytics: number, marketing: number) {
  (window as any).__pf_consent = { analytics, marketing };
}

describe('tracking script consent', () => {
  beforeEach(() => {
    document.head.innerHTML = '<script src="/js/consent.js"></script>';
    document.body.innerHTML = '';
    document.cookie.split(';').forEach((cookie) => {
      document.cookie = `${cookie.split('=')[0].trim()}=;path=/;max-age=0`;
    });
    for (const name of [
      '__pf_consent',
      '__pf_analytics_loaded',
      '__pf_marketing_loaded',
      '__pf_gtag_loaded',
      '__pf_posthog_loaded',
      'posthog',
      'vector',
      'Reo',
    ]) {
      delete (window as any)[name];
    }
    (window as any).gtag = vi.fn();
    vi.spyOn(window, 'addEventListener');
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, hash: '', pathname: '/', reload: vi.fn() },
    });
  });

  afterEach(() => {
    for (const [event, listener] of vi.mocked(window.addEventListener).mock.calls) {
      window.removeEventListener(event, listener);
    }
    vi.restoreAllMocks();
  });

  it.each(['scripts-analytics', 'scripts-marketing'])(
    'does not execute %s before consent exists',
    (name) => {
      runScript(name);
      expect(document.querySelectorAll('script')).toHaveLength(1);
      expect((window as any).gtag).not.toHaveBeenCalled();
      expect((window as any).posthog).toBeUndefined();
      expect((window as any).vector).toBeUndefined();
    },
  );

  it.each([
    ['scripts-analytics', 0, 1],
    ['scripts-marketing', 1, 0],
  ])('gates %s on its own category', (name, analytics, marketing) => {
    consent(analytics as number, marketing as number);
    runScript(name as string);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect((window as any).gtag).not.toHaveBeenCalled();
  });

  it.each(['scripts-analytics', 'scripts-marketing'])(
    'does not execute delayed %s after rejection',
    (name) => {
      document.cookie = 'pf_country=DE;path=/';
      runScript('consent');
      document.getElementById('cc-accept')!.click();
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-reject-all')!.click();
      expect(window.location.reload).toHaveBeenCalledOnce();
      runScript(name);
      expect(document.querySelector('script[src*="posthog.com"]')).toBeNull();
      expect(document.querySelector('script[src*="vector.co"]')).toBeNull();
      expect(document.querySelector('script[src*="reo.dev"]')).toBeNull();
    },
  );

  it('loads Vector and Reo only with marketing consent', () => {
    consent(0, 1);
    runScript('scripts-marketing');
    expect(document.querySelector('script[src="https://cdn.vector.co/pixel.js"]')).not.toBeNull();
    expect((window as any).vector.q).toEqual([]);
    document.querySelector('script[src*="vector.co"]')!.dispatchEvent(new Event('load'));
    expect((window as any).vector.q).toEqual([['load', ['18d08a7d-45cf-4805-b8b1-978305be5dd4']]]);
    const reo = document.querySelector<HTMLScriptElement>('script[src*="reo.dev"]')!;
    (window as any).Reo = { init: vi.fn() };
    reo.dispatchEvent(new Event('load'));
    expect((window as any).Reo.init).toHaveBeenCalledOnce();
    consent(0, 0);
    reo.dispatchEvent(new Event('load'));
    expect((window as any).Reo.init).toHaveBeenCalledOnce();
  });

  it('does not initialize a delayed Vector pixel after rejection, then permits regrant', () => {
    consent(0, 1);
    runScript('scripts-marketing');
    consent(0, 0);
    document.querySelector('script[src*="vector.co"]')!.dispatchEvent(new Event('load'));
    expect((window as any).vector.q).toEqual([]);
    consent(0, 1);
    window.dispatchEvent(new CustomEvent('pf_consent_change'));
    expect((window as any).vector.q).toEqual([['load', ['18d08a7d-45cf-4805-b8b1-978305be5dd4']]]);
    window.dispatchEvent(new CustomEvent('pf_consent_change'));
    expect((window as any).vector.q).toHaveLength(1);
  });

  it('waits for current analytics consent before enabling a delayed PostHog client', () => {
    consent(1, 0);
    runScript('scripts-analytics');
    expect(document.querySelector('script[src*="posthog.com"]')).not.toBeNull();
    const config = (window as any).posthog._i[0][1];
    expect(config.opt_out_capturing_by_default).toBe(true);
    expect(config.opt_out_persistence_by_default).toBe(true);
    expect(config.disable_persistence).toBe(true);
    const client = { set_config: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn() };
    consent(0, 0);
    config.loaded(client);
    expect(client.opt_in_capturing).not.toHaveBeenCalled();
    expect(client.set_config).not.toHaveBeenCalled();
    expect(client.opt_out_capturing).toHaveBeenCalledOnce();
    consent(1, 0);
    config.loaded(client);
    expect(client.opt_in_capturing).toHaveBeenCalledOnce();
    expect(client.set_config).toHaveBeenCalledWith({ disable_persistence: false });
  });

  it.each([true, false])('uses the latest choice after pending consent changes: %s', (grant) => {
    document.cookie = 'pf_country=DE;path=/';
    runScript('consent');
    document.getElementById('cc-accept')!.click();
    runScript('scripts-analytics');
    const pending = (window as any).posthog;
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-reject-all')!.click();
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-accept-all')!.click();
    if (!grant) {
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-reject-all')!.click();
    }
    expect(pending).toHaveLength(0);
    const client = { set_config: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn() };
    pending._i[0][1].loaded(client);
    expect(client.opt_in_capturing).toHaveBeenCalledTimes(grant ? 1 : 0);
    expect(client.opt_out_capturing).toHaveBeenCalledTimes(grant ? 0 : 1);
    expect(client.set_config).toHaveBeenCalledTimes(grant ? 1 : 0);
  });

  it('continues revocation when the active PostHog client throws', () => {
    document.cookie = 'pf_country=DE;path=/';
    runScript('consent');
    document.getElementById('cc-accept')!.click();
    (window as any).__pf_posthog_loaded = true;
    (window as any).posthog = {
      opt_out_capturing: vi.fn(() => {
        throw new Error('vendor failure');
      }),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-reject-all')!.click();
    expect(window.location.reload).toHaveBeenCalledOnce();
    expect((window as any).__pf_consent.analytics).toBe(0);
    error.mockRestore();
  });

  it('allows regrant when the previous reload has not unloaded the page', () => {
    document.cookie = 'pf_country=DE;path=/';
    runScript('consent');
    document.getElementById('cc-accept')!.click();
    const client = {
      opt_out_capturing: vi.fn(),
      has_opted_out_capturing: vi.fn(() => true),
      set_config: vi.fn(),
      opt_in_capturing: vi.fn(),
    };
    (window as any).__pf_posthog_loaded = true;
    (window as any).posthog = client;
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-reject-all')!.click();
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-accept-all')!.click();
    expect(client.opt_in_capturing).toHaveBeenCalledOnce();
    expect(client.set_config).toHaveBeenCalledWith({ disable_persistence: false });
  });

  it('opts out an active PostHog client before reloading after analytics rejection', () => {
    document.cookie = 'pf_country=DE;path=/';
    runScript('consent');
    document.getElementById('cc-accept')!.click();
    const optOut = vi.fn(() => {
      expect((window as any).__pf_consent.analytics).toBe(0);
      expect(window.location.reload).not.toHaveBeenCalled();
    });
    (window as any).__pf_posthog_loaded = true;
    (window as any).posthog = { opt_out_capturing: optOut };
    (window as any).__pf_manage_cookies();
    document.getElementById('cc-reject-all')!.click();
    expect(optOut).toHaveBeenCalledOnce();
    expect(window.location.reload).toHaveBeenCalledOnce();
  });
});
