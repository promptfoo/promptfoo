import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './blackhat-2026.module.css';

export default function BlackHat2026(): React.ReactElement {
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
      title="Promptfoo at Black Hat USA 2026"
      description="This is the biggest stage in offensive security. Meet Promptfoo at Black Hat for live AI attacks, automated red teaming, and practical defenses."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          property="og:description"
          content="This is the biggest stage in offensive security. Meet Promptfoo at Black Hat for live AI attacks, automated red teaming, and practical defenses. Aug 1-6, Las Vegas."
        />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/blackhat-2026.jpg"
        />
        <meta property="og:url" content="https://www.promptfoo.dev/events/blackhat-2026" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Promptfoo at Black Hat USA 2026 | AI Security" />
        <meta
          name="twitter:description"
          content="Live demos of AI vulnerability testing & automated red teaming. Aug 1-6, Las Vegas."
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/blackhat-2026.jpg"
        />
        <meta
          name="keywords"
          content="Black Hat USA 2026, AI security, LLM security, prompt injection, jailbreaking, red teaming, AI vulnerability testing, OWASP LLM Top 10"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/blackhat-2026" />
      </Head>

      <main className={styles.blackhatPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>Black Hat USA 2026</div>
              <h1 className={styles.heroTitle}>
                Break Your AI
                <br />
                <span className={styles.highlight}>Before Attackers Do</span>
              </h1>
              <p className={styles.heroSubtitle}>
                This is the biggest stage in offensive security. Meet Promptfoo at Black Hat to see
                live AI attacks, automated red teaming workflows, and practical defenses you can
                deploy now.
              </p>
              <div className={styles.heroButtons}>
                <a
                  href="#learn-more"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#learn-more')}
                >
                  Learn More
                </a>
                <Link to="/contact" className={styles.secondaryButton}>
                  Schedule a Meeting
                </Link>
              </div>
              <div className={styles.eventDetails}>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>August 1-6, 2026</span>
                </div>
                <div className={styles.detail}>
                  <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
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
                  <span>Mandalay Bay, Las Vegas</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What to Expect Section */}
        <section className={styles.demoSection} id="learn-more">
          <div className={styles.demoBackground}>
            <div className={styles.demoContainer}>
              <div className={styles.demoHeader}>
                <h2 className={styles.demoTitle}>What to Expect</h2>
              </div>
              <div className={styles.demoGrid}>
                <div className={styles.demoCard} data-demo="1">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <SecurityIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Live AI Attack Demos</h3>
                      <p>
                        Prompt injection, jailbreaks, data exfiltration, and tool-use exploits
                        against real-world applications.
                      </p>
                      <div className={styles.demoTag}>LIVE DEMO</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="2">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <BugReportIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Automated Red Teaming</h3>
                      <p>
                        See how teams scale probing across models, prompts, and releases with zero
                        manual effort.
                      </p>
                      <div className={styles.demoTag}>INTERACTIVE</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="3">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <SpeedIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Defenses That Ship</h3>
                      <p>
                        Guardrails, detection rules, and remediation guidance you can take home.
                      </p>
                      <div className={styles.demoTag}>HANDS-ON</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Why Security Teams Choose Promptfoo</h2>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>{SITE_CONSTANTS.USER_COUNT_DISPLAY}+</div>
                <div className={styles.statLabel}>Developers</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>80+</div>
                <div className={styles.statLabel}>Fortune 500 Companies</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>Aug 1-6</div>
                <div className={styles.statLabel}>Las Vegas</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2>Attending Black Hat?</h2>
            <p>Schedule a meeting to discuss your use case and see a tailored demo.</p>
            <div className={styles.ctaButtons}>
              <Link to="/contact" className={styles.primaryButton}>
                Schedule a Meeting
              </Link>
              <Link to="https://discord.gg/promptfoo" className={styles.secondaryButton}>
                Join our Discord
              </Link>
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
