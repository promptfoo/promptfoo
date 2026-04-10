import React, { useEffect } from 'react';

import Layout from '@theme/Layout';

function getScalarTheme() {
  if (typeof document === 'undefined') {
    return 'alternate';
  }
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'alternate';
}

export default function ApiReference() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
    script.setAttribute('data-theme', getScalarTheme());
    script.addEventListener('load', () => {
      // Once Scalar is loaded from the CDN, we can reference the object
      (window as any).Scalar.createApiReference('#app', {
        url: 'https://api.promptfoo.app/static/openapi.json',
      });
    });
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  // Hack to apply the theme to the Scalar app
  //  The 'light' theme is broken, so we use the 'alternate' theme instead
  useEffect(() => {
    const app = document.getElementById('app');
    if (!app) {
      return;
    }

    const applyTheme = () => {
      app.dataset.theme = getScalarTheme();
    };

    applyTheme();

    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <Layout title="API Reference | Promptfoo" description="API Reference">
      <main id="app"></main>
    </Layout>
  );
}
