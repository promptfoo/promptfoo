import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useForcedTheme } from '@site/src/hooks/useForcedTheme';
import Layout from '@theme/Layout';
import styles from './rsa-2026.module.css';

export default function RSA2026(): React.ReactElement {
  useForcedTheme('dark');

  return (
    <Layout
      title="Promptfoo at RSA Conference 2026"
      description="Recap of Promptfoo at RSA Conference 2026. Live AI red teaming demos, security consultations, and enterprise AI security discussions in San Francisco."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at RSA Conference 2026" />
        <meta
          property="og:description"
          content="Recap of Promptfoo at RSA Conference 2026. Live AI red teaming demos and enterprise security."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/rsa-2026" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/rsa-2026.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/rsa-2026.jpg" />
        <meta
          name="keywords"
          content="RSA Conference 2026, AI security, LLM security, enterprise security, San Francisco, red teaming"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/rsa-2026" />
      </Head>

      <main className={styles.rsaPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/rsa-2026.jpg"
            alt="RSA Conference 2026"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🛡️</span>
              RSA Conference 2026
            </div>
            <h1 className={styles.heroTitle}>
              RSA Conference <span className={styles.highlight}>2026</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              We ran live demos of our AI security platform at RSAC—red teaming, evals, guardrails,
              and foundation model security reports for production AI applications.
            </p>

            <div className={styles.eventDetails}>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>March 23-26, 2026</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
                <span>Moscone Center, San Francisco</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <p className={styles.ctaBlurb}>Missed us at the show?</p>
              <Link to="/contact" className={styles.primaryCta}>
                Book a Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Highlights Section */}
        <section id="highlights" className={styles.highlightsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>Highlights from RSA Conference 2026</p>
            </div>

            <div className={styles.highlightsGrid}>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🎯</div>
                <h3>AI Red Teaming</h3>
                <p>
                  Live demos of LLM attack vectors and jailbreak techniques, plus how teams wire
                  automated red teaming into their workflow.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🤝</div>
                <h3>Conversations with AI Teams</h3>
                <p>
                  We talked with security professionals working on evals, guardrails, and MCP
                  security about how they protect AI applications in production.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🎬</div>
                <h3>Demos on the Floor</h3>
                <p>
                  Quick-fire walkthroughs of the latest AI security research, tools, and techniques
                  from our red teaming engineers.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaGrid}>
              <div className={styles.ctaCard}>
                <h3 className={styles.ctaCardTitle}>Want the same walkthrough?</h3>
                <p className={styles.ctaCardText}>
                  Book time with our AI security and red teaming engineers and we'll run it against
                  your stack.
                </p>
                <Link to="/contact" className={styles.primaryCta}>
                  Book a Demo
                </Link>
              </div>
              <div className={styles.ctaCard}>
                <h3 className={styles.ctaCardTitle}>Can't make it?</h3>
                <p className={styles.ctaCardText}>
                  Join our Discord community to connect with our team and our community.
                </p>
                <a
                  href="https://discord.com/invite/promptfoo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.secondaryCta}
                >
                  Join our Discord
                </a>
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
