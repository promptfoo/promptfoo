/* eslint-disable */

!(function (t) {
  if (window.ko) return;
  (window.ko = []),
    ['identify', 'track', 'removeListeners', 'open', 'on', 'off', 'qualify', 'ready'].forEach(
      function (t) {
        ko[t] = function () {
          var n = [].slice.call(arguments);
          return n.unshift(t), ko.push(n), ko;
        };
      },
    );
  var n = document.createElement('script');
  (n.async = !0),
    n.setAttribute(
      'src',
      'https://cdn.getkoala.com/v1/pk_27d6c47cb0df11c274749db81d01a49ddee8/sdk.js',
    ),
    (document.body || document.head).appendChild(n);

  document.addEventListener('copy', function () {
    const content = window.getSelection().toString();
    ko.track('Content Copied', {
      url: window.location.pathname,
      content,
    });
  });
})();

!(function (e, r) {
  try {
    if (e.vector) return void console.log('Vector snippet included more than once.');
    var t = {};
    t.q = t.q || [];
    for (
      var o = ['load', 'identify', 'on'],
        n = function (e) {
          return function () {
            var r = Array.prototype.slice.call(arguments);
            t.q.push([e, r]);
          };
        },
        c = 0;
      c < o.length;
      c++
    ) {
      var a = o[c];
      t[a] = n(a);
    }
    if (((e.vector = t), !t.loaded)) {
      var i = r.createElement('script');
      (i.type = 'text/javascript'), (i.async = !0), (i.src = 'https://cdn.vector.co/pixel.js');
      var l = r.getElementsByTagName('script')[0];
      l.parentNode.insertBefore(i, l), (t.loaded = !0);
    }
  } catch (e) {
    console.error('Error loading Vector:', e);
  }
})(window, document);
vector.load('18d08a7d-45cf-4805-b8b1-978305be5dd4');

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
  person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
});

/* Reo */
!(function () {
  var e, t, n;
  (e = '59f3ca4439de16d'),
    (t = function () {
      Reo.init({ clientID: '59f3ca4439de16d' });
    }),
    ((n = document.createElement('script')).src = 'https://static.reo.dev/' + e + '/reo.js'),
    (n.defer = !0),
    (n.onload = t),
    document.head.appendChild(n);
})();
