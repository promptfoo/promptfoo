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
        <h1>
          <span className={styles.heroMainText}>Secure your AI</span>
          <br />
          from <span className={styles.heroHighlight}>prompt</span> to{' '}
          <span className={styles.heroHighlight}>production</span>
        </h1>
        <p>Gen AI red teaming, guardrails, and model security trusted by 75,000+ users</p>
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
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#evals') {
        return 4;
      } else if (window.location.hash === '#redteam') {
        return 1;
      } else if (window.location.hash === '#guardrails') {
        return 2;
      } else if (window.location.hash === '#modelsecurity') {
        return 3;
      }
    }
    return 1; // Default to Red Teaming
  });

  const steps = [
    {
      id: 1,
      caption: 'Red Teaming',
      image: '/img/riskreport-1.png',
      image2x: '/img/riskreport-1@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>
            Adaptive red teaming that targets applications, not just models
          </p>
          <p>Generate customized attacks that adapt to your specific use case:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam init</code>
          </pre>
          <p>Unlike generic red teamers, our solution uncovers actual risks in your systems:</p>
          <ul>
            <li>Data leaks and privacy breaches</li>
            <li>Insecure tool use vulnerabilities</li>
            <li>Direct and indirect prompt injections</li>
            <li>Jailbreaks tailored to your guardrails</li>
            <li>Unauthorized contract creation</li>
            <li>Harmful content generation</li>
            <li>
              And <Link to="/docs/red-team/llm-vulnerability-types/">much more</Link>
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/red-teaming">&raquo; Learn more about Red Teaming</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/red-teaming',
    },
    {
      id: 2,
      caption: 'Guardrails',
      image: '/img/guardrails.png',
      image2x: '/img/guardrails.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>
            Self-improving guardrails that learn from attacks
          </p>
          <p>
            Unlike static guardrails, our system continuously improves through red team feedback:
          </p>
          <ul>
            <li>Automatically adapts to new attack patterns</li>
            <li>Learns from real-world usage and attack attempts</li>
            <li>Validates both our guardrails and third-party systems</li>
            <li>Enforces company policies with increasing precision</li>
            <li>Protects sensitive information with evolving defenses</li>
          </ul>
          <p>
            Deploy in minutes on cloud or on-premises with seamless integration into any AI
            workflow.
          </p>
          <p>
            <strong>
              <Link to="/guardrails">&raquo; Learn more about Guardrails</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/guardrails',
    },
    {
      id: 3,
      caption: 'Model Security',
      image: '/img/foundationmodel-reports.png',
      image2x: '/img/foundationmodel-reports.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Comprehensive compliance for your AI stack</p>
          <p>One-click scanning of your entire AI ecosystem against industry frameworks:</p>
          <ul>
            <li>OWASP Top 10 for LLMs compliance</li>
            <li>NIST AI Risk Management Framework</li>
            <li>EU AI Act requirements</li>
            <li>Customizable scans for industry regulations</li>
            <li>AWS plugin support for top 10 vulnerabilities</li>
          </ul>
          <p>Get detailed reports with clear remediation steps and continuous monitoring.</p>
          <p>
            <strong>
              <Link to="/model-security">&raquo; Learn more about Model Security</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/model-security',
    },
    {
      id: 4,
      caption: 'Evaluations',
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      imageDark: '/img/claude-vs-gpt-example-dark.png',
      image2xDark: '/img/claude-vs-gpt-example-dark@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Build reliable AI systems in minutes</p>
          <p>The fastest way to test and compare LLMs, prompts, RAGs, and agents:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>
            Run comprehensive evaluations locally with no SDKs, cloud dependencies, or logins—just a
            simple declarative configuration.
          </p>
          <p>Used by major AI companies to build better models, prompts, and agent systems.</p>
          <p>
            <strong>
              <Link to="/docs/intro">&raquo; Get Started with Evaluations</Link>
            </strong>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
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
              alt={`${selectedStepData?.caption}`}
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

function AsSeenOnSection() {
  return (
    <section className={styles.asSeenOnSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Featured In</h2>
        <div className={styles.asSeenOnGrid}>
          <a
            href="https://vimeo.com/1023317525/be082a1029"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/openai-logo.svg"
                  alt="OpenAI"
                  className={styles.asSeenOnLogoInline}
                />
                Build Hours
              </h3>
              <p>
                "Promptfoo is really powerful because you can iterate on prompts, configure tests in
                YAML, and view everything locally... it's faster and more straightforward"
              </p>
              <span className={styles.watchNow}>Watch the Video →</span>
            </div>
          </a>

          <a
            href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/anthropic-logo.svg"
                  alt="Anthropic"
                  className={styles.asSeenOnLogoInline}
                  style={{ maxWidth: 175 }}
                />
                Courses
              </h3>
              <p>
                "Promptfoo offers a streamlined, out-of-the-box solution that can significantly
                reduce the time and effort required for comprehensive prompt testing."
              </p>
              <span className={styles.watchNow}>See the Course →</span>
            </div>
          </a>
        </div>
      </div>
    </section>
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
      description="Eliminate risk with AI red-teaming and evals used by 75,000+ developers. Find and fix vulnerabilities, maximize output quality, catch regressions."
      wrapperClassName="homepage-wrapper"
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/homepage.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <HomepageHeader getStartedUrl={getStartedUrl} />
      <div className="container">
        <HomepageWalkthrough />
      </div>
      <main>
        <section className={styles.logoSection}>
          <div className="container">
            <h2>Trusted by security teams at</h2>
            <LogoContainer noBackground noBorder />
          </div>
        </section>
        <HomepageFeatures />
        <AsSeenOnSection />

        <div className={styles.ctaSection}>
          <h2>Secure your AI applications today</h2>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to={getStartedUrl}>
              Try Open Source
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/contact/"
            >
              Enterprise Solutions
            </Link>
          </div>
        </div>
        <NewsletterForm />
      </main>
    </Layout>
  );
}
