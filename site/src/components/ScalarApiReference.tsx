import React, { useEffect, useState } from 'react';

import Layout from '@theme/Layout';

// Scalar auto-mounts a second instance if the page contains its legacy #api-reference ID.
const SCALAR_CONTAINER_ID = 'promptfoo-api-reference';
const SCALAR_SCRIPT_SRC =
  'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.2/dist/browser/standalone.js';
const SCALAR_SCRIPT_INTEGRITY =
  'sha384-mCh2A/B6vkfhiHyzwBZm7lbFmEK5fE/96Kbtk+RH1zei1P/XEt0I2MCiG6WfZdor';

type ScalarReference = {
  destroy?: () => void;
};

type ScalarWindow = Window & {
  Scalar?: {
    createApiReference?: (
      element: string | Element,
      configuration: Record<string, unknown>,
    ) => ScalarReference | undefined;
  };
};

type ScalarApiReferenceProps = {
  children?: React.ReactNode;
  description: string;
  heading: string;
  hideTestRequestButton?: boolean;
  specUrl: string;
};

export default function ScalarApiReference({
  children,
  description,
  heading,
  hideTestRequestButton = false,
  specUrl,
}: ScalarApiReferenceProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    const scalarWindow = window as ScalarWindow;
    let reference: ScalarReference | undefined;
    let script: HTMLScriptElement | undefined;
    const bodyClasses = document.body.classList;
    const hadDarkMode = bodyClasses.contains('dark-mode');
    const hadLightMode = bodyClasses.contains('light-mode');
    const getMode = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

    // Scalar reads the color mode on mount. Follow the site theme without remounting the viewer.
    const observer = new MutationObserver(() => {
      const dark = getMode() === 'dark';
      bodyClasses.toggle('dark-mode', dark);
      bodyClasses.toggle('light-mode', !dark);
    });

    function mount() {
      try {
        reference = scalarWindow.Scalar?.createApiReference?.(`#${SCALAR_CONTAINER_ID}`, {
          url: specUrl,
          theme: 'alternate',
          forceDarkModeState: getMode(),
          hideTestRequestButton,
        });
        if (reference) {
          observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
        }
        setLoadState(reference ? 'loaded' : 'error');
      } catch {
        setLoadState('error');
      }
    }

    if (scalarWindow.Scalar?.createApiReference) {
      mount();
    } else {
      setLoadState('loading');
      script = document.createElement('script');
      script.src = SCALAR_SCRIPT_SRC;
      script.crossOrigin = 'anonymous';
      script.integrity = SCALAR_SCRIPT_INTEGRITY;
      script.onload = mount;
      script.onerror = () => setLoadState('error');
      document.head.appendChild(script);
    }

    return () => {
      if (script) {
        script.onload = null;
        script.onerror = null;
        script.remove();
      }
      observer.disconnect();
      reference?.destroy?.();
      bodyClasses.toggle('dark-mode', hadDarkMode);
      bodyClasses.toggle('light-mode', hadLightMode);
    };
  }, [hideTestRequestButton, specUrl]);

  return (
    <Layout title={heading} description={description}>
      <main>
        <header className="container padding-top--lg">
          <h1>{heading}</h1>
          <p>{description}</p>
          <a href={specUrl}>OpenAPI JSON</a>
          {loadState === 'error' && <p role="alert">The interactive reference failed to load.</p>}
        </header>
        {children}
        <div aria-busy={loadState === 'loading'} id={SCALAR_CONTAINER_ID}></div>
      </main>
    </Layout>
  );
}
