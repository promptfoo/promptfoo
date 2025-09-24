import React, { useEffect } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import CodeIcon from '@mui/icons-material/Code';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import GitHubIcon from '@mui/icons-material/GitHub';
import StarIcon from '@mui/icons-material/Star';
import PeopleIcon from '@mui/icons-material/People';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './hacktoberfest-2025.module.css';

export default function Hacktoberfest(): JSX.Element {
  useEffect(() => {
    // Force dark theme for this page
    document.documentElement.setAttribute('data-theme', 'dark');

    // Cleanup on unmount
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (element) {
      const offset = 80; // Offset for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <Layout
      title="Promptfoo Hacktoberfest 2025"
      description="Join Promptfoo for Hacktoberfest 2025! Contribute to open-source AI security testing, earn swag, and help secure AI applications worldwide. Multiple contribution opportunities available."
    >
      <Head>
        <meta
          property="og:title"
          content="Promptfoo Hacktoberfest 2025 | Open Source AI Security"
        />
        <meta
          property="og:description"
          content="Contribute to Promptfoo during Hacktoberfest 2025. Help secure AI applications with open-source contributions. Earn swag, learn AI security, and make a difference."
        />
        <meta property="og:image" content="/img/events/hacktoberfest-2025.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="/hacktoberfest" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Promptfoo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Promptfoo Hacktoberfest 2025 | Open Source AI Security"
        />
        <meta
          name="twitter:description"
          content="Join Hacktoberfest with Promptfoo! Contribute to AI security testing, earn swag, and help secure AI applications worldwide."
        />
        <meta name="twitter:image" content="/img/events/hacktoberfest-2025.png" />
        <meta name="twitter:site" content="@promptfoo" />

        <meta
          name="keywords"
          content="Hacktoberfest 2025, open source, AI security, LLM security, prompt testing, contribution, GitHub, swag"
        />
        <link rel="canonical" href="https://promptfoo.dev/hacktoberfest" />
      </Head>
      <main className={styles.hacktoberfestPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>Hacktoberfest 2025</div>
              <h1 className={styles.heroTitle}>
                Ready for Hacktoberfest?
                <br />
                <span className={styles.highlight}>Improve AI security with us!</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Join Promptfoo for Hacktoberfest 2025! Help secure AI applications worldwide while
                earning swag and contributing to the most popular open-source AI security testing
                platform.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#contribute"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#contribute')}
                >
                  How to contribute
                </a>
                <a
                  href="http://promptfoo.dev/docs/contributing/"
                  className={styles.secondaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#learn-more')}
                >
                  Contribution guide
                </a>
              </div>
              <div className={styles.eventDetails}>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>October 1-31, 2025</span>
                </div>
                <div className={styles.detail}>
                  <GitHubIcon className={styles.icon} />
                  <span style={{ fontWeight: 'bold', color: '#b32e2e' }}>
                    <Link to="https://github.com/promptfoo/promptfoo" style={{ color: 'inherit' }}>
                      GitHub repository
                    </Link>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Contribute Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Why contribute to Promptfoo?</h2>
            <div className={styles.whyPoints}>
              <div className={styles.whyPoint}>
                <h3>🚀 It's exciting!</h3>
                <p>
                  We're not even two years old, and growing so quickly! Be part of the change as we
                  build the future of AI security testing.
                </p>
              </div>
              <div className={styles.whyPoint}>
                <h3>🎯 We're on a mission</h3>
                <p>
                  We want developers everywhere to test AI like they run their unit tests. Help us
                  make AI testing as standard as traditional software testing.
                </p>
              </div>
              <div className={styles.whyPoint}>
                <h3>📈 Popular & growing</h3>
                <p>
                  Over 150k users and growing despite being a young project. Join a community that's
                  already making a real impact in AI security worldwide.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contribution Opportunities Section */}
        <section className={styles.demoSection} id="learn-more">
          <div className={styles.demoBackground}>
            <div className={styles.demoContainer}>
              <div className={styles.demoHeader}>
                <h2 className={styles.demoTitle}>Contribution opportunities</h2>
                <p className={styles.demoSubtitle}>
                  For detailed setup instructions and development workflow, see our{' '}
                  <Link to="/docs/contributing" style={{ color: '#b32e2e', fontWeight: 'bold' }}>
                    complete contribution guide
                  </Link>
                  .
                </p>
              </div>
              <div className={styles.demoGrid}>
                <div className={styles.demoCard} data-demo="1">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <CodeIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Core platform features</h3>
                      <p>
                        Contribute to Promptfoo's core testing engine, add new providers, improve
                        evaluation metrics, or enhance the CLI. Perfect for developers who want to
                        work on the main platform that powers AI security testing for thousands of
                        users.
                      </p>
                      <div className={styles.demoTag}>GOOD FIRST ISSUE</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="2">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <BugReportIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Security & red teaming</h3>
                      <p>
                        Add new attack vectors, enhance vulnerability detection, or improving red
                        teaming capabilities. We love new plugins. Also you.
                      </p>
                      <div className={styles.demoTag}>SECURITY FOCUSED</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="3">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <SpeedIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Documentation & examples</h3>
                      <p>
                        Improve documentation, create tutorials, add example configurations, or
                        write guides for different use cases. Help make Promptfoo more accessible.
                      </p>
                      <div className={styles.demoTag}>LOW-CODE</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="4">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <PeopleIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Community & outreach</h3>
                      <p>
                        Help spread the word about Promptfoo through translations, talks,
                        presentations, hosting events, podcasts, social media, blog posts, or
                        videos. Get in touch with us to discuss what you'd like to do and how we can
                        support your contribution.
                      </p>
                      <div className={styles.demoTag}>NO-CODE</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Getting Started Section */}
        <section className={styles.calendarSection} id="contribute">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>How to get started</h2>
            <p className={styles.calendarSubtitle}>
              Ready to contribute? Follow these steps to start your Hacktoberfest journey with
              Promptfoo. For detailed setup instructions, see our{' '}
              <Link to="/docs/contributing" style={{ color: '#b32e2e', fontWeight: 'bold' }}>
                complete contribution guide
              </Link>
              .
            </p>
            <div className={styles.stepsContainer}>
              <div className={styles.step}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepContent}>
                  <h3>Fork & clone the repository</h3>
                  <p>
                    Fork the{' '}
                    <Link to="https://github.com/promptfoo/promptfoo">promptfoo repository</Link> on
                    GitHub, then clone your fork locally:
                  </p>
                  <code>git clone https://github.com/[your-username]/promptfoo.git</code>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepContent}>
                  <h3>Set up development environment</h3>
                  <p>Install dependencies and run tests to make sure everything is working:</p>
                  <code>npm install && npm test</code>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepContent}>
                  <h3>Find good first issues</h3>
                  <p>
                    Look for issues labeled with <code>good first issue</code>,{' '}
                    <code>hacktoberfest</code>, or <code>help wanted</code> in our{' '}
                    <Link to="https://github.com/promptfoo/promptfoo/issues">
                      GitHub repository
                    </Link>
                    .
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>4</div>
                <div className={styles.stepContent}>
                  <h3>Create your contribution</h3>
                  <p>
                    Create a new branch, make your changes, and submit a pull request following our{' '}
                    <Link to="/docs/contributing">contributing guidelines</Link>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Rewards Section */}
        <section className={styles.rewardsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Earn points & unlock rewards</h2>
            <p className={styles.rewardsSubtitle}>
              The more you contribute, the more points you earn. Use your points to redeem exclusive
              swag from our foo store!
            </p>

            <div className={styles.pointsSystem}>
              <div className={styles.pointsCard}>
                <div className={styles.pointsHeader}>
                  <h3>🏆 Points system</h3>
                </div>
                <div className={styles.pointsList}>
                  <div className={styles.pointsItem}>
                    <span className={styles.pointsValue}>5 pts</span>
                    <span className={styles.pointsDesc}>
                      Documentation improvements, small bug fixes
                    </span>
                  </div>
                  <div className={styles.pointsItem}>
                    <span className={styles.pointsValue}>10 pts</span>
                    <span className={styles.pointsDesc}>New features, provider integrations</span>
                  </div>
                  <div className={styles.pointsItem}>
                    <span className={styles.pointsValue}>15 pts</span>
                    <span className={styles.pointsDesc}>
                      Security improvements, red teaming features
                    </span>
                  </div>
                  <div className={styles.pointsItem}>
                    <span className={styles.pointsValue}>20 pts</span>
                    <span className={styles.pointsDesc}>
                      Major architectural changes, complex PRs
                    </span>
                  </div>
                  <div className={styles.pointsItem}>
                    <span className={styles.pointsValue}>25 pts</span>
                    <span className={styles.pointsDesc}>
                      Community outreach, translations, talks
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.rewardsGrid}>

              <div className={styles.rewardTier}>
                <div className={styles.tierHeader}>
                  <h3>Award tier (1 pull request)</h3>
                  <p>Apparel!</p>
                </div>
                <div className={styles.rewardItems}>
                  <div className={styles.rewardItem}>Promptfoo Hacktoberfest 2025 t-shirt</div>
                  <div className={styles.rewardItem}>GitHub profile recognition</div>
                </div>
              </div>

              <div className={styles.rewardTier}>
                <div className={styles.tierHeader}>
                  <h3>MVP tier (2+ pull requests)</h3>
                  <p>Merch & recognition</p>
                </div>
                <div className={styles.rewardItems}>
                  <div className={styles.rewardItem}>
                    Choice of Promptfoo Hacktoberfest t-shirt OR hoodie
                  </div>
                  <div className={styles.rewardItem}>Digital certificate of completion</div>
                  <div className={styles.rewardItem}>Shoutout on LinkedIn & social media</div>
                </div>
              </div>
            </div>

            <div className={styles.rewardsNote}>
              <p>
                <strong>How it works:</strong> Submit your PRs during October 2025, and we'll tally your PRs at the end of the month. Redeem rewards from our{' '}
                <Link
                  to="https://store.promptfoo.dev"
                  style={{ color: '#b32e2e', fontWeight: 'bold' }}
                >
                  foo store
                </Link>{' '}
                using your earned points. Limited quantities available!
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2>Ready to make AI more secure?</h2>
            <p>
              Join hundreds of developers who are contributing to the future of AI security testing.
            </p>
            <div className={styles.ctaButtons}>
              <a
                href="#contribute"
                className={styles.primaryButton}
                onClick={(e) => handleSmoothScroll(e, '#contribute')}
              >
                Start contributing now
              </a>
              <Link to="https://github.com/promptfoo/promptfoo" className={styles.secondaryButton}>
                <GitHubIcon style={{ marginRight: '0.5rem' }} />
                View on GitHub
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
