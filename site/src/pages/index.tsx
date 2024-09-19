import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageInfo from '@site/src/components/HomepageInfo';
import LogoContainer from '@site/src/components/LogoContainer';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import NewsletterForm from '../components/NewsletterForm';
import styles from './index.module.css';

function HomepageHeader({ getStartedUrl }: { getStartedUrl: string }) {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1>Find & fix problems in your LLM apps</h1>
        <p>Open-source LLM testing used by 30,000+ developers</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to={getStartedUrl}>
            Get Started
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/contact/"
          >
            Request a Demo
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageWalkthrough() {
  const isDarkTheme = useColorMode().colorMode === 'dark';
  const [selectedStep, setSelectedStep] = React.useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#evals') {
      return 1;
    }
    return 2;
  });
  const steps = [
    {
      id: 1,
      caption: 'Evaluations',
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      imageDark: '/img/claude-vs-gpt-example-dark.png',
      image2xDark: '/img/claude-vs-gpt-example-dark@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Build reliable prompts, RAGs, and agents</p>
          <p>Start testing the performance of your models, prompts, and tools in minutes:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>
            Promptfoo runs locally and integrates directly with your app - no SDKs, cloud
            dependencies, or logins.
          </p>
          <p>
            <strong>
              <Link to="/docs/intro">&raquo; Get Started</Link>
            </strong>
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
          <p className={styles.walkthroughHeading}>Automated pentesting for your app</p>
          <p>
            Run an automatic scan tailored to your application that detects security, legal, and
            brand risks:
          </p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam init</code>
          </pre>
          <p>Our probes cover common failures like:</p>
          <ul>
            <li>PII leaks</li>
            <li>Insecure tool use</li>
            <li>Cross-session data leaks</li>
            <li>Jailbreaks</li>
            <li>Harmful content</li>
            <li>Specialized medical and legal advice</li>
            <li>
              and <Link to="/docs/red-team/llm-vulnerability-types/">much more</Link>
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/docs/red-team/quickstart/">
                &raquo; Scan for vulnerabilities in your LLM app
              </Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/docs/red-team/quickstart/',
    },
    {
      id: 3,
      caption: 'Continuous Monitoring',
      image: '/img/continuous-monitoring.png',
      image2x: '/img/continuous-monitoring@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Spot issues before they're deployed</p>
          <p>
            Promptfoo provides a high-level view of your system's security posture across different
            models, prompts, and applications.
          </p>
          <p>
            Our simple file-based config and local runtime make it easy to set up in{' '}
            <Link to="/docs/integrations/github-action/">GitHub Actions</Link> or other CI/CD
            services.
          </p>
          <p>
            <strong>
              <Link to="/docs/red-team/quickstart/">&raquo; See setup docs</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/docs/red-team/quickstart/',
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
          <Link to={selectedStepData?.destinationUrl || '#'}>
            <img
              src={
                isDarkTheme && selectedStepData?.imageDark
                  ? selectedStepData.imageDark
                  : selectedStepData?.image
              }
              srcSet={
                isDarkTheme && selectedStepData?.image2xDark
                  ? `${selectedStepData.imageDark} 1x, ${selectedStepData.image2xDark} 2x`
                  : `${selectedStepData?.image} 1x, ${selectedStepData?.image2x} 2x`
              }
              alt={`Walkthrough step ${selectedStep}`}
              className={styles.walkthroughImage}
            />
          </Link>
        </div>
        <div className={styles.walkthroughDescription}>
          {steps.find((step) => step.id === selectedStep)?.description}
        </div>
      </div>
    </div>
  );
}

export default function Home(): JSX.Element {
  const [getStartedUrl, setGetStartedUrl] = React.useState('/docs/intro/');

  React.useEffect(() => {
    if (window.location.hash === '#redteam') {
      setGetStartedUrl('/docs/red-team/quickstart/');
    }
  }, []);

  return (
    <Layout
      title="Secure & reliable LLMs"
      description="Eliminate risk with AI red-teaming and evals used by 30,000 developers. Find and fix vulnerabilities, maximize output quality, catch regressions."
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/homepage.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <HomepageHeader getStartedUrl={getStartedUrl} />
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
              <Link to="/llm-vulnerability-scanner/">
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
          <h2>Make your LLM app reliable & secure</h2>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to={getStartedUrl}>
              Read Start Guide
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/contact/"
            >
              Contact Us
            </Link>
          </div>
        </div>
        <NewsletterForm />
      </main>
    </Layout>
  );
}
