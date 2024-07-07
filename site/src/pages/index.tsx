import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
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
        <p className="hero__subtitle">Open-source LLM testing used by 20,000 developers</p>
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
  const [selectedStep, setSelectedStep] = React.useState(window.innerWidth < 768 ? null : 1);
  const steps = [
    {
      id: 1,
      caption: 'Build reliable prompts, RAGs, and agents',
      image: '/img/claude-vs-gpt-example.png',
      description: (
        <>
          <p>Start testing the performance of your models, prompts, and tools in minutes:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>Promptfoo runs locally and can integrate directly with your app.</p>
          <p>
            <Link to="/docs/intro">&raquo; Learn more</Link>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
    },
    {
      id: 2,
      caption: 'Catch security, legal, and brand risks',
      image: '/img/riskreport-1.png',
      description: (
        <>
          <p>
            Set up automated scans for security vulnerabilities, data leaks, and other business and
            legal risks.
          </p>
          <p>
            <Link to="/docs/red-team">&raquo; Learn more</Link>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/docs/red-team',
    },
    {
      id: 3,
      caption: 'Simple, local configuration',
      image: '/img/yaml-example.png',
      description: (
        <>
          <p>
            Promptfoo uses a simple, declarative config and runs completely locally on your machine.
            No SDKs, cloud dependencies, or logins.
          </p>
          <p>
            <Link to="/docs/getting-started">&raquo; See setup docs</Link>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/docs/getting-started',
    },
  ];

  const selectedStepData = steps.find((step) => step.id === selectedStep);

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
              <span className={styles.walkthroughButtonNumber}>{step.icon}</span>
              {step.caption}
            </button>
            {selectedStep === step.id && (
              <p className={styles.walkthroughDescription}>{step.description}</p>
            )}
          </div>
        ))}
      </div>
      <div className={styles.walkthroughImageContainer}>
        <Link to={selectedStepData?.destinationUrl || '#'}>
          <img
            src={selectedStepData?.image || steps[0].image}
            alt={`Walkthrough step ${selectedStep || 1}`}
            className={styles.walkthroughImage}
          />
        </Link>
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
