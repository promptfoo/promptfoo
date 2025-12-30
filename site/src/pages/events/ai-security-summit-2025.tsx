import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './ai-security-summit-2025.module.css';

export default function AISecuritySummit2025(): React.ReactElement {
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
      title="AI Security Summit 2025"
      description="Promptfoo at AI Security Summit 2025 (Oct 22–23) at The Westin St. Francis, San Francisco. Ian Webster joins the panel 'Using AI for Offensive Security Testing.'"
    >
      <Head>
        <meta property="og:title" content="Promptfoo at AI Security Summit 2025" />
        <meta
          property="og:description"
          content="Promptfoo at AI Security Summit 2025 (Oct 22–23, San Francisco). Community sponsor with Ian Webster on the panel 'Using AI for Offensive Security Testing.'"
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content="https://www.promptfoo.dev/events/ai-security-summit-2025"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/ai-security-summit-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/ai-security-summit-2025.jpg"
        />
        <meta
          name="keywords"
          content="AI Security Summit 2025, LLM security, AI red teaming, San Francisco, AI vulnerabilities, machine learning security"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/ai-security-summit-2025" />
      </Head>

      <main className={styles.summitPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/ai-security-summit-2025.jpg"
            alt="AI Security Summit 2025"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🧠</span>
              AI Security Summit 2025
            </div>
            <h1 className={styles.heroTitle}>
              The Future of <span className={styles.highlight}>AI Security</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              Two days of leadership talks and practitioner sessions focused on real-world AI
              security. Catch Ian Webster on the panel "Using AI for Offensive Security Testing."
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
                <span>October 22-23, 2025</span>
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
                <span>Westin St. Francis, San Francisco</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span>Panel Speaker</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="#highlights"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#highlights')}
              >
                View Highlights
              </a>
              <Link to="/docs/red-team/" className={styles.secondaryCta}>
                Learn Red Teaming
              </Link>
            </div>
          </div>
        </section>

        {/* Speaker Spotlight */}
        <section className={styles.speakerSection} id="highlights">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Speaker Spotlight</h2>
            </div>
            <div className={styles.speakerCard}>
              <div className={styles.speakerInfo}>
                <div className={styles.speakerBadge}>Panel Speaker</div>
                <h3 className={styles.speakerName}>Ian Webster</h3>
                <p className={styles.speakerRole}>CEO & Co-founder, Promptfoo</p>
                <p className={styles.speakerBio}>
                  Ian joined industry leaders for the panel "Using AI for Offensive Security
                  Testing," covering how teams can use automation to discover LLM and agent
                  vulnerabilities earlier in the lifecycle.
                </p>
                <div className={styles.speakerTopics}>
                  <span className={styles.topic}>LLM Security</span>
                  <span className={styles.topic}>Red Teaming</span>
                  <span className={styles.topic}>Enterprise AI</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Themes */}
        <section className={styles.themesSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Key Themes</h2>
              <p className={styles.sectionSubtitle}>
                Critical topics shaping the AI security landscape in 2025 and beyond.
              </p>
            </div>
            <div className={styles.themesGrid}>
              <div className={styles.themeCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>Adversarial AI</h3>
                <p>
                  Understanding how attackers exploit LLMs through prompt injection, jailbreaking,
                  and novel attack vectors targeting foundation models.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.cardIcon}>🔐</div>
                <h3>Defense Strategies</h3>
                <p>
                  Building robust guardrails and implementing comprehensive red teaming programs to
                  secure AI applications at scale.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.cardIcon}>🏢</div>
                <h3>Enterprise Readiness</h3>
                <p>
                  Navigating compliance requirements, governance frameworks, and security best
                  practices for production AI systems.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.cardIcon}>🔮</div>
                <h3>Future Threats</h3>
                <p>
                  Anticipating emerging vulnerabilities in multimodal models, agents, and
                  next-generation AI architectures.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Research Highlights */}
        <section className={styles.researchSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Research Highlights</h2>
            </div>
            <div className={styles.researchGrid}>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>01</div>
                <h3>Automated Red Teaming</h3>
                <p>
                  Demonstrated how open-source tools can systematically discover vulnerabilities in
                  LLM applications through automated adversarial testing.
                </p>
                <Link to="/docs/red-team/quickstart/" className={styles.researchLink}>
                  Try it yourself →
                </Link>
              </div>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>02</div>
                <h3>Jailbreak Patterns</h3>
                <p>
                  Analyzed common jailbreak techniques and their effectiveness across different
                  model providers, revealing gaps in current safety measures.
                </p>
                <Link to="/docs/red-team/strategies/" className={styles.researchLink}>
                  View strategies →
                </Link>
              </div>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>03</div>
                <h3>Data Exfiltration</h3>
                <p>
                  Showcased novel methods attackers use to extract sensitive information from RAG
                  systems and enterprise chatbots.
                </p>
                <Link to="/docs/red-team/plugins/pii/" className={styles.researchLink}>
                  Explore plugins →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Oct 22–23</div>
                <div className={styles.statLabel}>Dates</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>SF</div>
                <div className={styles.statLabel}>Westin St. Francis</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>2</div>
                <div className={styles.statLabel}>Days</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>1</div>
                <div className={styles.statLabel}>Mission</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Secure Your AI</h2>
              <p className={styles.ctaText}>
                Start red teaming your LLM applications today with Promptfoo's open-source security
                testing framework.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/red-team/quickstart/" className={styles.primaryCta}>
                  Get Started
                </Link>
                <Link to="https://github.com/promptfoo/promptfoo" className={styles.secondaryCta}>
                  Star on GitHub
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
