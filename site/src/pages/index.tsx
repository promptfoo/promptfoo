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
        <h1 className="hero__title">Ship LLM apps with confidence</h1>
        <p className="hero__subtitle">Improve quality, detect failures, and reduce risk</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageWalkthrough() {
  const [selectedStep, setSelectedStep] = React.useState(1);

  const steps = [
    {
      id: 1,
      caption: 'Detailed evaluations',
      image:
        'https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png',
      description: 'Start comparing models and prompts in minutes: `npx promptfoo@latest init`',
    },
    {
      id: 2,
      caption: 'Discover vulnerabilities',
      image: '/img/riskreport-1.png',
      description:
        'Scan your application for security vulnerabilities, data leaks, and other risks.',
    },
    {
      id: 3,
      caption: 'Simple, declarative config',
      image: '/img/yaml-example.png',
      description: 'Just a simple YAML file. No SDK integrations. Language agnostic.',
    },
  ];

  return (
    <div className={styles.walkthroughContainer}>
      <div className={styles.walkthroughButtons}>
        {steps.map((step) => (
          <div key={step.id}>
            <button
              className={clsx(
                styles.walkthroughButton,
                selectedStep === step.id && styles.walkthroughButtonActive,
              )}
              onClick={() => setSelectedStep(step.id)}
            >
              <span className={styles.walkthroughButtonNumber}>{step.id}</span>
              {step.caption}
            </button>
            {selectedStep === step.id && (
              <p className={styles.walkthroughDescription}>{step.description}</p>
            )}
          </div>
        ))}
      </div>
      <div className={styles.walkthroughImageContainer}>
        <img
          src={steps.find((step) => step.id === selectedStep)?.image}
          alt={`Walkthrough step ${selectedStep}`}
          className={styles.walkthroughImage}
        />
      </div>
    </div>
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
      <HomepageWalkthrough />
      <main>
        <HomepageInfo />
        <HomepageFeatures />

        <div className={styles.imageSection}>
          <h4>Web Viewer</h4>
          <Link to="/docs/intro">
            <img
              className={styles.featureImage}
              src="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png"
              alt="Web Viewer"
            />
          </Link>
        </div>
        <div className={styles.imageSection}>
          <h4>Command line</h4>
          <Link to="/docs/intro">
            <img
              className={styles.featureImage}
              src="https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif"
              alt="Command line"
            />
          </Link>
        </div>
        <div className={styles.imageSection}>
          <h4>Red Teaming &amp; Risk Assessment</h4>
          <Link to="/docs/red-team">
            <img
              className={styles.featureImage}
              src="/img/riskreport-1.png"
              srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
              alt="Red Teaming & Risk Assessment"
            />
          </Link>
        </div>
        <div className={styles.ctaSection}>
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
