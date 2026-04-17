import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './gartner-security-2026.module.css';

export default function GartnerSecurity2026(): React.ReactElement {
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
      const offsetPosition = elementPosition + window.scrollY - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  return (
    <Layout
      title="Promptfoo at Gartner Security & Risk Management Summit 2026"
      description="Turn AI risk into a measurable program. Meet Promptfoo for briefings on continuous red teaming, guardrails, and executive reporting."
    >
      <Head>
        <meta
          property="og:title"
          content="Promptfoo at Gartner Security & Risk Management Summit 2026"
        />
        <meta
          property="og:description"
          content="Turn AI risk into a measurable program. Meet Promptfoo for briefings on continuous red teaming, guardrails, and executive reporting. Jun 1-3, National Harbor MD."
        />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/gartner-security-2026.jpg"
        />
        <meta property="og:url" content="https://www.promptfoo.dev/events/gartner-security-2026" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Promptfoo at Gartner Security & Risk Management Summit 2026"
        />
        <meta
          name="twitter:description"
          content="Meet Promptfoo at Gartner Security 2026. Enterprise AI security, analyst briefings, and CISO discussions."
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/gartner-security-2026.jpg"
        />
        <meta
          name="keywords"
          content="Gartner Security 2026, risk management summit, AI security, enterprise security, CISO, Washington DC, AI governance"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/gartner-security-2026" />
      </Head>

      <main className={styles.gartnerPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>Gartner Security & Risk Management Summit 2026</div>
              <h1 className={styles.heroTitle}>
                Make AI Risk
                <br />
                <span className={styles.highlight}>Measurable</span>
              </h1>
              <p className={styles.heroSubtitle}>
                If you're building an AI security program, we can help you move from ad hoc testing
                to continuous coverage. Meet Promptfoo for demos of automated red teaming, runtime
                guardrails, and reporting security leadership can track.
              </p>
              {/* Risk Meter Animation */}
              <div className={styles.riskMeterContainer}>
                <div className={styles.riskMeter}>
                  <span className={styles.riskMeterLabel}>Risk Coverage</span>
                  <div className={styles.riskMeterBars}>
                    <div className={styles.riskBar} />
                    <div className={styles.riskBar} />
                    <div className={styles.riskBar} />
                    <div className={styles.riskBar} />
                    <div className={styles.riskBar} />
                  </div>
                  <span className={styles.riskMeterStatus}>Monitoring</span>
                </div>
              </div>
              <div className={styles.heroButtons}>
                <a
                  href="#learn-more"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#learn-more')}
                >
                  Learn More
                </a>
                <Link to="/contact" className={styles.secondaryButton}>
                  Schedule a Briefing
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
                  <span>June 1-3, 2026</span>
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
                  <span>National Harbor, MD</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What to Expect Section */}
        <section className={styles.offerSection} id="learn-more">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>
                Tools and frameworks for security leaders building AI governance programs.
              </p>
            </div>
            <div className={styles.offerGrid}>
              <div className={styles.offerCard}>
                <div className={styles.cardIcon}>📊</div>
                <h3>Operationalize AI Security</h3>
                <p>
                  Learn how to move from ad hoc testing to structured coverage that tracks risk
                  reduction over time.
                </p>
              </div>
              <div className={styles.offerCard}>
                <div className={styles.cardIcon}>📋</div>
                <h3>Executive-ready Reporting</h3>
                <p>
                  See dashboards and artifacts that translate technical findings into board-level
                  summaries.
                </p>
              </div>
              <div className={styles.offerCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>Briefings and Architecture Reviews</h3>
                <p>
                  Book dedicated time with our team to walk through your program design and get
                  personalized recommendations.
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
                <div className={styles.statNumber}>Jun 1-3</div>
                <div className={styles.statLabel}>National Harbor, MD</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Attending Gartner Security?</h2>
              <p className={styles.ctaText}>
                Reach out to book a demo or architecture review during the summit.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/contact" className={styles.primaryButton}>
                  Schedule a Meeting
                </Link>
                <Link to="https://discord.gg/promptfoo" className={styles.secondaryButton}>
                  Join our Discord
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
