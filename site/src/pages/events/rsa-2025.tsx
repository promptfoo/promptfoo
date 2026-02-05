import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './rsa-2025.module.css';

export default function RSA2025(): React.ReactElement {
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
      title="Promptfoo at RSA Conference 2025"
      description="Recap of Promptfoo at RSA Conference 2025. AI red teaming demos and enterprise AI security discussions."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at RSA Conference 2025" />
        <meta
          property="og:description"
          content="Recap of Promptfoo at RSA Conference 2025. AI red teaming demos and enterprise security."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/rsa-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/rsa-2025.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/rsa-2025.jpg" />
        <meta
          name="keywords"
          content="RSA Conference 2025, AI security, LLM security, enterprise security, San Francisco, red teaming"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/rsa-2025" />
      </Head>

      <main className={styles.rsaPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/rsa-2025.jpg"
            alt="RSA Conference 2025"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🛡️</span>
              RSA Conference 2025
            </div>
            <h1 className={styles.heroTitle}>
              Enterprise <span className={styles.highlight}>AI Security</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              We showcased AI red teaming capabilities at RSA Conference 2025, connecting with
              security leaders and demonstrating how enterprises protect their AI applications.
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
                <span>April 28 - May 1, 2025</span>
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
              <a
                href="#recap"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#recap')}
              >
                View Recap
              </a>
              <Link to="/contact" className={styles.secondaryCta}>
                Contact Us
              </Link>
            </div>
          </div>
        </section>

        {/* Recap Section */}
        <section id="recap" className={styles.recapSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Event Recap</h2>
              <p className={styles.sectionSubtitle}>Highlights from RSA Conference 2025</p>
            </div>

            <div className={styles.recapGrid}>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>Live AI Red Teaming</h3>
                <p>
                  Demonstrated real-time AI vulnerability testing, showing how enterprises can
                  identify and mitigate LLM security risks before deployment.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🤝</div>
                <h3>Enterprise Connections</h3>
                <p>
                  Connected with Fortune 500 security teams, discussing their AI security challenges
                  and how Promptfoo helps protect production AI systems.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>📊</div>
                <h3>Research Sharing</h3>
                <p>
                  Shared practical testing patterns: prompt injection regression tests, RAG data
                  exfil probes, and how to operationalize red teaming in CI.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🏆</div>
                <h3>Expo Floor Presence</h3>
                <p>
                  Showcased our open-source AI security platform to the global security community at
                  RSA Conference's expo floor.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What We Showcased */}
        <section className={styles.showcaseSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What We Showcased</h2>
              <p className={styles.sectionSubtitle}>Enterprise-grade AI security solutions</p>
            </div>

            <div className={styles.showcaseGrid}>
              <div className={styles.showcaseItem}>
                <div className={styles.showcaseNumber}>01</div>
                <h3>OWASP Top 10 for LLMs</h3>
                <p>
                  Complete coverage of the OWASP Top 10 vulnerabilities for Large Language Models,
                  with automated detection and remediation guidance.
                </p>
              </div>
              <div className={styles.showcaseItem}>
                <div className={styles.showcaseNumber}>02</div>
                <h3>Continuous Red Teaming</h3>
                <p>
                  CI/CD integration for continuous AI security testing, ensuring every deployment is
                  protected against emerging threats.
                </p>
              </div>
              <div className={styles.showcaseItem}>
                <div className={styles.showcaseNumber}>03</div>
                <h3>Audit-Friendly Reporting</h3>
                <p>
                  Detailed test logs and repeatable security checks, helping enterprises document AI
                  security for governance and compliance reviews.
                </p>
              </div>
              <div className={styles.showcaseItem}>
                <div className={styles.showcaseNumber}>04</div>
                <h3>Custom Attack Vectors</h3>
                <p>
                  Industry-specific attack simulations tailored to financial services, healthcare,
                  and other regulated industries.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>See You at RSA 2026</h2>
              <p className={styles.ctaText}>
                We'll be back at RSA Conference 2026. Check out our plans and stay connected for
                updates on booth location and demos.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/events/rsa-2026" className={styles.primaryCta}>
                  RSA 2026 Details
                </Link>
                <Link to="/contact" className={styles.secondaryCta}>
                  Get in Touch
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
