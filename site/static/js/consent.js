/**
 * Lightweight cookie consent banner.
 * Blocks analytics/tracking scripts until the user opts in.
 * Only shown to EU/EEA/UK visitors (detected via Cloudflare CF-IPCountry header).
 * Non-EU visitors get scripts loaded immediately.
 *
 * To reopen the banner, call window.__pf_manage_cookies() or click the
 * "Cookie Settings" footer link (which navigates to #manage-cookies).
 * Withdrawing consent after acceptance reloads the page to stop trackers.
 */
(function () {
  var COOKIE = 'pf_consent';
  var DAYS = 365;

  // EU-27 + EEA (IS, LI, NO) + UK + CH
  var EU_COUNTRIES =
    'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH';

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? m[2] : null;
  }

  function setCookie(name, v) {
    var d = new Date();
    d.setTime(d.getTime() + DAYS * 864e5);
    document.cookie =
      name + '=' + v + ';path=/;expires=' + d.toUTCString() + ';SameSite=Lax;Secure';
  }

  function loadScripts() {
    if (window.__pf_scripts_loaded) return;
    window.__pf_scripts_loaded = true;

    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=G-3TS8QLZQ93';
    document.head.appendChild(g);

    var s = document.createElement('script');
    s.async = true;
    s.src = '/js/scripts.js';
    document.head.appendChild(s);
  }

  function dismiss() {
    var el = document.getElementById('cc-banner');
    if (el) el.remove();
  }

  function isEU() {
    var country = getCookie('pf_country');
    if (!country) return false; // Default to non-EU if no country cookie
    return EU_COUNTRIES.indexOf(country) !== -1;
  }

  function injectStyles() {
    if (document.getElementById('cc-styles')) return;
    var style = document.createElement('style');
    style.id = 'cc-styles';
    style.textContent =
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
      '@media(max-width:600px){#cc-banner{flex-direction:column;text-align:center}' +
      '#cc-btns{justify-content:center}}';
    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById('cc-banner')) return;
    injectStyles();

    var scriptsWereLoaded = !!window.__pf_scripts_loaded;

    var banner = document.createElement('div');
    banner.id = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<span>We use cookies for analytics to improve our site. ' +
      '<a href="/privacy/">Privacy policy</a></span>' +
      '<div id="cc-btns">' +
      '<button id="cc-decline">Decline</button>' +
      '<button id="cc-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('cc-accept').addEventListener('click', function () {
      setCookie(COOKIE, '1');
      dismiss();
      loadScripts();
    });

    document.getElementById('cc-decline').addEventListener('click', function () {
      setCookie(COOKIE, '0');
      dismiss();
      // If trackers were already running, reload to stop them
      if (scriptsWereLoaded) {
        window.location.reload();
      }
    });
  }

  // Expose global method to reopen preferences (used by footer link)
  window.__pf_manage_cookies = function () {
    document.cookie = COOKIE + '=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    showBanner();
  };

  // Handle #manage-cookies hash (footer link)
  function checkHash() {
    if (window.location.hash === '#manage-cookies') {
      window.__pf_manage_cookies();
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  window.addEventListener('hashchange', checkHash);

  // Non-EU visitors: load scripts immediately, unless #manage-cookies is present
  if (!isEU()) {
    // Check if user is actively requesting cookie settings before loading
    if (window.location.hash === '#manage-cookies') {
      var showOnReady = function () {
        window.__pf_manage_cookies();
        history.replaceState(null, '', window.location.pathname + window.location.search);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showOnReady);
      } else {
        showOnReady();
      }
    } else {
      loadScripts();
    }
    return;
  }

  // EU visitors: check prior consent
  var consent = getCookie(COOKIE);
  if (consent === '1') {
    loadScripts();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkHash);
    } else {
      checkHash();
    }
    return;
  }
  if (consent === '0') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkHash);
    } else {
      checkHash();
    }
    return;
  }

  // First visit EU visitor: show banner once body is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
