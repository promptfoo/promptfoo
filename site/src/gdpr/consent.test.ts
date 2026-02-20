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
  (window as any).__pf_gtag_loaded = false;
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

    it('missing country defaults to opt_in (fail-closed)', () => {
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
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

    it('escape listener does not stack across open/close cycles', () => {
      setCookie('pf_country', 'US');
      runConsent();

      // Open and close via close button
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-prefs-close')!.click();
      expect(document.getElementById('cc-overlay')).toBeNull();

      // Open and close via backdrop
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-overlay')!.click();
      expect(document.getElementById('cc-overlay')).toBeNull();

      // Open again — escape should still work cleanly (not fire multiple times)
      (window as any).__pf_manage_cookies();
      expect(document.getElementById('cc-overlay')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
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

  // ── Finding 1: Cross-region consent reuse ──

  describe('cross-region consent reuse', () => {
    it('invalidates opt-out consent when visiting from opt-in region', () => {
      // User consented in US (opt_out), now in EU
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.o.1.1');
      runConsent();

      // Should show banner, not load scripts
      expect(document.getElementById('cc-banner')).not.toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('invalidates notice consent when visiting from opt-in region', () => {
      // User had notice-region consent (JP), now in EU
      setCookie('pf_country', 'FR');
      setCookie('pf_consent', 'v1.n.1.1');
      runConsent();

      expect(document.getElementById('cc-banner')).not.toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
    });

    it('deletes the old cookie when invalidating cross-region consent', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.o.1.1');
      runConsent();

      // The old v1.o cookie should be deleted
      expect(getCookie('pf_consent')).toBeNull();
    });

    it('preserves valid opt-in consent in opt-in region', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.1.0');
      runConsent();

      // Should load analytics but not marketing, no banner
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('opt-out region accepts consent from any region', () => {
      // User consented in EU (opt_in), now in US — should be fine
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.i.1.1');
      runConsent();

      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('re-consent in opt-in region saves with opt-in region code', () => {
      // Start with US consent
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.o.1.1');
      runConsent();

      // Accept in EU
      document.getElementById('cc-accept')!.click();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
    });
  });

  // ── Finding 2: GPC continuous enforcement ──

  describe('GPC continuous enforcement', () => {
    it('overrides existing marketing consent when GPC is newly enabled', () => {
      // User previously consented to marketing in US
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.1');

      // Now GPC is enabled
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });

      runConsent();

      // Marketing should be overridden to 0
      expect(getCookie('pf_consent')).toBe('v1.o.1.0');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('does not override marketing when GPC is not set', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.1');

      runConsent();

      expect(getCookie('pf_consent')).toBe('v1.o.1.1');
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('GPC enforcement persists the override in the cookie', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.1');

      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });

      runConsent();

      // Cookie should be updated to reflect GPC override
      const consent = getCookie('pf_consent');
      expect(consent).toBe('v1.o.1.0');
    });
  });

  // ── Finding 5: Marketing-only gtag dependency ──

  describe('marketing-only gtag dependency', () => {
    it('loads gtag.js when only marketing is consented', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.0.1');
      runConsent();

      // gtag.js must be loaded for Google Ads to work
      expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
      expect(document.querySelector('script[src*="scripts-marketing.js"]')).not.toBeNull();
      // Analytics script should NOT be loaded
      expect(document.querySelector('script[src*="scripts-analytics.js"]')).toBeNull();
    });

    it('loads gtag.js only once when both categories are consented', () => {
      setCookie('pf_country', 'US');
      runConsent();

      const gtagScripts = document.querySelectorAll('script[src*="googletagmanager"]');
      expect(gtagScripts.length).toBe(1);
    });
  });

  // ── Finding 6: Vendor cookie cleanup on withdrawal ──

  describe('vendor cookie cleanup on withdrawal', () => {
    it('clears _ga cookies when revoking consent via preferences', () => {
      setCookie('pf_country', 'US');
      runConsent();

      // Simulate vendor cookies that would be set by GA/PostHog
      setCookie('_ga', 'GA1.1.12345');
      setCookie('_ga_ABC123', 'GS1.1.12345');
      setCookie('_gid', 'GA1.1.67890');
      setCookie('ph_test', 'posthog_session');

      // Revoke analytics
      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      // Vendor cookies should be cleared
      expect(getCookie('_ga')).toBeNull();
      expect(getCookie('_ga_ABC123')).toBeNull();
      expect(getCookie('_gid')).toBeNull();
      expect(getCookie('ph_test')).toBeNull();
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('clears vendor cookies when declining via banner after scripts loaded', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      // Accept first
      document.getElementById('cc-accept')!.click();

      // Simulate vendor cookies
      setCookie('_ga', 'GA1.1.12345');
      setCookie('_gat_UA12345', 'tracker');

      // Reopen and decline
      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;
      (document.getElementById('cc-marketing') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      expect(getCookie('_ga')).toBeNull();
      expect(getCookie('_gat_UA12345')).toBeNull();
    });

    it('does not clear non-vendor cookies during revocation', () => {
      setCookie('pf_country', 'US');
      runConsent();

      setCookie('user_pref', 'dark');
      setCookie('_ga', 'GA1.1.12345');

      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;
      document.getElementById('cc-save')!.click();

      // Non-vendor cookie should survive
      expect(getCookie('user_pref')).toBe('dark');
      expect(getCookie('_ga')).toBeNull();
    });
  });

  // ── Consent gating of third-party embeds ──

  describe('third-party embeds use consent gates', () => {
    const gatedComponents = [
      { file: '../../src/pages/careers.tsx', name: 'careers.tsx' },
      { file: '../../src/components/NewsletterForm.tsx', name: 'NewsletterForm.tsx' },
      { file: '../../src/pages/docs/api-reference.tsx', name: 'api-reference.tsx' },
      { file: '../../src/pages/feedback.tsx', name: 'feedback.tsx' },
    ];

    it.each(gatedComponents)('$name imports useConsentGate', ({ file }) => {
      const source = fs.readFileSync(path.resolve(__dirname, file), 'utf-8');
      expect(source).toContain('useConsentGate');
    });
  });

  // ── consent.js is loaded synchronously ──

  describe('consent.js loading configuration', () => {
    it('docusaurus.config.ts loads consent.js synchronously (not async)', () => {
      const config = fs.readFileSync(
        path.resolve(__dirname, '../../docusaurus.config.ts'),
        'utf-8',
      );
      // Verify consent.js is configured and not async
      expect(config).toContain("src: '/js/consent.js'");
      expect(config).toContain('async: false');
    });
  });

  // ── Fail-closed region default ──

  describe('fail-closed region default', () => {
    it('missing pf_country defaults to opt_in (banner shown, no scripts)', () => {
      // No pf_country cookie set
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });
  });

  // ── Blog iframes note ──
  // site/blog/hacker-summer-camp.md embeds cal.com and lu.ma iframes directly
  // in markdown. These are scheduling/event embeds and cannot be consent-gated
  // without a custom MDX component. They are functional content, not tracking.
});
