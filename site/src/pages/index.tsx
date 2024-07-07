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
        <h1>Ship LLM apps with confidence</h1>
        <p>Open-source LLM testing used by 20,000+ developers</p>
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
            Automated scans tailored to your application can detect serious security and product
            flaws.
          </p>
          <p>Protect your app from legal and brand risks such as:</p>
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
      title="Iterate on LLMs faster"
      description="Tailored LLM evals for your use case. Maximize model quality and catch regressions."
    >
      <HomepageHeader />
      <HomepageWalkthrough />
      <main>
        <HomepageInfo />

        <section className={styles.actionOrientedSection}>
          <div className="container">
            <h2>Detect & fix critical failures</h2>
            <p>Discover hidden risks and take action to protect your brand and users.</p>
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
        <HomepageFeatures />
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
