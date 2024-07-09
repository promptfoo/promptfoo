import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageInfo from '@site/src/components/HomepageInfo';
import LogoContainer from '@site/src/components/LogoContainer';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1>Ship LLM apps with confidence</h1>
        <p>Open-source LLM testing used by 20,000+ developers</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to={
              typeof window !== 'undefined' && window.location.hash === '#redteam'
                ? '/docs/red-team'
                : '/docs/intro'
            }
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageWalkthrough() {
  const [selectedStep, setSelectedStep] = React.useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#redteam') {
      return 2;
    }
    return 1;
  });
  const steps = [
    {
      id: 1,
      caption: 'Evaluations',
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      description: (
        <>
          <p>
            <strong>Build reliable prompts, RAGs, and agents</strong>
          </p>
          <p>Start testing the performance of your models, prompts, and tools in minutes:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>
            Promptfoo runs locally and integrates directly with your app - no SDKs, cloud
            dependencies, or logins.
          </p>
          <p>
            <Link to="/docs/intro">&raquo; Get Started</Link>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
    },
    {
      id: 2,
      caption: 'Security & Red Teaming',
      image: '/img/riskreport-1.png',
      image2x: '/img/riskreport-1@2x.png',
      description: (
        <>
          <p>
            <strong>Find and fix LLM vulnerabilities</strong>
          </p>
          <p>
            Run an automatic scan tailored to your application that detects security, legal, and
            brand risks:
          </p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam init</code>
          </pre>
          <p>Our red teaming covers failures like:</p>
          <ul>
            <li>PII leaks</li>
            <li>Jailbreaks</li>
            <li>Harmful content</li>
            <li>Specialized medical and legal advice</li>
            <li>Competitor endorsements</li>
            <li>Political statements</li>
            <li>
              and <Link to="/docs/guides/llm-redteaming">much more</Link>
            </li>
          </ul>
          <p>
            <Link to="/docs/red-team">&raquo; Scan for vulnerabilities in your LLM app</Link>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/docs/red-team',
    },
    {
      id: 3,
      caption: 'CI/CD Testing',
      image: '/img/docs/github-action-comment.png',
      image2x: '/img/docs/github-action-comment@2x.png',
      description: (
        <>
          <p>
            <strong>Fits in your development workflow</strong>
          </p>
          <p>
            Promptfoo's simple file-based config and local runtime make it easy to set up in{' '}
            <Link to="/docs/integrations/github-action/">GitHub Actions</Link> or other CI services.
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
      <div className={styles.walkthroughTabs}>
        {steps.map((step) => (
          <button
            key={step.id}
            className={clsx(
              styles.walkthroughTab,
              selectedStep === step.id && styles.walkthroughTabActive,
            )}
            onClick={() => setSelectedStep(step.id)}
          >
            {step.caption}
          </button>
        ))}
      </div>
      <div className={styles.walkthroughContent}>
        <div className={styles.walkthroughImageContainer}>
          <img
            src={selectedStepData?.image}
            srcSet={`${selectedStepData?.image} 1x, ${selectedStepData?.image2x} 2x`}
            alt={`Walkthrough step ${selectedStep}`}
            className={styles.walkthroughImage}
          />
        </div>
        <div className={styles.walkthroughDescription}>
          {steps.find((step) => step.id === selectedStep)?.description}
        </div>
      </div>
    </div>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Secure & reliable LLMs"
      description="Custom LLM evals and red-teaming for your app. Find and fix vulnerabilities, maximize output quality, catch regressions."
    >
      <HomepageHeader />
      <HomepageWalkthrough />
      <main>
        <section className={styles.logoSection}>
          <div className="container">
            <h2>Trusted by developers at</h2>
            <LogoContainer />
          </div>
        </section>
        <HomepageFeatures />
        <HomepageInfo />
        <section className={styles.actionOrientedSection}>
          <div className="container">
            <h2>Detect & fix critical failures</h2>
            <div>
              <Link to="/llm-vulnerability-scanner">
                <img
                  loading="lazy"
                  src="/img/riskreport-2.png"
                  srcSet="/img/riskreport-2.png 1x, /img/riskreport-2@2x.png 2x"
                  alt="Sample vulnerability report"
                />
              </Link>
            </div>
          </div>
        </section>

        <div className={styles.ctaSection}>
          <h3>Make your LLM app reliable & secure</h3>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Read Start Guide
            </Link>
          </div>
        </div>
      </main>
    </Layout>
  );
}
