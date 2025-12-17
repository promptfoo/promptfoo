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
        <meta property="og:url" content="/events/sector-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/sector-2025.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/sector-2025.jpg" />
        <meta
          name="keywords"
          content="SecTor 2025, Toronto security conference, Arsenal, AI security tools, Canada cybersecurity, LLM security"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/sector-2025" />
      </Head>

      <main className={styles.sectorPage}>
        {/* Hero Image Background */}
        <div className={styles.heroImageContainer}>
          <img src="/img/events/sector-2025.jpg" alt="SecTor 2025" className={styles.heroImage} />
          <div className={styles.heroImageOverlay} />
        </div>

        {/* Maple Leaf Pattern Background */}
        <div className={styles.maplePattern}>
          {[...Array(8)].map((_, i) => (
            <svg
              key={i}
              className={styles.mapleLeaf}
              viewBox="0 0 100 100"
              style={{
                left: `${10 + (i % 4) * 25}%`,
                top: `${20 + Math.floor(i / 4) * 40}%`,
                animationDelay: `${i * 0.5}s`,
              }}
            >
              <path
                fill="currentColor"
                d="M50 0 L55 35 L95 30 L65 50 L80 90 L50 65 L20 90 L35 50 L5 30 L45 35 Z"
              />
            </svg>
          ))}
        </div>

        {/* Hero Section */}
        <section className={styles.hero}>
          {/* Toronto Skyline Silhouette */}
          <div className={styles.skyline}>
            <svg viewBox="0 0 1440 200" preserveAspectRatio="none">
              {/* CN Tower */}
              <rect x="700" y="20" width="8" height="180" fill="currentColor" />
              <polygon points="696,20 712,20 708,0 700,0" fill="currentColor" />
              <ellipse cx="704" cy="80" rx="20" ry="8" fill="currentColor" />
              <ellipse cx="704" cy="120" rx="12" ry="5" fill="currentColor" />
              {/* Buildings */}
              <rect x="100" y="120" width="60" height="80" fill="currentColor" />
              <rect x="170" y="100" width="50" height="100" fill="currentColor" />
              <rect x="230" y="130" width="70" height="70" fill="currentColor" />
              <rect x="320" y="90" width="45" height="110" fill="currentColor" />
              <rect x="380" y="110" width="55" height="90" fill="currentColor" />
              <rect x="450" y="85" width="40" height="115" fill="currentColor" />
              <rect x="500" y="100" width="65" height="100" fill="currentColor" />
              <rect x="580" y="130" width="50" height="70" fill="currentColor" />
              <rect x="640" y="110" width="40" height="90" fill="currentColor" />
              <rect x="750" y="100" width="55" height="100" fill="currentColor" />
              <rect x="820" y="80" width="45" height="120" fill="currentColor" />
              <rect x="880" y="120" width="60" height="80" fill="currentColor" />
              <rect x="960" y="95" width="50" height="105" fill="currentColor" />
              <rect x="1030" y="110" width="70" height="90" fill="currentColor" />
              <rect x="1120" y="130" width="55" height="70" fill="currentColor" />
              <rect x="1200" y="100" width="45" height="100" fill="currentColor" />
              <rect x="1260" y="120" width="60" height="80" fill="currentColor" />
              <rect x="1340" y="140" width="50" height="60" fill="currentColor" />
            </svg>
          </div>

          <div className={styles.heroContent}>
            <div className={styles.badge}>
              <span className={styles.mapleIcon}>🍁</span>
              SecTor 2025 • Toronto
            </div>
            <h1 className={styles.heroTitle}>
              North of the Border
              <br />
              <span className={styles.highlight}>Security</span>
            </h1>
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
            <div className={styles.heroButtons}>
              <a
                href="#arsenal"
                className={styles.primaryButton}
                onClick={(e) => handleSmoothScroll(e, '#arsenal')}
              >
                See the Arsenal
              </a>
              <Link to="/docs/red-team/" className={styles.secondaryButton}>
                Try Promptfoo
              </Link>
            </div>
          </div>
        </section>

        {/* Arsenal Section */}
        <section className={styles.arsenalSection} id="arsenal">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Arsenal Showcase</h2>
            <p className={styles.sectionSubtitle}>
              Promptfoo was selected for the SecTor Arsenal, showcasing open-source security tools
              to Canada's enterprise security community.
            </p>
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
            <h2 className={styles.sectionTitle}>Why SecTor</h2>
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
            <h2 className={styles.sectionTitle}>Key Conversations</h2>
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
        <section className={styles.testimonialsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Common Themes</h2>
            <div className={styles.testimonialsGrid}>
              <blockquote className={styles.testimonial}>
                <p>
                  Teams were looking for AI security tools that fit their compliance requirements,
                  with detailed reports suitable for auditors.
                </p>
                <cite>Theme: Financial services</cite>
              </blockquote>
              <blockquote className={styles.testimonial}>
                <p>
                  Government teams wanted ways to test AI assistants while meeting Canadian privacy
                  regulations and GRC requirements.
                </p>
                <cite>Theme: Public sector</cite>
              </blockquote>
              <blockquote className={styles.testimonial}>
                <p>
                  Open source was important—being able to audit the testing methodology was a key
                  requirement for many teams.
                </p>
                <cite>Theme: Enterprise security</cite>
              </blockquote>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <div className={styles.ctaCard}>
              <div className={styles.ctaMaple}>🍁</div>
              <h2>Merci • Thank You</h2>
              <p>
                Thanks to the SecTor team and everyone who stopped by the Arsenal. We're excited to
                continue working with the Canadian security community.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/red-team/quickstart/" className={styles.primaryButton}>
                  Get Started
                </Link>
                <Link to="https://discord.gg/promptfoo" className={styles.secondaryButton}>
                  Join Discord
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
