import React, { useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import Layout from '@theme/Layout';

export default function ApiReference() {
  const theme = useTheme();
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
    script.setAttribute('data-theme', theme.palette.mode === 'dark' ? 'dark' : 'alternate');
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
    if (app) {
      app.dataset.theme = theme.palette.mode === 'dark' ? 'dark' : 'alternate';
    }
  }, [theme.palette.mode]);
  return (
    <Layout title="API Reference | Promptfoo" description="API Reference">
      <main id="app"></main>
    </Layout>
  );
}
