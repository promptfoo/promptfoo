import React, { useEffect, useMemo, useState } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './bsides-seattle-2026.module.css';

// Event configuration
const EVENT_DATE = '2026-02-27T09:00:00-08:00';
const EVENT_DATE_DISPLAY = 'February 27-28, 2026';
const EVENT_LOCATION = 'Building 92, Redmond, WA';

// Icon components to reduce JSX verbosity
const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const WrenchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
    />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 21.192a5.996 5.996 0 01-3.102-1.268.75.75 0 01.346-1.326 5.97 5.97 0 002.727-1.347A5.967 5.967 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
    />
  </svg>
);

function CountdownTimer(): React.ReactElement {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const targetDate = new Date(EVENT_DATE).getTime();

    const updateCountdown = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
          isExpired: false,
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  if (timeLeft.isExpired) {
    return (
      <div className={styles.countdownExpired}>
        <span>Event is happening now!</span>
      </div>
    );
  }

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
      const offsetPosition = elementPosition + window.scrollY - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  return (
    <Layout
      title="Promptfoo at BSides Seattle 2026"
      description="Meet the Promptfoo team at BSides Seattle for hands-on AI red teaming demos, hallway-track threat intel, and practical ways to harden LLM apps."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides Seattle 2026" />
        <meta
          property="og:description"
          content="Meet the Promptfoo team at BSides Seattle for hands-on AI red teaming demos and practical ways to harden LLM apps. Feb 27-28, Building 92, Redmond."
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
          <img
            src="/img/events/bsides-seattle-2026.jpg"
            alt="BSides Seattle 2026 - Red panda mascot in a PNW coffee shop with hackers"
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
              BSides Seattle 2026
            </div>
            <h1 className={styles.heroTitle}>
              Hands-on AI Security <span className={styles.highlight}>in the PNW</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              Meet the Promptfoo team for live demos of AI red teaming: prompt injection,
              jailbreaks, and data exfiltration against real-world LLM apps. Bring your use case and
              leave with a testing plan you can run in CI.
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
                <span>{EVENT_DATE_DISPLAY}</span>
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
                <span>{EVENT_LOCATION}</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="https://cal.com/team/promptfoo/intro2"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryCta}
              >
                Schedule a Meeting
              </a>
              <a
                href="#learn-more"
                className={styles.secondaryCta}
                onClick={(e) => handleSmoothScroll(e, '#learn-more')}
              >
                Learn More
              </a>
            </div>
            <button
              type="button"
              className={styles.weatherToggle}
              onClick={() => setRainEnabled(!rainEnabled)}
              aria-label={rainEnabled ? 'Disable rain effect' : 'Enable rain effect'}
              title={
                rainEnabled
                  ? 'Too much Seattle? Click for sun'
                  : 'Missing the rain? Click to bring it back'
              }
            >
              {rainEnabled ? '🌧️' : '☀️'}
            </button>
          </div>
        </section>

        {/* What to Expect Section */}
        <section className={styles.spiritSection} id="learn-more">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What to Expect</h2>
              <p className={styles.sectionSubtitle}>Community-first security, with real demos.</p>
            </div>
            <div className={styles.spiritGrid}>
              <div className={styles.spiritCard}>
                <div className={styles.cardIconSvg}>
                  <TargetIcon />
                </div>
                <h3>Live LLM Attack Demos</h3>
                <p>
                  See practical attacks against RAG apps and agents, plus the detection patterns
                  that catch them early.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.cardIconSvg}>
                  <RefreshIcon />
                </div>
                <h3>Automated Red Teaming Workflows</h3>
                <p>
                  Learn how teams turn one-off testing into repeatable coverage across prompts,
                  models, and releases.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.cardIconSvg}>
                  <WrenchIcon />
                </div>
                <h3>Fixes You Can Ship</h3>
                <p>
                  We'll share a starter checklist and remediation guidance you can apply
                  immediately.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Attending BSides Seattle Section */}
        <section className={styles.sharedSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Attending BSides Seattle?</h2>
              <p className={styles.sectionSubtitle}>
                Grab a slot for a quick walkthrough tailored to your stack.
              </p>
            </div>
            <div className={styles.sharedGrid}>
              <div className={styles.sharedCard}>
                <div className={styles.cardIconSvg}>
                  <CalendarIcon />
                </div>
                <h3>Schedule a Meeting</h3>
                <p>
                  Book time for a short, technical walkthrough of AI red teaming for your specific
                  use case.
                </p>
                <a
                  href="https://cal.com/team/promptfoo/intro2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cardLink}
                >
                  Book a Time →
                </a>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.cardIconSvg}>
                  <ChatIcon />
                </div>
                <h3>Can't Make It?</h3>
                <p>
                  Join our Discord community to connect with our team and the AI security community.
                </p>
                <a
                  href="https://discord.gg/promptfoo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cardLink}
                >
                  Join Discord →
                </a>
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
                <div className={styles.statNumber}>{SITE_CONSTANTS.FORTUNE_500_COUNT}</div>
                <div className={styles.statLabel}>Fortune 500</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumberText}>Open Source</div>
                <div className={styles.statLabel}>MIT Licensed</div>
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
                <a
                  href="https://discord.gg/promptfoo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.primaryCta}
                >
                  Join Discord
                </a>
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
