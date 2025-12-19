import React, { useEffect, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './rsa-2026.module.css';

function CountdownTimer(): React.ReactElement {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const targetDate = new Date('2026-03-23T09:00:00-07:00').getTime();

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

export default function RSA2026(): React.ReactElement {
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
      title="Promptfoo at RSA Conference 2026"
      description="Meet Promptfoo at RSA Conference 2026. Live AI red teaming demos, security consultations, and enterprise AI security discussions in San Francisco."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at RSA Conference 2026" />
        <meta
          property="og:description"
          content="Meet Promptfoo at RSA Conference 2026. Live AI red teaming demos and enterprise security."
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
              <span className={styles.badgeIcon}>🚀</span>
              Coming March 2026
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
              Meet our team for live demos of our AI security platform—red teaming, evals,
              guardrails, and foundation model security reports for your AI applications.
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
              <p className={styles.ctaBlurb}>Book a time to talk to us</p>
              <a
                href="https://cal.com/team/promptfoo/intro2"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryCta}
              >
                Schedule a Meeting
              </a>
            </div>
          </div>
        </section>

        {/* Highlights Section */}
        <section id="highlights" className={styles.highlightsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>
                Join us for the premier AI security experience
              </p>
            </div>

            <div className={styles.highlightsGrid}>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🎯</div>
                <h3>AI Red Teaming</h3>
                <p>
                  See live demos of LLM attack vectors, jailbreak techniques, and how to integrate
                  automated red teaming into your workflow.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🤝</div>
                <h3>Connect with AI Experts</h3>
                <p>
                  Meet AI security professionals working on evals, guardrails, and MCP
                  security—learn how they're protecting AI applications in production.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.highlightIcon}>🎬</div>
                <h3>See it in Action</h3>
                <p>
                  Quick-fire demos on the latest AI security research, tools, and techniques from
                  the AI security and red teaming experts.
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
                <h3 className={styles.ctaCardTitle}>Attending RSA?</h3>
                <p className={styles.ctaCardText}>
                  Book a time to meet with our AI security and red teaming experts at the event.
                </p>
                <a
                  href="https://cal.com/team/promptfoo/intro2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.primaryCta}
                >
                  Schedule a Meeting
                </a>
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
