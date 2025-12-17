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
    const targetDate = new Date('2026-04-27T09:00:00-07:00').getTime();

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
        <span className={styles.countdownNumber}>{timeLeft.minutes.toString().padStart(2, '0')}</span>
        <span className={styles.countdownLabel}>Minutes</span>
      </div>
      <div className={styles.countdownSeparator}>:</div>
      <div className={styles.countdownItem}>
        <span className={styles.countdownNumber}>{timeLeft.seconds.toString().padStart(2, '0')}</span>
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
        <meta property="og:url" content="/events/rsa-2026" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/rsa-2026.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/rsa-2026.jpg" />
        <meta
          name="keywords"
          content="RSA Conference 2026, AI security, LLM security, enterprise security, San Francisco, red teaming"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/rsa-2026" />
      </Head>

      <main className={styles.rsaPage}>
        {/* Hero Image Background */}
        <div className={styles.heroImageContainer}>
          <img
            src="/img/events/rsa-2026.jpg"
            alt="RSA Conference 2026"
            className={styles.heroImage}
          />
          <div className={styles.heroImageOverlay} />
        </div>

        {/* Animated Grid Background */}
        <div className={styles.gridPattern}>
          <div className={styles.gridLines} />
          <div className={styles.scanLine} />
        </div>

        {/* Floating Shields */}
        <div className={styles.shieldPattern}>
          {[...Array(8)].map((_, i) => (
            <svg
              key={i}
              className={styles.shield}
              viewBox="0 0 100 120"
              style={{
                left: `${10 + (i % 4) * 25}%`,
                top: `${20 + Math.floor(i / 4) * 40}%`,
                animationDelay: `${i * 0.5}s`,
              }}
            >
              <path
                fill="currentColor"
                d="M50 0 L100 25 L100 60 Q100 100 50 120 Q0 100 0 60 L0 25 Z"
              />
            </svg>
          ))}
        </div>

        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🚀</span>
              Coming April 2026
            </div>
            <h1 className={styles.heroTitle}>
              RSA Conference
              <br />
              <span className={styles.highlight}>2026</span>
            </h1>
            <p className={styles.heroSubtitle}>
              The world's leading cybersecurity conference. Meet us for live AI red teaming demos,
              free security assessments, and expert consultations.
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
                <span>April 27-30, 2026</span>
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
                href="#highlights"
                className={styles.primaryCta}
                onClick={(e) => handleSmoothScroll(e, '#highlights')}
              >
                What to Expect
              </a>
              <Link to="/contact" className={styles.secondaryCta}>
                Schedule a Meeting
              </Link>
            </div>
          </div>
        </section>

        {/* Highlights Section */}
        <section id="highlights" className={styles.highlightsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>What to Expect</h2>
            <p className={styles.sectionSubtitle}>
              Join us for the premier AI security experience
            </p>
          </div>

          <div className={styles.highlightsGrid}>
            <div className={styles.highlightCard}>
              <div className={styles.highlightIcon}>🎯</div>
              <h3>Live Red Teaming Demos</h3>
              <p>
                Watch real-time AI vulnerability demonstrations. See how we identify prompt
                injection, jailbreaks, and data exfiltration in production AI systems.
              </p>
            </div>
            <div className={styles.highlightCard}>
              <div className={styles.highlightIcon}>🔒</div>
              <h3>Free Security Assessment</h3>
              <p>
                Get a complimentary AI vulnerability assessment for your organization.
                Walk away with actionable insights to protect your AI applications.
              </p>
            </div>
            <div className={styles.highlightCard}>
              <div className={styles.highlightIcon}>👥</div>
              <h3>Expert Consultations</h3>
              <p>
                Meet our security researchers and discuss your specific AI security
                challenges. Get personalized recommendations from the team.
              </p>
            </div>
            <div className={styles.highlightCard}>
              <div className={styles.highlightIcon}>🎁</div>
              <h3>Exclusive Swag</h3>
              <p>
                Limited edition Promptfoo gear for conference attendees. First come,
                first served at our booth.
              </p>
            </div>
          </div>
        </section>

        {/* What We'll Showcase */}
        <section className={styles.showcaseSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>What We'll Showcase</h2>
            <p className={styles.sectionSubtitle}>
              Enterprise-grade AI security solutions
            </p>
          </div>

          <div className={styles.showcaseGrid}>
            <div className={styles.showcaseItem}>
              <div className={styles.showcaseNumber}>01</div>
              <h3>Next-Gen Red Teaming</h3>
              <p>
                Our latest AI-powered attack simulations that go beyond traditional prompt
                injection to test complex agent systems and multi-model architectures.
              </p>
            </div>
            <div className={styles.showcaseItem}>
              <div className={styles.showcaseNumber}>02</div>
              <h3>Continuous Monitoring</h3>
              <p>
                Real-time AI security monitoring that detects anomalies, policy violations,
                and potential attacks in production environments.
              </p>
            </div>
            <div className={styles.showcaseItem}>
              <div className={styles.showcaseNumber}>03</div>
              <h3>Compliance Automation</h3>
              <p>
                Automated compliance reporting for AI governance frameworks, including
                EU AI Act, NIST AI RMF, and industry-specific regulations.
              </p>
            </div>
            <div className={styles.showcaseItem}>
              <div className={styles.showcaseNumber}>04</div>
              <h3>Enterprise Integrations</h3>
              <p>
                Seamless integration with your existing security stack—SIEM, SOAR, and
                vulnerability management platforms.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>Don't Miss Out</h2>
            <p className={styles.ctaText}>
              RSA Conference is the world's largest gathering of security professionals.
              Schedule a meeting now to guarantee time with our team.
            </p>
            <div className={styles.ctaButtons}>
              <Link to="/contact" className={styles.ctaPrimary}>
                Schedule a Meeting
              </Link>
              <Link to="/docs" className={styles.ctaSecondary}>
                Explore Documentation
              </Link>
            </div>
          </div>
        </section>

        {/* Footer Navigation */}
        <section className={styles.footerNav}>
          <Link to="/events" className={styles.backLink}>
            <svg className={styles.backIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to All Events
          </Link>
        </section>
      </main>
    </Layout>
  );
}
