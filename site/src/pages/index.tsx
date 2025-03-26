import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
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
        <h1>Test & secure your LLM apps</h1>
        <p>Open-source LLM testing used by 70,000+ developers</p>
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
          <p className={styles.walkthroughHeading}>Automated red teaming for gen AI</p>
          <p>Run custom scans that detect security, legal, and brand risk:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam init</code>
          </pre>
          <p>Our probes adapt dynamically to your app and uncover common failures like:</p>
          <ul>
            <li>PII leaks</li>
            <li>Insecure tool use</li>
            <li>Cross-session data leaks</li>
            <li>Direct and indirect prompt injections</li>
            <li>Jailbreaks</li>
            <li>Harmful content</li>
            <li>Specialized medical and legal advice</li>
            <li>
              and <Link to="/docs/red-team/llm-vulnerability-types/">much more</Link>.
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/docs/red-team/quickstart/">&raquo; Find exploits in your LLM app</Link>
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

function AsSeenOnSection() {
  return (
    <section className={styles.asSeenOnSection}>
      <div className="container">
        <h2>Featured In</h2>
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

// Upcoming Events component
function UpcomingEvents() {
  // Simplified version of conference events data (from events.tsx)
  const featuredEvents = [
    {
      id: 1,
      name: 'DEF CON 33',
      displayDate: 'August 7-10, 2025',
      startDate: '2025-08-07',
      endDate: '2025-08-10',
      location: 'Las Vegas, NV',
      logo: '/img/events/defcon-33.png',
    },
    {
      id: 2,
      name: 'BSides SF 2025',
      displayDate: 'April 26-27, 2025',
      startDate: '2025-04-26',
      endDate: '2025-04-27',
      location: 'San Francisco, CA',
      logo: '/img/events/bsides-sf-2025.png',
    },
    {
      id: 4,
      name: 'RSA Conference USA 2025',
      displayDate: 'April 28-May 1, 2025',
      startDate: '2025-04-28',
      endDate: '2025-05-01',
      location: 'San Francisco, CA',
      logo: '/img/events/rsa-conference.png',
    },
  ];

  // Sort events by date (upcoming first)
  const sortedEvents = [...featuredEvents].sort((a, b) => {
    const dateA = new Date(a.startDate);
    const dateB = new Date(b.startDate);

    return dateA.getTime() - dateB.getTime();
  });

  // Only show next 2 upcoming events
  const upcomingEventsToShow = sortedEvents.slice(0, 2);

  return (
    <section className={styles.upcomingEventsSection}>
      <div className="container">
        <div className={styles.upcomingEventsHeader}>
          <h2>
            <CalendarTodayIcon className={styles.upcomingEventsIcon} />
            Upcoming Security Conferences
          </h2>
          <Link to="/events/" className={styles.viewAllLink}>
            View All Events
          </Link>
        </div>
        <div className={styles.upcomingEventsGrid}>
          {upcomingEventsToShow.map((event) => (
            <Link key={event.id} to="/events/" className={styles.upcomingEventCard}>
              <div className={styles.upcomingEventImageContainer}>
                <img
                  src={event.logo}
                  alt={`${event.name} logo`}
                  className={styles.upcomingEventLogo}
                  onError={(e) => {
                    e.currentTarget.src = '/img/logo-panda.svg'; // Fallback to promptfoo logo
                  }}
                />
              </div>
              <div className={styles.upcomingEventDetails}>
                <h3 className={styles.upcomingEventName}>{event.name}</h3>
                <p className={styles.upcomingEventDate}>{event.displayDate}</p>
                <p className={styles.upcomingEventLocation}>{event.location}</p>
              </div>
            </Link>
          ))}
          <div className={styles.upcomingEventsCTA}>
            <h3>Meet the promptfoo Team</h3>
            <p>
              Connect with us at these security conferences to discuss LLM security testing and
              evaluation strategies.
            </p>
            <Link to="/events/" className={clsx('button', 'button--primary')}>
              Schedule a Meeting
            </Link>
          </div>
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
      description="Eliminate risk with AI red-teaming and evals used by 70,000+ developers. Find and fix vulnerabilities, maximize output quality, catch regressions."
      wrapperClassName="homepage-wrapper"
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
            <LogoContainer noBackground noBorder />
          </div>
        </section>
        <UpcomingEvents />
        <HomepageFeatures />
        <HomepageInfo />
        <AsSeenOnSection />

        <div className={styles.ctaSection}>
          <h2>Make your LLM app reliable & secure</h2>
          <div className={styles.buttons}>
            <Link className="button button--primary button--lg" to={getStartedUrl}>
              Getting Started
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
