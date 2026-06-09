import React, { type ReactNode, useEffect, useState } from 'react';

import Layout from '@theme/Layout';

const SCALAR_CONTAINER_ID = 'api-reference';
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
  summary: ReactNode;
  title: string;
};

function getScalarTheme() {
  if (typeof document === 'undefined') {
    return 'alternate';
  }
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'alternate';
}

export default function ScalarApiReference({
  description,
  heading,
  showTestRequestButton = true,
  specUrl,
  summary,
  title,
}: ScalarApiReferenceProps) {
  const [isReferenceLoaded, setIsReferenceLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let scalarReference: ScalarReference | undefined;
    setIsReferenceLoaded(false);
    setLoadError(false);

    const destroyReference = () => {
      scalarReference?.destroy?.();
      scalarReference = undefined;
    };

    const renderReference = () => {
      const scalar = (window as ScalarWindow).Scalar;
      if (!scalar?.createApiReference) {
        setLoadError(true);
        return;
      }

      destroyReference();
      scalarReference = scalar.createApiReference(`#${SCALAR_CONTAINER_ID}`, {
        hideTestRequestButton: !showTestRequestButton,
        theme: getScalarTheme(),
        url: specUrl,
      });
      if (!scalarReference) {
        setLoadError(true);
        return;
      }
      setIsReferenceLoaded(true);
      setLoadError(false);
    };

    const existingScript = document.getElementById(SCALAR_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    const handleLoad = () => {
      script.dataset.status = 'loaded';
      renderReference();
    };

    const handleError = () => {
      script.dataset.status = 'error';
      setLoadError(true);
    };

    if (!existingScript) {
      script.id = SCALAR_SCRIPT_ID;
      script.src = SCALAR_SCRIPT_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.integrity = SCALAR_SCRIPT_INTEGRITY;
      script.dataset.status = 'loading';
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      document.head.appendChild(script);
    } else if (
      script.dataset.status === 'loaded' ||
      (window as ScalarWindow).Scalar?.createApiReference
    ) {
      renderReference();
    } else if (script.dataset.status === 'error') {
      setLoadError(true);
    } else {
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
    }

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      destroyReference();
    };
  }, [showTestRequestButton, specUrl]);

  // Scalar's light theme does not match the site palette, so use alternate for light mode.
  useEffect(() => {
    const apiReference = document.getElementById(SCALAR_CONTAINER_ID);
    if (!apiReference) {
      return;
    }

    const applyTheme = () => {
      apiReference.dataset.theme = getScalarTheme();
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
    <Layout title={title} description={description}>
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
          {loadError ? (
            <p role="alert">
              The interactive API reference failed to load. The generated{' '}
              <a href={specUrl}>OpenAPI JSON</a> is still available.
            </p>
          ) : null}
          <noscript>
            The generated <a href={specUrl}>OpenAPI JSON</a> is available without JavaScript.
          </noscript>
        </section>
        <div aria-busy={!isReferenceLoaded && !loadError} id={SCALAR_CONTAINER_ID}></div>
      </main>
    </Layout>
  );
}
