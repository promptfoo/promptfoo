/**
 * Separate analytics and marketing choices, with defaults based on country.
 *
 * Regions:
 *   opt_in  — EU-27, EEA, GB, CH, BR, CA: block scripts until consent
 *   opt_out — US: scripts load immediately, footer opt-out
 *   notice  — other recognized countries: scripts load immediately
 *
 * Cookie format: pf_consent=v1.{region}.{analytics}.{marketing}
 *   region: i=opt_in, o=opt_out, n=notice
 *   analytics/marketing: 1=on, 0=off
 *
 * Old format (pf_consent=1 or 0) is migrated automatically.
 *
 * GPC (navigator.globalPrivacyControl) disables marketing in every region.
 *
 * To open preferences, call window.__pf_manage_cookies() or navigate to #manage-cookies.
 */
(function () {
  var COOKIE = 'pf_consent';
  var DAYS = 365;
  var resumeConsentOnClose = false;

  // Countries with opt-in defaults
  // EU-27 + EEA (IS, LI, NO) + UK + Switzerland + Brazil + Canada
  var OPT_IN_COUNTRIES = [
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
    'NO',
    'GB',
    'CH',
    'BR',
    'CA',
  ];

  // Countries using opt-out model
  var OPT_OUT_COUNTRIES = ['US'];

  // Helpers

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^| )' + escapeRegex(name) + '=([^;]+)'));
    return m ? m[2] : null;
  }

  function setCookie(name, v) {
    var d = new Date();
    d.setTime(d.getTime() + DAYS * 864e5);
    document.cookie =
      name + '=' + v + ';path=/;expires=' + d.toUTCString() + ';SameSite=Lax;Secure';
  }

  function deleteCookie(name) {
    document.cookie = name + '=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax;Secure';
  }

  // Known first-party cookies set by vendor scripts.
  // Analytics: GA (_ga*, _gid, _gat*), PostHog (ph_*)
  // Marketing: Google Ads (_gcl_*), Meta (_fbp, _fbc)
  var ANALYTICS_COOKIE_PATTERNS = [/^_ga/, /^_gid$/, /^_gat/, /^ph_/];
  var MARKETING_COOKIE_PATTERNS = [/^_gcl_/, /^_fbp$/, /^_fbc$/];
  var ALL_VENDOR_COOKIE_PATTERNS = ANALYTICS_COOKIE_PATTERNS.concat(MARKETING_COOKIE_PATTERNS);

  function getCookieDeletionDomains(hostname) {
    if (!hostname || hostname === 'localhost' || /^[\d.]+$/.test(hostname)) {
      return [];
    }

    var parts = hostname.split('.');
    var domains = ['.' + hostname];

    for (var i = 1; i < parts.length - 1; i++) {
      // The browser rejects public-suffix domains; include every possible parent.
      domains.push('.' + parts.slice(i).join('.'));
    }

    return domains;
  }

  function clearVendorCookies(patterns) {
    var expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax;Secure';
    var cookiePatterns = patterns || ALL_VENDOR_COOKIE_PATTERNS;
    var domains = getCookieDeletionDomains(location.hostname);

    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!name) return;
      for (var i = 0; i < cookiePatterns.length; i++) {
        if (cookiePatterns[i].test(name)) {
          // Delete across all path/domain combinations vendors may use
          deleteCookie(name);
          document.cookie = name + '=;path=' + location.pathname + ';' + expiry;
          domains.forEach(function (domain) {
            document.cookie = name + '=;path=/;domain=' + domain + ';' + expiry;
            document.cookie =
              name + '=;path=' + location.pathname + ';domain=' + domain + ';' + expiry;
          });
          break;
        }
      }
    });
  }

  // Region Detection

  function getRegion() {
    var country = getCookie('pf_country');
    // Missing or unrecognized country data must not enable tracking.
    if (!country || !/^[A-Z]{2}$/.test(country) || country === 'ZZ') return 'opt_in';
    try {
      if (new Intl.DisplayNames(['en'], { type: 'region' }).of(country) === country) {
        return 'opt_in';
      }
    } catch {
      return 'opt_in';
    }
    if (OPT_IN_COUNTRIES.includes(country)) return 'opt_in';
    if (OPT_OUT_COUNTRIES.includes(country)) return 'opt_out';
    return 'notice';
  }

  var REGION_CODE = { opt_in: 'i', opt_out: 'o', notice: 'n' };

  // Cookie Format

  function parseConsentFlag(value) {
    if (value === '1') return 1;
    if (value === '0') return 0;
    return null;
  }

  function parseConsent(raw) {
    if (!raw) return null;
    // Migrate old format
    if (raw === '1') return { region: REGION_CODE[getRegion()], analytics: 1, marketing: 1 };
    if (raw === '0') return { region: REGION_CODE[getRegion()], analytics: 0, marketing: 0 };
    // New format: v1.{region}.{analytics}.{marketing}
    var parts = raw.split('.');
    if (parts.length === 4 && parts[0] === 'v1') {
      var analytics = parseConsentFlag(parts[2]);
      var marketing = parseConsentFlag(parts[3]);
      if (
        REGION_CODE.opt_in !== parts[1] &&
        REGION_CODE.opt_out !== parts[1] &&
        REGION_CODE.notice !== parts[1]
      ) {
        return null;
      }
      if (analytics === null || marketing === null) {
        return null;
      }
      return { region: parts[1], analytics: analytics, marketing: marketing };
    }
    return null;
  }

  function serializeConsent(analytics, marketing, region) {
    var r = region || REGION_CODE[getRegion()];
    return 'v1.' + r + '.' + (analytics ? 1 : 0) + '.' + (marketing ? 1 : 0);
  }

  function publishConsent(consent, revokeManual) {
    window.__pf_consent = consent;
    window.dispatchEvent(
      new CustomEvent('pf_consent_change', { detail: { revokeManual: !!revokeManual } }),
    );
  }

  function saveConsent(analytics, marketing, region, revokeManual) {
    var consent = {
      analytics: analytics ? 1 : 0,
      marketing: marketing && !navigator.globalPrivacyControl ? 1 : 0,
    };
    setCookie(COOKIE, serializeConsent(consent.analytics, consent.marketing, region));
    if (!consent.analytics) clearVendorCookies(ANALYTICS_COOKIE_PATTERNS);
    if (!consent.marketing) clearVendorCookies(MARKETING_COOKIE_PATTERNS);
    publishConsent(consent, revokeManual);
    return consent;
  }

  function applyConsent(analytics, marketing, revokeManual) {
    revokeManual =
      !!revokeManual || !!(window.__pf_consent && window.__pf_consent.marketing && !marketing);
    var consent = saveConsent(analytics, marketing, undefined, revokeManual);
    if (
      (!consent.analytics && window.__pf_analytics_loaded) ||
      (!consent.marketing && window.__pf_marketing_loaded) ||
      (revokeManual && window.__pf_third_party_loaded)
    ) {
      window.location.reload();
      return;
    }
    loadByConsent(consent);
  }

  // Script Loading

  function ensureGtagJs() {
    if (window.__pf_gtag_loaded) return;
    window.__pf_gtag_loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    window.gtag('js', new Date());

    // Both categories use gtag, so install one navigation handler for either choice.
    var previousPath = location.pathname + location.search;
    function onNavigation() {
      var currentPath = location.pathname + location.search;
      if (currentPath === previousPath) return;
      previousPath = currentPath;
      var consent = window.__pf_consent;
      var destinations = [];
      if (consent && consent.analytics) destinations.push('G-3TS8QLZQ93', 'G-3YM29CN26E');
      if (consent && consent.marketing) destinations.push('AW-17347444171');
      if (destinations.length) {
        window.gtag('event', 'page_view', {
          send_to: destinations,
          page_path: currentPath,
          page_location: location.href,
        });
      }
    }
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      history[method] = function () {
        original.apply(this, arguments);
        onNavigation();
      };
    });
    window.addEventListener('popstate', onNavigation);

    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=G-3TS8QLZQ93';
    document.head.appendChild(g);
  }

  function loadAnalytics() {
    if (window.__pf_analytics_loaded) return;
    window.__pf_analytics_loaded = true;

    ensureGtagJs();

    var s = document.createElement('script');
    s.async = true;
    s.src = '/js/scripts-analytics.js';
    document.head.appendChild(s);
  }

  function loadMarketing() {
    if (window.__pf_marketing_loaded) return;
    window.__pf_marketing_loaded = true;

    // Marketing scripts depend on gtag.js for Google Ads config
    ensureGtagJs();

    var s = document.createElement('script');
    s.async = true;
    s.src = '/js/scripts-marketing.js';
    document.head.appendChild(s);
  }

  function loadByConsent(consent) {
    if (!consent) return;
    if (consent.analytics) loadAnalytics();
    if (consent.marketing) loadMarketing();
  }

  // UI: Styles

  function injectStyles() {
    if (document.getElementById('cc-styles')) return;
    var style = document.createElement('style');
    style.id = 'cc-styles';
    style.textContent =
      // Banner
      '#cc-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
      'background:#1a1a1a;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;' +
      'font-size:14px;padding:14px 20px;display:flex;align-items:center;' +
      'justify-content:space-between;gap:16px;box-shadow:0 -2px 8px rgba(0,0,0,.2)}' +
      '#cc-banner a{color:#ff7a7a;text-decoration:underline}' +
      '#cc-btns{display:flex;gap:8px;flex-shrink:0}' +
      '#cc-btns button{border:none;border-radius:4px;padding:8px 16px;font-size:14px;' +
      'font-weight:500;cursor:pointer;font-family:inherit}' +
      '#cc-accept{background:#e53a3a;color:#fff}#cc-accept:hover{background:#cb3434}' +
      '#cc-decline{background:transparent;color:#ccc;border:1px solid #555!important}' +
      '#cc-decline:hover{border-color:#999!important}' +
      '#cc-manage{background:transparent;color:#ccc;border:1px solid #555!important}' +
      '#cc-manage:hover{border-color:#999!important}' +
      '@media(max-width:600px){#cc-banner{flex-direction:column;text-align:center}' +
      '#cc-btns{justify-content:center;flex-wrap:wrap}}' +
      // Preferences overlay
      '#cc-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;' +
      'background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;' +
      'font-family:Inter,system-ui,sans-serif}' +
      '#cc-prefs{background:#1a1a1a;color:#e0e0e0;border-radius:12px;padding:24px;' +
      'max-width:440px;width:90%;max-height:90vh;overflow-y:auto;position:relative}' +
      '#cc-prefs h2{margin:0 0 16px;font-size:18px;font-weight:600}' +
      '#cc-prefs-close{position:absolute;top:12px;right:12px;background:none;border:none;' +
      'color:#999;font-size:20px;cursor:pointer;padding:4px 8px;line-height:1}' +
      '#cc-prefs-close:hover{color:#fff}' +
      '.cc-category{padding:12px 0;border-bottom:1px solid #333}' +
      '.cc-category:last-of-type{border-bottom:none}' +
      '.cc-cat-row{display:flex;align-items:center;justify-content:space-between}' +
      '.cc-cat-name{font-weight:500;font-size:14px}' +
      '.cc-cat-desc{font-size:12px;color:#999;margin-top:4px}' +
      '.cc-cat-tools{font-size:11px;color:#777;margin-top:2px}' +
      '.cc-always{font-size:12px;color:#777;font-style:italic}' +
      // Toggle switch
      '.cc-toggle{position:relative;width:44px;height:24px;flex-shrink:0}' +
      '.cc-toggle input{opacity:0;width:100%;height:100%;position:absolute;margin:0;z-index:1;cursor:pointer}' +
      '.cc-toggle-track{position:absolute;top:0;left:0;right:0;bottom:0;' +
      'background:#555;border-radius:12px;cursor:pointer;transition:background .2s}' +
      '.cc-toggle-track:after{content:"";position:absolute;width:18px;height:18px;' +
      'left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s}' +
      '.cc-toggle input:checked+.cc-toggle-track{background:#e53a3a}' +
      '.cc-toggle input:checked+.cc-toggle-track:after{transform:translateX(20px)}' +
      '.cc-toggle input:focus-visible+.cc-toggle-track{outline:2px solid #ff7a7a;outline-offset:2px}' +
      // Preferences buttons
      '.cc-prefs-btns{display:flex;gap:8px;margin-top:16px}' +
      '.cc-prefs-btns button{flex:1;padding:10px;border:none;border-radius:6px;' +
      'font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}' +
      '#cc-reject-all{background:transparent;color:#ccc;border:1px solid #555!important}' +
      '#cc-reject-all:hover{border-color:#999!important}' +
      '#cc-save{background:transparent;color:#ccc;border:1px solid #555!important}' +
      '#cc-save:hover{border-color:#999!important}' +
      '#cc-accept-all{background:#e53a3a;color:#fff}' +
      '#cc-accept-all:hover{background:#cb3434}';
    document.head.appendChild(style);
  }

  // UI: Banner

  function dismissBanner() {
    var el = document.getElementById('cc-banner');
    if (el) el.remove();
  }

  function showBanner() {
    if (document.getElementById('cc-banner')) return;
    injectStyles();

    var banner = document.createElement('div');
    banner.id = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<span>We use cookies for analytics and marketing to improve our site. ' +
      '<a href="/privacy/">Privacy policy</a></span>' +
      '<div id="cc-btns">' +
      '<button id="cc-decline">Decline All</button>' +
      '<button id="cc-manage">Manage Preferences</button>' +
      '<button id="cc-accept">Accept All</button>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('cc-accept').addEventListener('click', function () {
      dismissBanner();
      applyConsent(1, 1);
    });

    document.getElementById('cc-decline').addEventListener('click', function () {
      dismissBanner();
      applyConsent(0, 0, true);
    });

    document.getElementById('cc-manage').addEventListener('click', function () {
      dismissBanner();
      showPreferences();
    });
  }

  // UI: Preferences Panel

  function showPreferences() {
    if (document.getElementById('cc-overlay')) return;
    injectStyles();

    var opener = document.activeElement;
    var consent = parseConsent(getCookie(COOKIE));
    var region = getRegion();

    var restoreConsent = consent && (region !== 'opt_in' || consent.region === 'i');
    var defaultChecked = region === 'opt_in' ? 0 : 1;
    var analyticsChecked = restoreConsent ? consent.analytics : defaultChecked;
    var marketingChecked = navigator.globalPrivacyControl
      ? 0
      : restoreConsent
        ? consent.marketing
        : defaultChecked;

    var overlay = document.createElement('div');
    overlay.id = 'cc-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Cookie preferences');
    overlay.innerHTML =
      '<div id="cc-prefs">' +
      '<h2>Cookie Preferences</h2>' +
      '<button id="cc-prefs-close" aria-label="Close">&times;</button>' +
      '<div class="cc-category">' +
      '<div class="cc-cat-row">' +
      '<span class="cc-cat-name">Necessary</span>' +
      '<span class="cc-always">Always On</span>' +
      '</div>' +
      '<div class="cc-cat-desc">Core site functionality.</div>' +
      '</div>' +
      '<div class="cc-category">' +
      '<div class="cc-cat-row">' +
      '<span class="cc-cat-name" id="cc-analytics-label">Analytics</span>' +
      '<label class="cc-toggle">' +
      '<input type="checkbox" id="cc-analytics" aria-labelledby="cc-analytics-label" aria-describedby="cc-analytics-desc cc-analytics-tools"' +
      (analyticsChecked ? ' checked' : '') +
      '>' +
      '<span class="cc-toggle-track"></span>' +
      '</label>' +
      '</div>' +
      '<div class="cc-cat-desc" id="cc-analytics-desc">Usage measurement.</div>' +
      '<div class="cc-cat-tools" id="cc-analytics-tools">Google Analytics, PostHog</div>' +
      '</div>' +
      '<div class="cc-category">' +
      '<div class="cc-cat-row">' +
      '<span class="cc-cat-name" id="cc-marketing-label">Marketing</span>' +
      '<label class="cc-toggle">' +
      '<input type="checkbox" id="cc-marketing" aria-labelledby="cc-marketing-label" aria-describedby="cc-marketing-desc cc-marketing-tools"' +
      (marketingChecked ? ' checked' : '') +
      (navigator.globalPrivacyControl ? ' disabled' : '') +
      '>' +
      '<span class="cc-toggle-track"></span>' +
      '</label>' +
      '</div>' +
      '<div class="cc-cat-desc" id="cc-marketing-desc">' +
      (navigator.globalPrivacyControl
        ? "Disabled by your browser's privacy signal."
        : 'Advertising &amp; visitor identification.') +
      '</div>' +
      '<div class="cc-cat-tools" id="cc-marketing-tools">Google Ads, Vector, Reo</div>' +
      '</div>' +
      '<div class="cc-prefs-btns">' +
      '<button id="cc-reject-all">Reject All</button>' +
      '<button id="cc-save">Save</button>' +
      '<button id="cc-accept-all">Accept All</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function onKeydown(e) {
      if (e.key === 'Escape') {
        closePrefs();
        return;
      }
      // Focus trap: keep Tab inside the modal
      if (e.key === 'Tab') {
        var focusable = overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function closePrefs(saved) {
      var el = document.getElementById('cc-overlay');
      if (el) el.remove();
      document.removeEventListener('keydown', onKeydown);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
      if (resumeConsentOnClose) {
        resumeConsentOnClose = false;
        if (saved !== true) init();
      }
    }

    document.getElementById('cc-prefs-close').addEventListener('click', closePrefs);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePrefs();
    });

    document.addEventListener('keydown', onKeydown);

    // Move focus into the modal for keyboard/screen-reader users
    document.getElementById('cc-prefs-close').focus();

    document.getElementById('cc-save').addEventListener('click', function () {
      var a = document.getElementById('cc-analytics').checked ? 1 : 0;
      var m = document.getElementById('cc-marketing').checked ? 1 : 0;
      closePrefs(true);
      applyConsent(a, m);
    });

    document.getElementById('cc-reject-all').addEventListener('click', function () {
      closePrefs(true);
      applyConsent(0, 0, true);
    });

    document.getElementById('cc-accept-all').addEventListener('click', function () {
      closePrefs(true);
      applyConsent(1, 1);
    });
  }

  // Global API

  window.__pf_manage_cookies = function () {
    dismissBanner();
    showPreferences();
  };

  // Hash Handling

  function checkHash() {
    if (window.location.hash === '#manage-cookies') {
      window.__pf_manage_cookies();
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  window.addEventListener('hashchange', checkHash);

  // Migration

  function migrateIfNeeded() {
    var raw = getCookie(COOKIE);
    if (raw === '1' || raw === '0') {
      var consent = parseConsent(raw);
      if (consent) {
        setCookie(COOKIE, serializeConsent(consent.analytics, consent.marketing));
      }
      return parseConsent(getCookie(COOKIE));
    }
    if (!raw) {
      return null;
    }

    var parsed = parseConsent(raw);
    if (!parsed) {
      deleteCookie(COOKIE);
    }
    return parsed;
  }

  // Init

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  function showPreferencesFromHash() {
    if (window.location.hash !== '#manage-cookies') return false;
    resumeConsentOnClose = true;
    publishConsent(null);
    onReady(checkHash);
    return true;
  }

  function handleOptIn(consent) {
    var nextConsent = consent;
    // Suspend grants from another region, retaining saved refusals for a return visit.
    if (
      nextConsent &&
      nextConsent.region !== 'i' &&
      (nextConsent.analytics || nextConsent.marketing)
    ) {
      clearVendorCookies();
      nextConsent = null;
    }
    if (showPreferencesFromHash()) return;
    if (nextConsent) {
      loadByConsent(saveConsent(nextConsent.analytics, nextConsent.marketing, nextConsent.region));
      onReady(checkHash);
      return;
    }
    publishConsent(null);
    onReady(showBanner);
  }

  function init() {
    var region = getRegion();
    window.__pf_privacy_region = region;
    var consent = migrateIfNeeded();

    if (region === 'opt_in') {
      handleOptIn(consent);
      return;
    }

    if (showPreferencesFromHash()) return;
    var saved = saveConsent(
      consent ? consent.analytics : 1,
      consent ? consent.marketing : 1,
      consent ? consent.region : undefined,
    );
    loadByConsent(saved);
  }

  init();
})();
