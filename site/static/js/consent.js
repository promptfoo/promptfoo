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
 * Preserve old refusals. An old grant covered analytics only and recorded no region.
 *
 * GPC (navigator.globalPrivacyControl) disables marketing in every region.
 *
 * To open preferences, call window.__pf_manage_cookies() or navigate to #manage-cookies.
 */
(function () {
  var COOKIE = 'pf_consent';
  var DAYS = 365;
  var resumeConsentOnClose = false;
  var googleTags = {
    'G-3TS8QLZQ93': 'analytics',
    'G-3YM29CN26E': 'analytics',
    'AW-17347444171': 'marketing',
  };
  var gtagReady = false;
  var configuredTags = new Set();

  // ISO 3166-1 destinations outside the opt-in regions and the US.
  // An allowlist keeps aliases, macroregions and unfamiliar codes opt-in.
  var NOTICE_COUNTRIES = new Set(
    [
      'AD AE AF AG AI AL AM AO AQ AR AS AU AW AZ BA BB BD BF BH BI BJ BL BM BN',
      'BO BQ BS BT BV BW BY BZ CC CD CF CG CI CK CL CM CN CO CR CU CV CW CX DJ',
      'DM DO DZ EC EG EH ER ET FJ FK FM FO GA GD GE GG GH GI GL GM GN GQ GS GT',
      'GU GW GY HK HM HN HT ID IL IM IN IO IQ IR JE JM JO JP KE KG KH KI KM KN',
      'KP KR KW KY KZ LA LB LC LK LR LS LY MA MC MD ME MG MH MK ML MM MN MO MP',
      'MR MS MU MV MW MX MY MZ NA NC NE NF NG NI NP NR NU NZ OM PA PE PF PG PH',
      'PK PM PN PR PS PW PY QA RS RU RW SA SB SC SD SG SH SJ SL SM SN SO SR SS',
      'ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM',
      'UY UZ VA VC VE VG VI VN VU WF WS YE ZA ZM ZW',
    ]
      .join(' ')
      .split(' '),
  );

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
    if (country === 'US') return 'opt_out';
    return NOTICE_COUNTRIES.has(country) ? 'notice' : 'opt_in';
  }

  var REGION_CODE = { opt_in: 'i', opt_out: 'o', notice: 'n' };

  // Cookie Format

  function parseConsent(raw) {
    // v1.{region}.{analytics}.{marketing}
    var match = /^v1\.([ion])\.([01])\.([01])$/.exec(raw);
    if (!match) return null;
    return { region: match[1], analytics: Number(match[2]), marketing: Number(match[3]) };
  }

  function serializeConsent(analytics, marketing, region) {
    var r = region || REGION_CODE[getRegion()];
    return 'v1.' + r + '.' + (analytics ? 1 : 0) + '.' + (marketing ? 1 : 0);
  }

  function publishConsent(consent, revokeManual) {
    window.__pf_consent = consent;
    // Disable active destinations synchronously, including while a reload is pending.
    Object.keys(googleTags).forEach(function (id) {
      window['ga-disable-' + id] = !consent || !consent[googleTags[id]];
    });
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
    if (window.__pf_posthog_loaded && window.posthog) {
      try {
        if (!consent.analytics) {
          // Stop capture while the reload unloads the other active trackers.
          window.posthog.opt_out_capturing();
        } else if (window.posthog.has_opted_out_capturing()) {
          window.posthog.set_config({ disable_persistence: false });
          window.posthog.opt_in_capturing();
        }
      } catch (error) {
        // A vendor failure must not prevent the reload that stops other trackers.
        console.error('Error updating PostHog consent:', error);
      }
    }
    return consent;
  }

  function applyConsent(analytics, marketing, revokeManual) {
    revokeManual =
      !!revokeManual || !!(window.__pf_consent && window.__pf_consent.marketing && !marketing);
    var consent = saveConsent(analytics, marketing, undefined, revokeManual);
    loadByConsent(consent);
    if (
      (!consent.analytics && window.__pf_analytics_loaded) ||
      (!consent.marketing && window.__pf_marketing_loaded) ||
      (revokeManual && window.__pf_third_party_loaded)
    ) {
      window.location.reload();
      return;
    }
  }

  // Script Loading

  function googleDestinations() {
    var consent = window.__pf_consent;
    return Object.keys(googleTags).filter(function (id) {
      return consent && consent[googleTags[id]];
    });
  }

  // Config sends an initial page view. Never queue it before the tag finishes loading.
  function configureGoogleTags() {
    googleDestinations().forEach(function (id) {
      if (!configuredTags.has(id)) {
        configuredTags.add(id);
        window.gtag('config', id, { anonymize_ip: true });
      }
    });
  }

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
      if (!gtagReady) return;
      var destinations = googleDestinations();
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
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleDestinations()[0];
    g.onload = function () {
      gtagReady = true;
      configureGoogleTags();
    };
    document.head.appendChild(g);
  }

  function loadByConsent(consent) {
    if (!consent || (!consent.analytics && !consent.marketing)) return;
    ensureGtagJs();
    if (gtagReady) configureGoogleTags();
    ['analytics', 'marketing'].forEach(function (category) {
      var loaded = '__pf_' + category + '_loaded';
      if (!consent[category] || window[loaded]) return;
      window[loaded] = true;
      var script = document.createElement('script');
      script.async = true;
      script.src = '/js/scripts-' + category + '.js';
      document.head.appendChild(script);
    });
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

    document.getElementById('cc-manage').addEventListener('click', showPreferences);
  }

  // UI: Preferences Panel

  function showPreferences() {
    if (document.getElementById('cc-overlay')) return;
    injectStyles();

    var opener = document.activeElement;
    var banner = document.getElementById('cc-banner');
    if (banner) {
      if (opener === document.body) opener = document.getElementById('cc-manage');
      banner.remove();
    }
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
      if (saved !== true && banner) document.body.appendChild(banner);
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

  window.__pf_manage_cookies = showPreferences;

  // Hash Handling

  function checkHash() {
    if (window.location.hash === '#manage-cookies') {
      window.__pf_manage_cookies();
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  window.addEventListener('hashchange', checkHash);

  // Migration

  function migrateIfNeeded(region) {
    var raw = getCookie(COOKIE);
    if (raw === '0' || (raw === '1' && region !== 'opt_in')) {
      raw = serializeConsent(raw === '1', false, REGION_CODE[region]);
      setCookie(COOKIE, raw);
    }
    var consent = parseConsent(raw);
    if (raw && !consent) {
      deleteCookie(COOKIE);
      clearVendorCookies();
    }
    return consent;
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
    var consent = migrateIfNeeded(region);

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
