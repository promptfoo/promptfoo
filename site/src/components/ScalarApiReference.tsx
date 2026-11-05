import React, { useEffect, useState } from 'react';

import Layout from '@theme/Layout';

// Scalar auto-mounts a second instance if the page contains its legacy #api-reference ID.
const SCALAR_CONTAINER_ID = 'promptfoo-api-reference';
const SCALAR_SCRIPT_ID = 'scalar-api-reference-script';
const SCALAR_SCRIPT_SRC =
  'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.53.0/dist/browser/standalone.js';
const SCALAR_SCRIPT_INTEGRITY =
  'sha384-Jk7jdVoWEv+zbslst2LBkEeZMM1J/QyvsponRKeOwZI6+fosZhElkDmYsFFVVfoF';

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
  description: string;
  heading: string;
  showTestRequestButton?: boolean;
  specUrl: string;
  summary: string;
};

export default function ScalarApiReference({
  description,
  heading,
  showTestRequestButton = true,
  specUrl,
  summary,
}: ScalarApiReferenceProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let reference: ScalarReference | undefined;
    let observer: MutationObserver | undefined;
    let script: HTMLScriptElement | undefined;
    const bodyClasses = document.body.classList;
    const hadDarkMode = bodyClasses.contains('dark-mode');
    const hadLightMode = bodyClasses.contains('light-mode');
    const getMode = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

    function mount() {
      try {
        reference = (window as ScalarWindow).Scalar?.createApiReference?.(
          `#${SCALAR_CONTAINER_ID}`,
          {
            url: specUrl,
            theme: 'alternate',
            forceDarkModeState: getMode(),
            hideTestRequestButton: !showTestRequestButton,
          },
        );
        if (reference) {
          // Scalar 1.x sets these body classes at mount. Follow later site theme changes
          // without remounting the viewer and losing the reader's place.
          observer = new MutationObserver(() => {
            const dark = getMode() === 'dark';
            bodyClasses.toggle('dark-mode', dark);
            bodyClasses.toggle('light-mode', !dark);
          });
          observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
        }
        setLoadState(reference ? 'loaded' : 'error');
      } catch {
        setLoadState('error');
      }
    }

    if ((window as ScalarWindow).Scalar?.createApiReference) {
      mount();
    } else {
      setLoadState('loading');
      script = document.createElement('script');
      script.id = SCALAR_SCRIPT_ID;
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
      observer?.disconnect();
      reference?.destroy?.();
      bodyClasses.toggle('dark-mode', hadDarkMode);
      bodyClasses.toggle('light-mode', hadLightMode);
    };
  }, [showTestRequestButton, specUrl]);

  return (
    <Layout title={heading} description={description}>
      <main>
        <section
          style={{
            margin: '0 auto',
            maxWidth: 'var(--ifm-container-width-xl)',
            padding: '2rem var(--ifm-spacing-horizontal) 0',
          }}
        >
          <h1>{heading}</h1>
          <p>
            {summary} The raw spec is available as <a href={specUrl}>OpenAPI JSON</a>.
          </p>
          {loadState === 'error' ? (
            <p role="alert">
              The interactive API reference failed to load. The generated{' '}
              <a href={specUrl}>OpenAPI JSON</a> is still available.
            </p>
          ) : null}
        </section>
        <div aria-busy={loadState === 'loading'} id={SCALAR_CONTAINER_ID}></div>
      </main>
    </Layout>
  );
}
