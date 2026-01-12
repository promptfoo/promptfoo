import React, { useEffect, useMemo, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './bsides-seattle-2026.module.css';

export default function BSidesSeattle2026(): React.ReactElement {
  const [rainEnabled, setRainEnabled] = useState(true);

  const raindrops = useMemo(
    () =>
      [...Array(30)].map(() => ({
        left: `${Math.random() * 100}%`,
        animationDuration: `${0.5 + Math.random() * 0.5}s`,
        animationDelay: `${Math.random() * 2}s`,
      })),
    [],
  );

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
      title="Promptfoo at BSides Seattle 2026"
      description="Meet Promptfoo at BSides Seattle 2026. Join us for AI security workshops, demos, and community discussions with the PNW security community."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides Seattle 2026" />
        <meta
          property="og:description"
          content="Join the Promptfoo team at BSides Seattle 2026. AI security workshops, red teaming demos, and community-driven security. Feb 27-28, Seattle."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/bsides-seattle-2026" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/bsides-seattle-2026.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/bsides-seattle-2026.jpg"
        />
        <meta
          name="keywords"
          content="BSides Seattle 2026, security conference, AI security, LLM security, Pacific Northwest, Seattle, red teaming"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/bsides-seattle-2026" />
      </Head>

      <main className={styles.bsidesPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <div className={styles.bannerGradient} />
          {rainEnabled && (
            <div className={styles.rainContainer}>
              {raindrops.map((drop, i) => (
                <div key={i} className={styles.raindrop} style={drop} />
              ))}
            </div>
          )}
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>☕</span>
              BSides Seattle 2026
            </div>
            <h1 className={styles.heroTitle}>
              Security, Community, <span className={styles.highlight}>Coffee</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              Join the Promptfoo team and the Pacific Northwest security community for hands-on AI
              security workshops, demos, and great conversations.
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
                <span>February 27-28, 2026</span>
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
                <span>Seattle, WA</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="#learn-more"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#learn-more')}
              >
                Learn More
              </a>
              <button
                type="button"
                className={styles.secondaryCta}
                onClick={() => setRainEnabled(!rainEnabled)}
              >
                {rainEnabled ? '🌧️ Seattle Mode' : '☀️ Sunny (rare)'}
              </button>
            </div>
          </div>
        </section>

        {/* What to Expect Section */}
        <section className={styles.spiritSection} id="learn-more">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>
                BSides conferences are the heart of the security community. No corporate polish,
                just passionate people sharing knowledge.
              </p>
            </div>
            <div className={styles.spiritGrid}>
              <div className={styles.spiritCard}>
                <div className={styles.cardIcon}>🌲</div>
                <h3>PNW Roots</h3>
                <p>
                  Seattle's security community is tight-knit and welcoming. From Boeing to Amazon to
                  countless startups, the talent here is incredible.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.cardIcon}>🤝</div>
                <h3>Community First</h3>
                <p>
                  BSides isn't about vendor pitches. It's about sharing real knowledge, making
                  connections, and helping each other level up.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.cardIcon}>☕</div>
                <h3>Fueled by Coffee</h3>
                <p>
                  This is Seattle. The coffee flows freely, the conversations go deep, and nobody
                  judges your third (or fourth) cup.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What We'll Share Section */}
        <section className={styles.sharedSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What We're Bringing</h2>
            </div>
            <div className={styles.sharedGrid}>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>AI Red Teaming Workshops</h3>
                <p>
                  Hands-on sessions showing how to find vulnerabilities in LLM applications using
                  open source tools.
                </p>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>🔓</div>
                <h3>Live Demos</h3>
                <p>
                  Live demonstrations of prompt injection, jailbreaking, and data exfiltration
                  attacks against popular LLM providers.
                </p>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>💬</div>
                <h3>Office Hours</h3>
                <p>
                  Some of the best moments at BSides happen between sessions. Stop by to chat AI
                  security challenges with our team.
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
                <div className={styles.statLabel}>Fortune 500</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Feb 27-28</div>
                <div className={styles.statLabel}>Save the Date</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>See You in Seattle</h2>
              <p className={styles.ctaText}>
                Whether you're a local or flying in for the conference, we'd love to connect. Join
                our community and stay updated on our event plans.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="https://discord.gg/promptfoo" className={styles.primaryCta}>
                  Join Discord
                </Link>
                <Link to="/contact" className={styles.secondaryCta}>
                  Contact Us
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
