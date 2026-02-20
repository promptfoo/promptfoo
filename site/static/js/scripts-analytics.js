// Analytics scripts: GA4 + PostHog + SPA tracking
// Loaded by consent.js when analytics consent is granted.

// Define gtag stub if not already defined
window.dataLayer = window.dataLayer || [];
window.gtag =
  window.gtag ||
  function () {
    window.dataLayer.push(arguments);
  };

// Configure GA4 (gtag.js is loaded by consent.js before this script)
gtag('js', new Date());
gtag('config', 'G-3TS8QLZQ93', { anonymize_ip: true });
gtag('config', 'G-3YM29CN26E', { anonymize_ip: true });

// Track SPA route changes (replaces Docusaurus gtag plugin)
(function () {
  var prev = location.pathname + location.search;
  function onNav() {
    var current = location.pathname + location.search;
    if (current !== prev) {
      prev = current;
      gtag('event', 'page_view', {
        page_path: current,
        page_location: location.href,
      });
    }
  }
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    onNav();
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    onNav();
  };
  window.addEventListener('popstate', onNav);
})();

// PostHog
!(function (t, e) {
  var o, n, p, r;
  e.__SV ||
    ((window.posthog = e),
    (e._i = []),
    (e.init = function (i, s, a) {
      function g(t, e) {
        var o = e.split('.');
        2 == o.length && ((t = t[o[0]]), (e = o[1])),
          (t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          });
      }
      ((p = t.createElement('script')).type = 'text/javascript'),
        (p.async = !0),
        (p.src =
          s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js'),
        (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
      var u = e;
      for (
        void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
          u.people = u.people || [],
          u.toString = function (t) {
            var e = 'posthog';
            return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
          },
          u.people.toString = function () {
            return u.toString(1) + '.people (stub)';
          },
          o =
            'capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonProperties'.split(
              ' ',
            ),
          n = 0;
        n < o.length;
        n++
      )
        g(u, o[n]);
      e._i.push([i, s, a]);
    }),
    (e.__SV = 1));
})(document, window.posthog || []);
posthog.init('phc_gOS5ctlYqd64vmJtYVpAU0W5iew7OopcETkyYNpkyYP', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
});
