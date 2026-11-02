// Marketing scripts: Google Ads + Vector.co + Reo.dev
// Loaded by consent.js when marketing consent is granted.

(function () {
  // Consent can change while this script is downloading.
  if (!window.__pf_consent || !window.__pf_consent.marketing) {
    window.__pf_marketing_loaded = false;
    return;
  }

  gtag('config', 'AW-17347444171', { anonymize_ip: true });

  // Vector.co
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
        var pixelLoaded = false;
        function startVector() {
          if (!pixelLoaded || !e.__pf_consent || !e.__pf_consent.marketing) return;
          e.removeEventListener('pf_consent_change', startVector);
          e.vector.load('18d08a7d-45cf-4805-b8b1-978305be5dd4');
        }
        e.addEventListener('pf_consent_change', startVector);
        var i = r.createElement('script');
        i.onload = function () {
          pixelLoaded = true;
          startVector();
        };
        (i.type = 'text/javascript'), (i.async = !0), (i.src = 'https://cdn.vector.co/pixel.js');
        var l = r.getElementsByTagName('script')[0];
        l.parentNode.insertBefore(i, l), (t.loaded = !0);
      }
    } catch (e) {
      console.error('Error loading Vector:', e);
    }
  })(window, document);

  // Reo.dev
  !(function () {
    var e, t, n;
    (e = '59f3ca4439de16d'),
      (t = function () {
        if (window.__pf_consent && window.__pf_consent.marketing) {
          window.removeEventListener('pf_consent_change', t);
          Reo.init({ clientID: '59f3ca4439de16d' });
        } else {
          window.addEventListener('pf_consent_change', t);
        }
      }),
      ((n = document.createElement('script')).src = 'https://static.reo.dev/' + e + '/reo.js'),
      (n.defer = !0),
      (n.onload = t),
      document.head.appendChild(n);
  })();
})();
