import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './sector-2025.module.css';

export default function SecTor2025(): React.ReactElement {
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
      title="Promptfoo at SecTor 2025"
      description="Promptfoo at SecTor 2025 in Toronto. Arsenal demos, security tools showcase, and connecting with Canada's enterprise security community."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at SecTor 2025 - Toronto" />
        <meta
          property="og:description"
          content="Join Promptfoo at SecTor 2025 in Toronto. Arsenal demos, LLM security tools, and enterprise AI security discussions."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/sector-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/sector-2025.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/sector-2025.jpg" />
        <meta
          name="keywords"
          content="SecTor 2025, Toronto security conference, Arsenal, AI security tools, Canada cybersecurity, LLM security"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/sector-2025" />
      </Head>

      <main className={styles.sectorPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img src="/img/events/sector-2025.jpg" alt="SecTor 2025" className={styles.bannerImage} />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🍁</span>
              SecTor 2025 • Toronto
            </div>
            <h1 className={styles.heroTitle}>
              North of the Border <span className={styles.highlight}>Security</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              Canada's largest IT security conference. We brought open-source AI security tools to
              the Arsenal and connected with enterprise security teams across the country.
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
                <span>September 30 - October 2, 2025</span>
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
                <span>Metro Toronto Convention Centre</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>Arsenal Listing</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="#arsenal"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#arsenal')}
              >
                See the Arsenal
              </a>
              <Link to="/docs/red-team/" className={styles.secondaryCta}>
                Try Promptfoo
              </Link>
            </div>
          </div>
        </section>

        {/* Arsenal Section */}
        <section id="arsenal" className={styles.arsenalSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Arsenal Showcase</h2>
              <p className={styles.sectionSubtitle}>
                Promptfoo was selected for the SecTor Arsenal, showcasing open-source security tools
                to Canada's enterprise security community.
              </p>
            </div>
            <div className={styles.arsenalCard}>
              <div className={styles.arsenalBadge}>SecTor Arsenal 2025</div>
              <h3 className={styles.arsenalTitle}>Promptfoo: Open-Source LLM Red Teaming</h3>
              <p className={styles.arsenalDescription}>
                Live demonstrations of automated AI security testing, including prompt injection
                detection, jailbreak attempts, and data exfiltration scenarios against real-world
                LLM applications.
              </p>
              <div className={styles.arsenalFeatures}>
                <div className={styles.arsenalFeature}>
                  <div className={styles.featureIcon}>🎯</div>
                  <div>
                    <h4>Automated Red Teaming</h4>
                    <p>Systematic vulnerability discovery across 15+ attack categories</p>
                  </div>
                </div>
                <div className={styles.arsenalFeature}>
                  <div className={styles.featureIcon}>🔓</div>
                  <div>
                    <h4>Live Jailbreaking</h4>
                    <p>Real-time demonstrations against production guardrails</p>
                  </div>
                </div>
                <div className={styles.arsenalFeature}>
                  <div className={styles.featureIcon}>📊</div>
                  <div>
                    <h4>Security Reports</h4>
                    <p>Enterprise-ready vulnerability assessments and remediation guidance</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why SecTor Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Why SecTor</h2>
            </div>
            <div className={styles.whyGrid}>
              <div className={styles.whyCard}>
                <div className={styles.whyEmoji}>🇨🇦</div>
                <h3>Canadian Enterprise</h3>
                <p>
                  SecTor brings together Canada's largest financial institutions, government
                  agencies, and technology companies under one roof.
                </p>
              </div>
              <div className={styles.whyCard}>
                <div className={styles.whyEmoji}>🛡️</div>
                <h3>Security-First Culture</h3>
                <p>
                  The Canadian security community takes compliance and data protection seriously.
                  Perfect audience for enterprise AI security tools.
                </p>
              </div>
              <div className={styles.whyCard}>
                <div className={styles.whyEmoji}>🤝</div>
                <h3>Quality Connections</h3>
                <p>
                  Smaller than RSA, more focused conversations. We had in-depth discussions about
                  real deployment challenges.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Conversations Section */}
        <section className={styles.conversationsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Key Conversations</h2>
            </div>
            <div className={styles.conversationsGrid}>
              <div className={styles.conversationCard}>
                <div className={styles.conversationIcon}>🏦</div>
                <h3>Financial Services</h3>
                <p>
                  Discussions with major Canadian banks about securing customer-facing AI assistants
                  and internal LLM tools under strict regulatory requirements.
                </p>
              </div>
              <div className={styles.conversationCard}>
                <div className={styles.conversationIcon}>🏛️</div>
                <h3>Government</h3>
                <p>
                  Federal and provincial teams exploring how to safely deploy AI while meeting
                  Canadian privacy regulations and security standards.
                </p>
              </div>
              <div className={styles.conversationCard}>
                <div className={styles.conversationIcon}>🏥</div>
                <h3>Healthcare</h3>
                <p>
                  Healthcare organizations interested in AI assistants for patient communication
                  while protecting sensitive health information.
                </p>
              </div>
              <div className={styles.conversationCard}>
                <div className={styles.conversationIcon}>⚡</div>
                <h3>Critical Infrastructure</h3>
                <p>
                  Energy and utilities companies evaluating AI for operational efficiency while
                  maintaining strict security controls.
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
                <div className={styles.statNumber}>3</div>
                <div className={styles.statLabel}>Days</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Toronto</div>
                <div className={styles.statLabel}>Location</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Oct 1–2</div>
                <div className={styles.statLabel}>Arsenal Lab</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>MTCC</div>
                <div className={styles.statLabel}>Venue</div>
              </div>
            </div>
          </div>
        </section>

        {/* Common Themes */}
        <section className={styles.themesSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Common Themes</h2>
            </div>
            <div className={styles.themesGrid}>
              <blockquote className={styles.themeQuote}>
                <p>
                  Teams were looking for AI security tools that fit their compliance requirements,
                  with detailed reports suitable for auditors.
                </p>
                <cite>Theme: Financial services</cite>
              </blockquote>
              <blockquote className={styles.themeQuote}>
                <p>
                  Government teams wanted ways to test AI assistants while meeting Canadian privacy
                  regulations and GRC requirements.
                </p>
                <cite>Theme: Public sector</cite>
              </blockquote>
              <blockquote className={styles.themeQuote}>
                <p>
                  Open source was important—being able to audit the testing methodology was a key
                  requirement for many teams.
                </p>
                <cite>Theme: Enterprise security</cite>
              </blockquote>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <div className={styles.ctaMaple}>🍁</div>
              <h2 className={styles.ctaTitle}>Merci • Thank You</h2>
              <p className={styles.ctaText}>
                Thanks to the SecTor team and everyone who stopped by the Arsenal. We're excited to
                continue working with the Canadian security community.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/red-team/quickstart/" className={styles.primaryCta}>
                  Get Started
                </Link>
                <Link to="https://discord.gg/promptfoo" className={styles.secondaryCta}>
                  Join Discord
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
