// Marketing scripts: Google Ads + Vector.co + Reo.dev
// Loaded by consent.js when marketing consent is granted.

// Define gtag stub if not already defined
window.dataLayer = window.dataLayer || [];
window.gtag =
  window.gtag ||
  function () {
    window.dataLayer.push(arguments);
  };

// Google Ads
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

// Reo.dev
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
