import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the multi-region cookie consent system (site/static/js/consent.js).
 * Covers cookie format, region detection, all consent flows, preferences panel,
 * GPC support, script loading, and migration from old format.
 */

const CONSENT_JS = fs.readFileSync(path.resolve(__dirname, '../../static/js/consent.js'), 'utf-8');

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/`;
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? m[2] : null;
}

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  });
}

function runConsent() {
  const fn = new Function(CONSENT_JS);
  fn();
}

function resetGlobals() {
  (window as any).__pf_analytics_loaded = false;
  (window as any).__pf_marketing_loaded = false;
  (window as any).__pf_manage_cookies = undefined;
}

describe('consent.js', () => {
  beforeEach(() => {
    clearCookies();
    document.body.innerHTML = '';
    document.head.querySelectorAll('#cc-styles').forEach((el) => el.remove());
    document.querySelectorAll('script[src]').forEach((el) => el.remove());
    resetGlobals();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        hash: '',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
        reload: vi.fn(),
      },
    });
    // Default: no GPC
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Cookie Format ──

  describe('cookie format', () => {
    it('saves consent in v1 format', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-accept')!.click();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
    });

    it('saves opt_out region as "o"', () => {
      setCookie('pf_country', 'US');
      runConsent();
      const consent = getCookie('pf_consent');
      expect(consent).toMatch(/^v1\.o\./);
    });

    it('saves notice region as "n"', () => {
      setCookie('pf_country', 'JP');
      runConsent();
      const consent = getCookie('pf_consent');
      expect(consent).toBe('v1.n.1.1');
    });
  });

  // ── Migration ──

  describe('migration from old format', () => {
    it('migrates pf_consent=1 to v1 format with all on', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', '1');
      runConsent();
      const consent = getCookie('pf_consent');
      expect(consent).toBe('v1.i.1.1');
    });

    it('migrates pf_consent=0 to v1 format with all off', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', '0');
      runConsent();
      const consent = getCookie('pf_consent');
      expect(consent).toBe('v1.i.0.0');
    });

    it('loads scripts after migrating pf_consent=1', () => {
      setCookie('pf_country', 'FR');
      setCookie('pf_consent', '1');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('does not load scripts after migrating pf_consent=0', () => {
      setCookie('pf_country', 'FR');
      setCookie('pf_consent', '0');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });
  });

  // ── Region Detection ──

  describe('region detection', () => {
    it('EU countries map to opt_in (banner shown)', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });

    it('US maps to opt_out (no banner, scripts loaded)', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
    });

    it('JP maps to notice (no banner, scripts loaded)', () => {
      setCookie('pf_country', 'JP');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
    });

    it('missing country defaults to notice', () => {
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
    });

    it('Brazil maps to opt_in', () => {
      setCookie('pf_country', 'BR');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });

    it('Canada maps to opt_in', () => {
      setCookie('pf_country', 'CA');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });
  });

  // ── Opt-in Flow ──

  describe('opt-in flow (EU/BR/CA)', () => {
    it('shows banner for first visit EU visitor', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('accept all loads both categories', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-accept')!.click();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
      expect(document.getElementById('cc-banner')).toBeNull();
    });

    it('decline all sets both off and no scripts', () => {
      setCookie('pf_country', 'FR');
      runConsent();
      document.getElementById('cc-decline')!.click();
      expect(getCookie('pf_consent')).toBe('v1.i.0.0');
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('manage preferences opens panel instead of banner', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect(document.getElementById('cc-overlay')).not.toBeNull();
    });

    it('analytics-only via preferences panel', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();

      // Toggle analytics on, marketing stays off (defaults for opt_in are off)
      const analyticsToggle = document.getElementById('cc-analytics') as HTMLInputElement;
      const marketingToggle = document.getElementById('cc-marketing') as HTMLInputElement;

      // For opt_in, both default to off
      analyticsToggle.checked = true;
      marketingToggle.checked = false;

      document.getElementById('cc-save')!.click();
      expect(getCookie('pf_consent')).toBe('v1.i.1.0');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('returning visitor with consent loads scripts immediately', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.1.1');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('returning visitor with analytics-only loads only analytics', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.1.0');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('returning visitor with all declined loads nothing', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.0.0');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });
  });

  // ── Opt-out Flow ──

  describe('opt-out flow (US)', () => {
    it('no banner shown, scripts loaded immediately', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('auto-saves consent cookie on first visit', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(getCookie('pf_consent')).toMatch(/^v1\.o\.1\.1$/);
    });

    it('footer opt-out via preferences works', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_marketing_loaded).toBe(true);

      // Open preferences and disable marketing
      (window as any).__pf_manage_cookies();
      const marketingToggle = document.getElementById('cc-marketing') as HTMLInputElement;
      marketingToggle.checked = false;
      document.getElementById('cc-save')!.click();

      expect(getCookie('pf_consent')).toBe('v1.o.1.0');
      // Should reload since marketing was already loaded
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  // ── Notice Flow ──

  describe('notice flow (rest of world)', () => {
    it('scripts loaded immediately, no banner', () => {
      setCookie('pf_country', 'JP');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('auto-saves consent cookie', () => {
      setCookie('pf_country', 'JP');
      runConsent();
      expect(getCookie('pf_consent')).toBe('v1.n.1.1');
    });
  });

  // ── Preferences Panel ──

  describe('preferences panel', () => {
    it('opens via __pf_manage_cookies global', () => {
      setCookie('pf_country', 'US');
      runConsent();
      (window as any).__pf_manage_cookies();
      expect(document.getElementById('cc-overlay')).not.toBeNull();
    });

    it('opens via #manage-cookies hash', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.1');
      (window as any).location.hash = '#manage-cookies';
      runConsent();
      expect(document.getElementById('cc-overlay')).not.toBeNull();
    });

    it('shows correct toggle states from existing consent', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.0');
      runConsent();
      (window as any).__pf_manage_cookies();

      const a = document.getElementById('cc-analytics') as HTMLInputElement;
      const m = document.getElementById('cc-marketing') as HTMLInputElement;
      expect(a.checked).toBe(true);
      expect(m.checked).toBe(false);
    });

    it('close button removes overlay', () => {
      setCookie('pf_country', 'US');
      runConsent();
      (window as any).__pf_manage_cookies();
      expect(document.getElementById('cc-overlay')).not.toBeNull();

      document.getElementById('cc-prefs-close')!.click();
      expect(document.getElementById('cc-overlay')).toBeNull();
    });

    it('escape key closes overlay', () => {
      setCookie('pf_country', 'US');
      runConsent();
      (window as any).__pf_manage_cookies();
      expect(document.getElementById('cc-overlay')).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.getElementById('cc-overlay')).toBeNull();
    });

    it('clicking overlay backdrop closes it', () => {
      setCookie('pf_country', 'US');
      runConsent();
      (window as any).__pf_manage_cookies();

      const overlay = document.getElementById('cc-overlay')!;
      overlay.click();
      expect(document.getElementById('cc-overlay')).toBeNull();
    });

    it('save preferences updates cookie and loads consented scripts', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();

      (document.getElementById('cc-analytics') as HTMLInputElement).checked = true;
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      expect(getCookie('pf_consent')).toBe('v1.i.1.0');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
      expect(document.getElementById('cc-overlay')).toBeNull();
    });

    it('reload on revoke: analytics disabled after being loaded', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(true);

      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      expect(window.location.reload).toHaveBeenCalled();
    });

    it('reload on revoke: marketing disabled after being loaded', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_marketing_loaded).toBe(true);

      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      expect(window.location.reload).toHaveBeenCalled();
    });

    it('no reload when enabling a new category', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.0.0');
      runConsent();

      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = true;
      document.getElementById('cc-save')!.click();

      expect(window.location.reload).not.toHaveBeenCalled();
      expect((window as any).__pf_analytics_loaded).toBe(true);
    });
  });

  // ── GPC ──

  describe('GPC (Global Privacy Control)', () => {
    it('marketing defaults OFF for US when GPC is set', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });
      setCookie('pf_country', 'US');
      runConsent();
      expect(getCookie('pf_consent')).toBe('v1.o.1.0');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('preferences panel defaults marketing OFF when GPC set', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });
      setCookie('pf_country', 'US');
      runConsent();

      (window as any).__pf_manage_cookies();
      const m = document.getElementById('cc-marketing') as HTMLInputElement;
      // GPC already caused consent to be saved with marketing=0, so toggle reflects that
      expect(m.checked).toBe(false);
    });

    it('GPC does not affect analytics for US', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(true);
    });
  });

  // ── Script Loading ──

  describe('script loading', () => {
    it('analytics scripts: injects gtag.js and scripts-analytics.js', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
      expect(document.querySelector('script[src*="scripts-analytics.js"]')).not.toBeNull();
    });

    it('marketing scripts: injects scripts-marketing.js', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.querySelector('script[src*="scripts-marketing.js"]')).not.toBeNull();
    });

    it('guard flag prevents double loading of analytics', () => {
      setCookie('pf_country', 'US');
      runConsent();
      const count = document.querySelectorAll('script[src*="scripts-analytics.js"]').length;
      expect(count).toBe(1);

      // Try to trigger again
      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = true;
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = true;
      document.getElementById('cc-save')!.click();

      const count2 = document.querySelectorAll('script[src*="scripts-analytics.js"]').length;
      expect(count2).toBe(1);
    });

    it('guard flag prevents double loading of marketing', () => {
      setCookie('pf_country', 'US');
      runConsent();
      const count = document.querySelectorAll('script[src*="scripts-marketing.js"]').length;
      expect(count).toBe(1);
    });

    it('does not inject old scripts.js', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.querySelector('script[src="/js/scripts.js"]')).toBeNull();
    });

    it('only loads analytics when analytics-only consent', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.1.0');
      runConsent();
      expect(document.querySelector('script[src*="scripts-analytics.js"]')).not.toBeNull();
      expect(document.querySelector('script[src*="scripts-marketing.js"]')).toBeNull();
    });
  });

  // ── EU Country Coverage ──

  describe('opt-in country coverage', () => {
    const optInCountries = [
      'AT',
      'BE',
      'BG',
      'HR',
      'CY',
      'CZ',
      'DK',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'HU',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SK',
      'SI',
      'ES',
      'SE',
      'IS',
      'LI',
      'NO', // EEA
      'GB', // UK
      'CH', // Switzerland
      'BR', // Brazil
      'CA', // Canada
    ];

    it.each(optInCountries)('shows banner for %s', (country) => {
      setCookie('pf_country', country);
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
      // Cleanup for next iteration
      document.getElementById('cc-banner')?.remove();
      document.getElementById('cc-overlay')?.remove();
      clearCookies();
      document.querySelectorAll('script[src]').forEach((el) => el.remove());
      resetGlobals();
    });
  });

  // ── Withdraw Consent ──

  describe('withdraw consent', () => {
    it('exposes __pf_manage_cookies global', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      expect(typeof (window as any).__pf_manage_cookies).toBe('function');
    });

    it('reloads page when declining all after scripts were loaded (opt-in)', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      // Accept first
      document.getElementById('cc-accept')!.click();
      expect((window as any).__pf_analytics_loaded).toBe(true);

      // Open preferences and disable everything
      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      expect(window.location.reload).toHaveBeenCalled();
    });

    it('does not reload when declining on first visit (no scripts loaded)', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      document.getElementById('cc-decline')!.click();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });
});
