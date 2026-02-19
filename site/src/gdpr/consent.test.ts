import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the cookie consent banner (site/static/js/consent.js).
 * We load and evaluate the IIFE in a jsdom environment, then verify
 * DOM state, cookie behavior, and script injection.
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
  // eslint-disable-next-line no-eval
  const fn = new Function(CONSENT_JS);
  fn();
}

describe('consent.js', () => {
  beforeEach(() => {
    clearCookies();
    document.body.innerHTML = '';
    document.head.querySelectorAll('#cc-styles').forEach((el) => el.remove());
    document.querySelectorAll('script[src]').forEach((el) => el.remove());
    (window as any).__pf_scripts_loaded = false;
    (window as any).__pf_manage_cookies = undefined;
    // Stub location.hash
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EU visitor without prior consent', () => {
    it('loads scripts when no pf_country cookie (defaults to non-EU)', () => {
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_scripts_loaded).toBe(true);
    });

    it('shows banner for EU country code', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });

    it('shows banner for UK', () => {
      setCookie('pf_country', 'GB');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });

    it('shows banner for Switzerland', () => {
      setCookie('pf_country', 'CH');
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });
  });

  describe('non-EU visitor', () => {
    it('does not show banner for US', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
    });

    it('does not show banner for Japan', () => {
      setCookie('pf_country', 'JP');
      runConsent();
      expect(document.getElementById('cc-banner')).toBeNull();
    });

    it('loads scripts immediately', () => {
      setCookie('pf_country', 'US');
      runConsent();
      expect((window as any).__pf_scripts_loaded).toBe(true);
      const gtagScript = document.querySelector('script[src*="googletagmanager"]');
      expect(gtagScript).not.toBeNull();
    });

    it('does not load scripts when #manage-cookies hash is present', () => {
      setCookie('pf_country', 'US');
      (window as any).location.hash = '#manage-cookies';
      runConsent();
      expect((window as any).__pf_scripts_loaded).toBe(false);
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });
  });

  describe('accept flow', () => {
    it('sets pf_consent=1 and loads scripts on accept', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      const acceptBtn = document.getElementById('cc-accept')!;
      acceptBtn.click();

      expect(getCookie('pf_consent')).toBe('1');
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_scripts_loaded).toBe(true);
    });
  });

  describe('decline flow', () => {
    it('sets pf_consent=0 and does not load scripts on decline', () => {
      setCookie('pf_country', 'FR');
      runConsent();

      const declineBtn = document.getElementById('cc-decline')!;
      declineBtn.click();

      expect(getCookie('pf_consent')).toBe('0');
      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_scripts_loaded).toBe(false);
    });
  });

  describe('returning visitor with prior consent', () => {
    it('loads scripts immediately when pf_consent=1', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', '1');
      runConsent();

      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_scripts_loaded).toBe(true);
    });

    it('does nothing when pf_consent=0', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', '0');
      runConsent();

      expect(document.getElementById('cc-banner')).toBeNull();
      expect((window as any).__pf_scripts_loaded).toBe(false);
    });
  });

  describe('withdraw consent', () => {
    it('exposes __pf_manage_cookies global', () => {
      setCookie('pf_country', 'DE');
      runConsent();
      expect(typeof (window as any).__pf_manage_cookies).toBe('function');
    });

    it('reopens banner when __pf_manage_cookies is called', () => {
      setCookie('pf_country', 'DE');
      setCookie('pf_consent', '1');
      runConsent();

      expect(document.getElementById('cc-banner')).toBeNull();

      (window as any).__pf_manage_cookies();
      expect(document.getElementById('cc-banner')).not.toBeNull();
    });

    it('reloads page when declining after scripts were loaded', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      // Accept first
      document.getElementById('cc-accept')!.click();
      expect((window as any).__pf_scripts_loaded).toBe(true);

      // Reopen and decline
      (window as any).__pf_manage_cookies();
      document.getElementById('cc-decline')!.click();

      expect(window.location.reload).toHaveBeenCalled();
    });

    it('does not reload when declining on first visit (no scripts loaded)', () => {
      setCookie('pf_country', 'DE');
      runConsent();

      document.getElementById('cc-decline')!.click();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });

  describe('script loading', () => {
    it('only loads scripts once even if loadScripts called multiple times', () => {
      setCookie('pf_country', 'US');
      runConsent();

      const scriptCount = document.querySelectorAll('script[src*="scripts.js"]').length;
      expect(scriptCount).toBe(1);
    });

    it('injects both gtag.js and scripts.js', () => {
      setCookie('pf_country', 'US');
      runConsent();

      expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
      expect(document.querySelector('script[src*="scripts.js"]')).not.toBeNull();
    });
  });

  describe('EU country coverage', () => {
    const euCountries = [
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
    ];

    it.each(euCountries)('shows banner for %s', (country) => {
      setCookie('pf_country', country);
      runConsent();
      expect(document.getElementById('cc-banner')).not.toBeNull();
      // Cleanup for next iteration
      document.getElementById('cc-banner')?.remove();
      clearCookies();
      (window as any).__pf_scripts_loaded = false;
      (window as any).__pf_manage_cookies = undefined;
    });
  });
});
