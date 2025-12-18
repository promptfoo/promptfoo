import React, { useEffect, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './bsides-sf-2026.module.css';

function CountdownTimer(): React.ReactElement {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const targetDate = new Date('2026-03-21T09:00:00-07:00').getTime();

    const updateCountdown = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.countdown}>
      <div className={styles.countdownItem}>
        <span className={styles.countdownNumber}>{timeLeft.days}</span>
        <span className={styles.countdownLabel}>Days</span>
      </div>
      <div className={styles.countdownSeparator}>:</div>
      <div className={styles.countdownItem}>
        <span className={styles.countdownNumber}>{timeLeft.hours.toString().padStart(2, '0')}</span>
        <span className={styles.countdownLabel}>Hours</span>
      </div>
      <div className={styles.countdownSeparator}>:</div>
      <div className={styles.countdownItem}>
        <span className={styles.countdownNumber}>
          {timeLeft.minutes.toString().padStart(2, '0')}
        </span>
        <span className={styles.countdownLabel}>Minutes</span>
      </div>
      <div className={styles.countdownSeparator}>:</div>
      <div className={styles.countdownItem}>
        <span className={styles.countdownNumber}>
          {timeLeft.seconds.toString().padStart(2, '0')}
        </span>
        <span className={styles.countdownLabel}>Seconds</span>
      </div>
    </div>
  );
}

export default function BSidesSF2026(): React.ReactElement {
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
      title="Promptfoo at BSides SF 2026"
      description="Join Promptfoo at BSides San Francisco 2026. Community connections, AI security workshops, and hacker culture during RSA week."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides SF 2026" />
        <meta
          property="og:description"
          content="Join Promptfoo at BSides San Francisco 2026. Community-driven security and AI workshops."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/bsides-sf-2026" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/bsides-sf-2026.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/bsides-sf-2026.jpg"
        />
        <meta
          name="keywords"
          content="BSides SF 2026, BSides San Francisco, security conference, AI security, hacker community, RSA week"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/bsides-sf-2026" />
      </Head>

      <main className={styles.bsidesPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/bsides-sf-2026.jpg"
            alt="BSides SF 2026"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🌉</span>
              BSidesSF 2026
            </div>
            <h1 className={styles.heroTitle}>
              BSides <span className={styles.highlight}>San Francisco</span>
            </h1>
            <div className={styles.heroMeta}>
              <span className={styles.heroDate}>March 21-22, 2026</span>
              <span className={styles.heroDivider}>•</span>
              <span className={styles.heroVenue}>City View at Metreon</span>
            </div>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              The grassroots security conference that brings hackers together during RSA week. Join
              us for AI security workshops and community connections.
            </p>

            <CountdownTimer />

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
                <span>March 21-22, 2026</span>
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
                href="#highlights"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#highlights')}
              >
                What to Expect
              </a>
              <Link to="/contact" className={styles.secondaryCta}>
                Get in Touch
              </Link>
            </div>
          </div>
        </section>

        {/* Highlights Section */}
        <section id="highlights" className={styles.highlightsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>Community-driven AI security experiences</p>
            </div>

            <div className={styles.highlightsGrid}>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🤝</div>
                <h3>Community Connections</h3>
                <p>
                  Meet security researchers, bug bounty hunters, and AI enthusiasts who are pushing
                  the boundaries of what's possible.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🎯</div>
                <h3>AI Red Teaming</h3>
                <p>
                  Compare notes on LLM attack vectors, jailbreak techniques, and integrating
                  automated red teaming into your security workflow.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🎤</div>
                <h3>Lightning Talks</h3>
                <p>
                  Quick-fire presentations on the latest AI security research, tools, and techniques
                  from community members.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why BSides Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>The BSides Spirit</h2>
              <p className={styles.sectionSubtitle}>Where the security community comes together</p>
            </div>

            <div className={styles.whyGrid}>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>01</div>
                <h3>Grassroots Energy</h3>
                <p>
                  Community-organized, volunteer-run, and focused on sharing knowledge over selling
                  products. This is the real hacker conference experience.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>02</div>
                <h3>Diverse Voices</h3>
                <p>
                  From first-time speakers to industry veterans, BSides amplifies voices you won't
                  hear at bigger corporate conferences.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>03</div>
                <h3>Open Source Culture</h3>
                <p>
                  A community that values transparency, collaboration, and giving back. Right at
                  home for an open-source security company like Promptfoo.
                </p>
              </div>
              <div className={styles.whyItem}>
                <div className={styles.whyNumber}>04</div>
                <h3>Hallway Track</h3>
                <p>
                  The best conversations happen between sessions. BSides creates the space for
                  genuine discussions about security challenges.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Save the Date</h2>
              <p className={styles.ctaText}>
                BSides SF 2026 happens just before RSA Conference. Join us for the community warmup
                before the big show.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/contact" className={styles.primaryCta}>
                  Stay Updated
                </Link>
                <Link to="/events/rsa-2026" className={styles.secondaryCta}>
                  RSA 2026 Details
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
