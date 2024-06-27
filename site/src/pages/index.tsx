import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageInfo from '@site/src/components/HomepageInfo';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">Iterate on LLMs faster</h1>
        <p className="hero__subtitle">Measure LLM quality and catch regressions</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Iterate on LLMs faster"
      description="Tailored LLM evals for your use case. Maximize model quality and catch regressions."
    >
      <HomepageHeader />
      <main>
        <HomepageInfo />
        <HomepageFeatures />

        <div style={{ textAlign: 'center', padding: '2rem 0 4rem 0' }}>
          <h4>Web Viewer</h4>
          <Link to="/docs/intro">
            <img
              style={{ maxWidth: 'min(100%, 1024px)', border: '1px solid #ddd', borderRadius: 10 }}
              src="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png"
            />
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0 8rem 0' }}>
          <h4>Command line</h4>
          <Link to="/docs/intro">
            <img
              style={{ maxWidth: 'min(100%, 1024px)', border: '1px solid #ddd', borderRadius: 10 }}
              src="https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif"
            />
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0 8rem 0' }}>
          <h4>Red Teaming &amp; Risk Assessment</h4>
          <Link to="/docs/red-team">
            <img
              style={{ maxWidth: 'min(100%, 1024px)', border: '1px solid #ddd', borderRadius: 10 }}
              src="/img/riskreport-1.png"
              srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
            />
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0 12rem 0' }}>
          <h3>promptfoo is used by LLM apps serving over 10 million users</h3>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Get Started
            </Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
