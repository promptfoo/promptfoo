import React, { useEffect, useMemo, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './bsides-seattle-2025.module.css';

export default function BSidesSeattle2025(): React.ReactElement {
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
      title="Promptfoo at BSides Seattle 2025"
      description="Promptfoo sponsored BSides Seattle 2025 and joined the PNW security community in Redmond."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides Seattle 2025" />
        <meta
          property="og:description"
          content="Recap of Promptfoo at BSides Seattle 2025. Community-driven security, AI red teaming demos, and PNW vibes."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/bsides-seattle-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/bsides-seattle-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/bsides-seattle-2025.jpg"
        />
        <meta
          name="keywords"
          content="BSides Seattle 2025, security conference, AI security, LLM security, Pacific Northwest, Seattle"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/bsides-seattle-2025" />
      </Head>

      <main className={styles.bsidesPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/bsides-seattle-2025.jpg"
            alt="BSides Seattle 2025"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
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
              BSides Seattle 2025
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
              We sponsored and joined the Pacific Northwest security community for two days of
              hands-on learning, great conversations, and way too much caffeine.
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
                <span>April 18-19, 2025</span>
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
                <span>Building 92, Redmond, WA</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="#recap"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#recap')}
              >
                See the Recap
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

        {/* The BSides Spirit Section */}
        <section className={styles.spiritSection} id="recap">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>The BSides Spirit</h2>
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

        {/* What We Shared Section */}
        <section className={styles.sharedSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What We Talked About</h2>
            </div>
            <div className={styles.sharedGrid}>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>AI Red Teaming Walkthroughs</h3>
                <p>
                  Quick walkthroughs and examples showing how to find vulnerabilities in LLM
                  applications using open source tools.
                </p>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>🔓</div>
                <h3>Jailbreaking Demos</h3>
                <p>
                  Live demonstrations of prompt injection, jailbreaking, and data exfiltration
                  attacks against popular LLM providers.
                </p>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.cardIcon}>💬</div>
                <h3>Hallway Conversations</h3>
                <p>
                  Some of the best moments at BSides happen between sessions. We talked AI security
                  challenges with teams from across the PNW.
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
                <div className={styles.statNumber}>400+</div>
                <div className={styles.statLabel}>Attendees</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>∞</div>
                <div className={styles.statLabel}>Coffee Consumed</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>50+</div>
                <div className={styles.statLabel}>Conversations</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>0</div>
                <div className={styles.statLabel}>Sunny Days</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Join the Community</h2>
              <p className={styles.ctaText}>
                Whether you're in Seattle or anywhere else, the AI security community is growing.
                Let's connect.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="https://discord.gg/promptfoo" className={styles.primaryCta}>
                  Join Discord
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
