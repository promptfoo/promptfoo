import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './humanx-2026.module.css';

export default function HumanX2026(): React.ReactElement {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  return (
    <Layout
      title="Promptfoo at HumanX 2026"
      description="Meet Promptfoo at HumanX 2026. Connect with AI leaders and see how enterprises secure their AI applications."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at HumanX 2026 | AI Security" />
        <meta
          property="og:description"
          content="Join Promptfoo at HumanX 2026. Live demos of AI security testing, meet enterprise AI teams, and learn how to protect your LLM applications. Apr 6-9, San Francisco."
        />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/humanx-2026.jpg" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/humanx-2026" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Promptfoo at HumanX 2026 | AI Security" />
        <meta
          name="twitter:description"
          content="Meet Promptfoo at HumanX 2026. AI security demos, enterprise solutions, and networking with AI leaders."
        />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/humanx-2026.jpg" />
        <meta
          name="keywords"
          content="HumanX 2026, AI conference, AI security, LLM security, enterprise AI, San Francisco, AI leadership"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/humanx-2026" />
      </Head>

      <main className={styles.humanxPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>HumanX 2026</div>
              <h1 className={styles.heroTitle}>
                Where AI Leaders
                <br />
                <span className={styles.highlight}>Meet Security</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Join us at HumanX 2026 to explore how enterprises are securing their AI
                applications. Meet our team and see live demos of AI security testing.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#learn-more"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#learn-more')}
                >
                  Learn More
                </a>
                <Link to="/contact" className={styles.secondaryButton}>
                  Schedule a Meeting
                </Link>
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
                  <span>April 6-9, 2026</span>
                </div>
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
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>San Francisco, CA</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What We'll Show Section */}
        <section className={styles.demoSection} id="learn-more">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What We're Bringing</h2>
              <p className={styles.sectionSubtitle}>
                Connect with us to see how AI-first companies are protecting their applications
              </p>
            </div>
            <div className={styles.demoGrid}>
              <div className={styles.demoCard}>
                <div className={styles.cardIcon}>🧠</div>
                <h3>AI Security Strategy</h3>
                <p>
                  Learn how AI leaders are building security into their development lifecycle from
                  day one, not as an afterthought.
                </p>
              </div>
              <div className={styles.demoCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>Live Demos</h3>
                <p>
                  See our AI red teaming platform in action. Watch real-time vulnerability detection
                  and automated testing.
                </p>
              </div>
              <div className={styles.demoCard}>
                <div className={styles.cardIcon}>🤝</div>
                <h3>Enterprise Insights</h3>
                <p>
                  Hear how Fortune 500 companies are implementing AI security at scale and meeting
                  compliance requirements.
                </p>
              </div>
              <div className={styles.demoCard}>
                <div className={styles.cardIcon}>🔒</div>
                <h3>Free Assessments</h3>
                <p>
                  Schedule a complimentary AI vulnerability assessment for your organization's LLM
                  applications.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.USER_COUNT_DISPLAY}+</div>
                <div className={styles.statLabel}>Developers</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>80+</div>
                <div className={styles.statLabel}>Fortune 500 Companies</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Apr 6-9</div>
                <div className={styles.statLabel}>San Francisco</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Let's Connect at HumanX</h2>
              <p className={styles.ctaText}>
                Schedule a meeting to discuss your AI security needs or simply stop by to see our
                demos.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/contact" className={styles.primaryButton}>
                  Contact Us
                </Link>
                <Link to="/security" className={styles.secondaryButton}>
                  Explore Our Platform
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Navigation */}
        <section className={styles.footerNav}>
          <div className={styles.container}>
            <Link to="/events" className={styles.backLink}>
              <svg
                className={styles.backIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to All Events
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
