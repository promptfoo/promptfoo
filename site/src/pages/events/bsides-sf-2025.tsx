import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './bsides-sf-2025.module.css';

export default function BSidesSF2025(): React.ReactElement {
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
      title="Promptfoo at BSides SF 2025"
      description="Recap of Promptfoo at BSides San Francisco 2025. Community connections and AI security discussions during RSA week."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides SF 2025" />
        <meta
          property="og:description"
          content="Recap of Promptfoo at BSides San Francisco 2025. Community-driven security and AI discussions."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/bsides-sf-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/bsides-sf-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/bsides-sf-2025.jpg"
        />
        <meta
          name="keywords"
          content="BSides SF 2025, BSides San Francisco, security conference, AI security, hacker community, RSA week"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/bsides-sf-2025" />
      </Head>

      <main className={styles.bsidesPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/bsides-sf-2025.jpg"
            alt="BSides SF 2025"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🌉</span>
              BSides SF 2025
            </div>
            <h1 className={styles.heroTitle}>
              Community <span className={styles.highlight}>First</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              We connected with the security community at BSides San Francisco 2025, the grassroots
              conference that brings hackers together during RSA week.
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
                <span>April 26-27, 2025</span>
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
                <span>City View at Metreon, SF</span>
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
              <Link to="/events" className={styles.secondaryCta}>
                All Events
              </Link>
            </div>
          </div>
        </section>

        {/* Recap Section */}
        <section id="recap" className={styles.recapSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Event Recap</h2>
              <p className={styles.sectionSubtitle}>The best of BSides SF 2025</p>
            </div>

            <div className={styles.recapGrid}>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🤝</div>
                <h3>Community Connections</h3>
                <p>
                  Met with security researchers, bug bounty hunters, and AI enthusiasts who are
                  pushing the boundaries of AI security research.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>💬</div>
                <h3>AI Security Discussions</h3>
                <p>
                  Engaged in deep conversations about LLM vulnerabilities, prompt injection, and the
                  future of AI red teaming with the community.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🎤</div>
                <h3>Hallway Track</h3>
                <p>
                  Some of the best conversations happened between sessions—the hallway track is
                  where the real magic of BSides happens.
                </p>
              </div>
              <div className={styles.recapCard}>
                <div className={styles.cardIcon}>🍻</div>
                <h3>After-Hours Networking</h3>
                <p>
                  Connected with the community at evening events, building relationships that extend
                  beyond the conference.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why BSides Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Why We Love BSides</h2>
              <p className={styles.sectionSubtitle}>The heart of the security community</p>
            </div>

            <div className={styles.whyGrid}>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>01</div>
                <h3>Grassroots Energy</h3>
                <p>
                  BSides captures the authentic hacker spirit—community-organized, volunteer-run,
                  and focused on sharing knowledge over selling products.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>02</div>
                <h3>Diverse Perspectives</h3>
                <p>
                  From first-time speakers to industry veterans, BSides brings together voices you
                  won't hear at bigger corporate conferences.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>03</div>
                <h3>Open Source Spirit</h3>
                <p>
                  As an open-source company, we feel right at home in a community that values
                  transparency, collaboration, and giving back.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>04</div>
                <h3>Real Conversations</h3>
                <p>
                  No booth barriers—just genuine discussions about security challenges, tool
                  recommendations, and shared experiences.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>See You at BSides SF 2026</h2>
              <p className={styles.ctaText}>
                We'll be back for BSides SF 2026. Join us for more community connections, AI
                security discussions, and hallway track conversations.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/events/bsides-sf-2026" className={styles.primaryCta}>
                  BSides SF 2026 Details
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
