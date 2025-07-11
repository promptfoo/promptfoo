import Cal, { getCalApi } from '@calcom/embed-react';
import React, { useEffect } from 'react';
import Link from '@docusaurus/Link';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import Layout from '@theme/Layout';
import styles from './blackhat-2025.module.css';

export default function BlackHat2025(): JSX.Element {
  useEffect(() => {
    // Force dark theme for this page
    document.documentElement.setAttribute('data-theme', 'dark');

    // Cal.com setup
    (async function () {
      const cal = await getCalApi({ namespace: 'promptfoo-at-blackhat' });
      cal('ui', { hideEventTypeDetails: false, layout: 'month_view' });
    })();

    // Cleanup on unmount
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  return (
    <Layout
      title="Promptfoo at Black Hat USA 2025"
      description="Meet Promptfoo at Black Hat USA 2025. Schedule a demo to see how we're revolutionizing AI security testing and red teaming for enterprise LLM applications."
    >
      <main className={styles.blackhatPage}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>Black Hat USA 2025</div>
              <h1 className={styles.heroTitle}>
                Security for AI used by
                <br />
                <span className={styles.highlight}>100,000 Developers</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Join us at Black Hat USA to see how Promptfoo helps security teams find and fix LLM
                vulnerabilities before attackers do.
              </p>
              <div className={styles.heroButtons}>
                <a href="#schedule-demo" className={styles.primaryButton}>
                  Schedule a Demo at Black Hat
                </a>
                <a href="#learn-more" className={styles.secondaryButton}>
                  Learn More
                </a>
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
                  <span>August 5-7, 2025</span>
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span>Booth #4712</span>
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
                      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                    />
                  </svg>
                  <span style={{ fontWeight: 'bold', color: '#ff6b6b' }}>
                    AI Summit Speaker - Aug 6
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What We'll Show Section */}
        <section className={styles.demoSection} id="learn-more">
          <div className={styles.demoBackground}>
            <div className={styles.demoContainer}>
              <div className={styles.demoHeader}>
                <h2 className={styles.demoTitle}>What We'll Demo at Black Hat</h2>
              </div>
              <div className={styles.demoGrid}>
                <div className={styles.demoCard} data-demo="1">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <SecurityIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Live Attack Demonstrations</h3>
                      <p>
                        Watch our security researchers perform real-time demonstrations of prompt
                        injection, jailbreaking, and data exfiltration attacks. See how Promptfoo
                        automatically detects and prevents these threats across GPT-4, Claude,
                        Llama, and other popular models.
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
                      <h3>AI-Powered Red Team Automation</h3>
                      <p>
                        Our ML models generate thousands of application-specific attack variations
                        to uncover vulnerabilities that static scanners miss. Experience how
                        continuous red teaming adapts to your unique architecture and use cases.
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
                      <h3>Seamless CI/CD Security Integration</h3>
                      <p>
                        See live demos of our GitHub Actions, GitLab CI, and Jenkins integrations.
                        Learn how Fortune 500 companies automatically catch LLM vulnerabilities in
                        development before they reach production environments.
                      </p>
                      <div className={styles.demoTag}>HANDS-ON</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
                <div className={styles.demoCard} data-demo="4">
                  <div className={styles.demoCardInner}>
                    <div className={styles.demoIconWrapper}>
                      <AssessmentIcon className={styles.demoIcon} />
                      <div className={styles.demoIconGlow} />
                    </div>
                    <div className={styles.demoContent}>
                      <h3>Compliance & Risk Assessment</h3>
                      <p>
                        Get automated reports for OWASP LLM Top 10, NIST AI RMF, and EU AI Act
                        compliance. Our platform provides actionable remediation guidance and tracks
                        your security posture over time with executive-ready dashboards.
                      </p>
                      <div className={styles.demoTag}>SHOWCASE</div>
                    </div>
                  </div>
                  <div className={styles.demoCardBorder} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Calendar Section */}
        <section className={styles.calendarSection} id="schedule-demo">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Meet with us at Black Hat</h2>
            <p className={styles.calendarSubtitle}>
              Book a 30-minute demo slot to see Promptfoo in action. Our security experts will show
              you how to find and fix vulnerabilities in your LLM applications.
            </p>
            <div className={styles.calendarWrapper}>
              <Cal
                namespace="promptfoo-at-blackhat"
                calLink="team/promptfoo/promptfoo-at-blackhat"
                style={{ width: '100%', height: '100%', overflow: 'scroll' }}
                config={{ layout: 'month_view' }}
              />
            </div>
          </div>
        </section>

        {/* Why Meet Us Section */}
        <section className={styles.whySection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Why Security Teams Choose Promptfoo</h2>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>100K+</div>
                <div className={styles.statLabel}>Open Source Users</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>27</div>
                <div className={styles.statLabel}>Fortune 500 Companies</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>16M+</div>
                <div className={styles.statLabel}>Security Probes Run</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>37</div>
                <div className={styles.statLabel}>Average Issues Found Per Scan</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <h2>Don't Leave Your AI Vulnerable</h2>
            <p>
              Join hundreds of security teams who trust Promptfoo to protect their LLM applications.
            </p>
            <div className={styles.ctaButtons}>
              <a href="#schedule-demo" className={styles.primaryButton}>
                Book Your Demo Slot
              </a>
              <Link to="/security" className={styles.secondaryButton}>
                Explore Our Security Platform
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
