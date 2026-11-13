import * as fs from 'fs';
import * as path from 'path';

import { getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

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
  (window as any).__pf_privacy_region = undefined;
  (window as any).__pf_consent = undefined;
  (window as any).__pf_third_party_loaded = false;
}

describe('consent.js', () => {
  beforeEach(() => {
    clearCookies();
    document.body.innerHTML = '';
    document.head.querySelectorAll('#cc-styles').forEach((el) => el.remove());
    document.querySelectorAll('script[src]').forEach((el) => el.remove());
    resetGlobals();
    (window as any).dataLayer = [];
    (window as any).gtag = undefined;
    vi.spyOn(window, 'addEventListener');
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
    for (const [event, listener] of vi.mocked(window.addEventListener).mock.calls) {
      if (event === 'popstate') window.removeEventListener(event, listener);
    }
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    vi.restoreAllMocks();
  });

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

    it('ignores malformed v1 consent values and falls back to the region default', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.9.1');
      runConsent();

      expect(getCookie('pf_consent')).toBe('v1.o.1.1');
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('deletes malformed v1 consent values before showing the opt-in banner', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.bad.cookie');
      runConsent();

      expect(getCookie('pf_consent')).toBeNull();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });
  });

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

    it('missing country requires consent', () => {
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

    it.each(['A', 'AA', 'ZZ', 'XX', 'T1', 'invalid'])(
      'requires consent for unknown country %s',
      (country) => {
        setCookie('pf_country', country);
        runConsent();
        expect(document.getElementById('cc-banner')).not.toBeNull();
        expect(getCookie('pf_consent')).toBeNull();
        expect((window as any).__pf_analytics_loaded).toBe(false);
        expect((window as any).__pf_marketing_loaded).toBe(false);
      },
    );
  });

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

      const analyticsToggle = document.getElementById('cc-analytics') as HTMLInputElement;
      const marketingToggle = document.getElementById('cc-marketing') as HTMLInputElement;
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

  describe('preferences panel', () => {
    it.each(['Escape', 'Close', 'Save'])('returns focus to the opener after %s', (action) => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.i.0.0');
      runConsent();
      const opener = document.createElement('button');
      opener.textContent = 'Cookie preferences';
      opener.onclick = () => (window as any).__pf_manage_cookies();
      document.body.appendChild(opener);
      opener.focus();
      opener.click();
      expect(document.activeElement).toBe(document.getElementById('cc-prefs-close'));
      if (action === 'Escape') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      } else {
        getByRole(document.body, 'button', { name: action, exact: true }).click();
      }
      expect(document.getElementById('cc-overlay')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(opener);
    });

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

    it('links toggle descriptions for screen readers', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();

      const analytics = document.getElementById('cc-analytics');
      const marketing = document.getElementById('cc-marketing');
      expect(analytics?.getAttribute('aria-describedby')).toBe(
        'cc-analytics-desc cc-analytics-tools',
      );
      expect(marketing?.getAttribute('aria-describedby')).toBe(
        'cc-marketing-desc cc-marketing-tools',
      );
    });

    it('starts with toggles off in opt-in regions before consent', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();

      const a = document.getElementById('cc-analytics') as HTMLInputElement;
      const m = document.getElementById('cc-marketing') as HTMLInputElement;
      expect(a.checked).toBe(false);
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

    it('reject all button sets both categories off', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();
      document.getElementById('cc-reject-all')!.click();

      expect(getCookie('pf_consent')).toBe('v1.i.0.0');
      expect(document.getElementById('cc-overlay')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(false);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it('accept all button sets both categories on', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      document.getElementById('cc-manage')!.click();
      document.getElementById('cc-accept-all')!.click();

      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
      expect(document.getElementById('cc-overlay')).toBeNull();
      expect((window as any).__pf_analytics_loaded).toBe(true);
      expect((window as any).__pf_marketing_loaded).toBe(true);
    });

    it('reject all triggers reload when scripts were already loaded', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_analytics_loaded).toBe(true);

      (window as any).__pf_manage_cookies();
      document.getElementById('cc-reject-all')!.click();

      expect(getCookie('pf_consent')).toBe('v1.o.0.0');
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

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

  describe('consent-scoped navigation', () => {
    it.each([
      ['v1.i.1.0', ['G-3TS8QLZQ93', 'G-3YM29CN26E']],
      ['v1.i.0.1', ['AW-17347444171']],
      ['v1.i.1.1', ['G-3TS8QLZQ93', 'G-3YM29CN26E', 'AW-17347444171']],
    ])('tracks each route once for %s', (consent, destinations) => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', consent as string);
      runConsent();
      const gtag = vi.spyOn(window as any, 'gtag');
      for (const [index, method] of ['pushState', 'replaceState', 'popstate'].entries()) {
        Object.assign(window.location, {
          pathname: `/route-${index}`,
          href: `http://localhost/route-${index}`,
        });
        if (method === 'popstate') {
          window.dispatchEvent(new PopStateEvent('popstate'));
        } else {
          history[method as 'pushState' | 'replaceState']({}, '');
        }
      }
      expect(gtag).toHaveBeenCalledTimes(3);
      expect(gtag).toHaveBeenLastCalledWith('event', 'page_view', {
        send_to: destinations,
        page_path: '/route-2',
        page_location: 'http://localhost/route-2',
      });
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(gtag).toHaveBeenCalledTimes(3);
      (window as any).__pf_consent = { analytics: 0, marketing: 0 };
      Object.assign(window.location, { pathname: '/withdrawn' });
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(gtag).toHaveBeenCalledTimes(3);
    });
  });

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
    });
  });

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

  describe('cross-region consent reuse', () => {
    it.each(['o', 'n'])(
      'preserves a saved %s-region refusal after entering an opt-in region',
      (region) => {
        setCookie('pf_country', 'DE');
        setCookie('pf_consent', `v1.${region}.0.0`);
        runConsent();
        expect(getCookie('pf_consent')).toBe(`v1.${region}.0.0`);
        expect(document.getElementById('cc-banner')).toBeNull();
        expect(document.querySelectorAll('script[src]')).toHaveLength(0);
      },
    );

    it('keeps opt-in consent provenance while visiting an opt-out region', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.i.1.1');
      runConsent();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
      setCookie('pf_country', 'DE');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
    });

    it.each(['US', 'JP', 'DE'])('opens preferences before loading trackers in %s', (country) => {
      setCookie('pf_country', country);
      setCookie('pf_consent', 'v1.i.1.1');
      window.location.hash = '#manage-cookies';
      runConsent();
      expect(document.getElementById('cc-overlay')).not.toBeNull();
      expect(document.querySelectorAll('script[src]')).toHaveLength(0);
      expect((window as any).__pf_consent).toBeNull();
      expect(getCookie('pf_consent')).toBe('v1.i.1.1');
    });

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

    it.each(['v1.o.1.0', 'v1.o.0.1', 'v1.n.1.0'])(
      'preserves partial choices while suspending grants: %s',
      (consent) => {
        setCookie('pf_country', 'DE');
        setCookie('pf_consent', consent);
        runConsent();
        expect(getCookie('pf_consent')).toBe(consent);
        expect(document.querySelectorAll('script[src]')).toHaveLength(0);
        document.getElementById('cc-manage')!.click();
        expect(getByRole(document.body, 'checkbox', { name: 'Analytics' })).not.toBeChecked();
        expect(getByRole(document.body, 'checkbox', { name: 'Marketing' })).not.toBeChecked();
        document.getElementById('cc-prefs-close')!.click();
        setCookie('pf_country', 'US');
        runConsent();
        expect(getCookie('pf_consent')).toBe(consent);
        expect((window as any).__pf_consent).toEqual({
          analytics: Number(consent.split('.')[2]),
          marketing: Number(consent.split('.')[3]),
        });
      },
    );

    it.each(['US', 'DE'])('shows GPC on a direct privacy link in %s', (country) => {
      setCookie('pf_country', country);
      setCookie('pf_consent', 'v1.i.1.1');
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
      window.location.hash = '#manage-cookies';
      runConsent();
      const marketing = getByRole(document.body, 'checkbox', { name: 'Marketing' });
      expect(marketing).not.toBeChecked();
      expect(marketing).toBeDisabled();
      expect(document.querySelectorAll('script[src]')).toHaveLength(0);
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

    it('GPC cleanup preserves analytics cookies while clearing marketing cookies', () => {
      setCookie('pf_country', 'US');
      setCookie('pf_consent', 'v1.o.1.1');
      setCookie('_ga', 'GA1.1.12345');
      setCookie('_gcl_au', 'marketing_cookie');

      Object.defineProperty(navigator, 'globalPrivacyControl', {
        writable: true,
        configurable: true,
        value: true,
      });

      runConsent();

      expect(getCookie('_ga')).toBe('GA1.1.12345');
      expect(getCookie('_gcl_au')).toBeNull();
    });
  });

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

    it.each([
      { hostname: 'docs.promptfoo.co.uk', parent: 'promptfoo.co.uk' },
      { hostname: 'deep.docs.promptfoo.dev', parent: 'promptfoo.dev' },
    ])('clears host and parent cookies on $hostname', ({ hostname, parent }) => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          ...window.location,
          hash: '',
          pathname: '/docs/',
          search: '',
          href: 'https://docs.promptfoo.co.uk/docs/',
          hostname,
          reload: vi.fn(),
        },
      });

      setCookie('pf_country', 'US');
      runConsent();

      (window as any).__pf_manage_cookies();
      (document.getElementById('cc-analytics') as HTMLInputElement).checked = false;

      const cookieWrites: string[] = [];
      try {
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          get() {
            return 'pf_country=US; _ga=GA1.1.12345';
          },
          set(value: string) {
            cookieWrites.push(value);
          },
        });

        document.getElementById('cc-save')!.click();

        expect(cookieWrites).toEqual(
          expect.arrayContaining([
            expect.stringContaining(`domain=.${hostname}`),
            expect.stringContaining(`domain=.${parent}`),
          ]),
        );
      } finally {
        delete (document as Document & { cookie?: string }).cookie;
      }
    });
  });

  describe('newsletter form loading', () => {
    it('uses the dedicated third-party gate instead of analytics or marketing consent hooks', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../src/components/NewsletterForm.tsx'),
        'utf-8',
      );
      expect(source).toContain('ThirdPartyContentGate');
      expect(source).not.toContain('useConsentGate');
    });

    it('gates the hosted feedback form before its iframe is mounted', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../src/pages/feedback.tsx'),
        'utf-8',
      );
      expect(source).toContain('ThirdPartyContentGate');
      expect(source).toContain('Google Forms');
    });
  });

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

  describe('consent state shared with embeds', () => {
    it('publishes rejection even before any tracking script has loaded', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      const changed = vi.fn();
      window.addEventListener('pf_consent_change', changed);
      document.getElementById('cc-decline')!.click();
      window.removeEventListener('pf_consent_change', changed);
      expect(changed).toHaveBeenCalledTimes(1);
      expect((window as any).__pf_consent).toEqual({ analytics: 0, marketing: 0 });
    });

    it('clears vendor identifiers when previously automatic consent is invalidated', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', 'v1.o.1.1');
      for (const name of ['_ga', '_gcl_au', 'ph_test']) setCookie(name, 'old');
      runConsent();
      document.getElementById('cc-decline')!.click();
      for (const name of ['_ga', '_gcl_au', 'ph_test']) expect(getCookie(name)).toBeNull();
      expect(window.location.reload).not.toHaveBeenCalled();
    });

    it.each(['JP', 'DE', 'US'])('honors GPC for existing and new choices in %s', (country) => {
      setCookie('pf_country', country);
      const region = country === 'JP' ? 'n' : country === 'DE' ? 'i' : 'o';
      setCookie('pf_consent', `v1.${region}.1.1`);
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
      runConsent();
      expect((window as any).__pf_marketing_loaded).toBe(false);
      expect((window as any).__pf_consent).toEqual({ analytics: 1, marketing: 0 });
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-accept-all')!.click();
      expect(getCookie('pf_consent')).toBe(`v1.${region}.1.0`);
      expect((window as any).__pf_marketing_loaded).toBe(false);
    });

    it.each([false, true])(
      'preserves manual activation when saving marketing off and analytics=%s',
      (analytics) => {
        setCookie('pf_country', 'DE');
        setCookie('pf_consent', 'v1.i.0.0');
        runConsent();
        (window as any).__pf_third_party_loaded = true;
        (window as any).__pf_manage_cookies();
        (document.getElementById('cc-analytics') as HTMLInputElement).checked = analytics;
        const listener = vi.fn();
        window.addEventListener('pf_consent_change', listener);
        document.getElementById('cc-save')!.click();
        expect(window.location.reload).not.toHaveBeenCalled();
        expect((listener.mock.calls[0][0] as CustomEvent).detail.revokeManual).toBe(false);
        expect((window as any).__pf_consent).toEqual({
          analytics: analytics ? 1 : 0,
          marketing: 0,
        });
        window.removeEventListener('pf_consent_change', listener);
      },
    );

    it('keeps a manually activated embed when Accept All is restricted by GPC', () => {
      setCookie('pf_country', 'DE');
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
      runConsent();
      (window as any).__pf_third_party_loaded = true;
      const listener = vi.fn();
      window.addEventListener('pf_consent_change', listener);
      document.getElementById('cc-accept')!.click();
      expect(window.location.reload).not.toHaveBeenCalled();
      expect((listener.mock.calls[0][0] as CustomEvent).detail.revokeManual).toBe(false);
      expect((window as any).__pf_consent).toEqual({ analytics: 1, marketing: 0 });
      window.removeEventListener('pf_consent_change', listener);
    });

    it.each(['close', 'escape', 'outside'])(
      'restores saved opt-in choices after %s cancellation',
      (action) => {
        setCookie('pf_country', 'DE');
        setCookie('pf_consent', 'v1.i.1.1');
        window.location.hash = '#manage-cookies';
        runConsent();
        // The fixture's replaceState does not update its mocked location.
        window.location.hash = '';
        expect((window as any).__pf_consent).toBeNull();
        if (action === 'escape')
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        else document.getElementById(action === 'close' ? 'cc-prefs-close' : 'cc-overlay')!.click();
        expect((window as any).__pf_consent).toEqual({ analytics: 1, marketing: 1 });
        expect((window as any).__pf_analytics_loaded).toBe(true);
        expect((window as any).__pf_marketing_loaded).toBe(true);
      },
    );

    it.each([
      { country: 'DE', cookie: 'v1.i.1.1', gpc: true, expected: { analytics: 1, marketing: 0 } },
      { country: 'DE', cookie: 'v1.o.1.1', gpc: false, expected: null },
    ])(
      'applies current region and GPC rules when cancelling a direct privacy link: $cookie, GPC=$gpc',
      ({ country, cookie, gpc, expected }) => {
        setCookie('pf_country', country);
        setCookie('pf_consent', cookie);
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          value: gpc,
          configurable: true,
        });
        window.location.hash = '#manage-cookies';
        runConsent();
        window.location.hash = '';
        document.getElementById('cc-prefs-close')!.click();
        expect((window as any).__pf_consent).toEqual(expected);
        expect((window as any).__pf_marketing_loaded).toBe(false);
      },
    );

    it('reloads when revoking a manually activated embed', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      (window as any).__pf_third_party_loaded = true;
      document.getElementById('cc-decline')!.click();
      expect(window.location.reload).toHaveBeenCalledOnce();
      expect(getCookie('pf_consent')).toBe('v1.i.0.0');
    });

    it('names both category controls for assistive technology', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      (window as any).__pf_manage_cookies();
      expect(getByRole(document.body, 'checkbox', { name: 'Analytics' })).toHaveAttribute(
        'id',
        'cc-analytics',
      );
      expect(getByRole(document.body, 'checkbox', { name: 'Marketing' })).toHaveAttribute(
        'id',
        'cc-marketing',
      );
    });
  });
});
