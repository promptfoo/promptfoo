import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { SITE_CONSTANTS } from '../../constants';
import styles from './scaleup-ai-2025.module.css';

export default function ScaleUpAI2025(): React.ReactElement {
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
      title="Promptfoo at ScaleUp:AI 2025"
      description="How Promptfoo is restoring trust and security in generative AI. Featured in Insight Partners' ScaleUp:AI 2025 Partner Series."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at ScaleUp:AI 2025 - Insight Partners" />
        <meta
          property="og:description"
          content="How Promptfoo is restoring trust and security in generative AI. Ian Webster discusses the future of AI security."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.promptfoo.dev/events/scaleup-ai-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/scaleup-ai-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/scaleup-ai-2025.jpg"
        />
        <meta
          name="keywords"
          content="ScaleUp:AI 2025, Insight Partners, AI security, Promptfoo, Ian Webster, venture capital, AI investment"
        />
        <link rel="canonical" href="https://www.promptfoo.dev/events/scaleup-ai-2025" />
      </Head>

      <main className={styles.scaleupPage}>
        {/* Hero Banner */}
        <section className={styles.heroBanner}>
          <img
            src="/img/events/scaleup-ai-2025.jpg"
            alt="ScaleUp:AI 2025"
            className={styles.bannerImage}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🚀</span>
              Insight Partners • ScaleUp:AI 2025
            </div>
            <h1 className={styles.heroTitle}>
              Restoring <span className={styles.highlight}>Trust in AI</span>
            </h1>
          </div>
        </section>

        {/* Hero Content */}
        <section className={styles.heroContent}>
          <div className={styles.container}>
            <p className={styles.heroSubtitle}>
              Featured in Insight Partners' ScaleUp:AI 2025 Partner Series. CEO Ian Webster shares
              how Promptfoo is defining the standard for enterprise AI security.
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
                <span>December 3, 2025</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <span>Insight Partners</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>Ian Webster, CEO</span>
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a
                href="https://www.insightpartners.com/ideas/promptfoo-scale-up-ai/"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryCta}
              >
                Read Full Article
              </a>
              <a
                href="#highlights"
                className={styles.secondaryCta}
                onClick={(e) => handleSmoothScroll(e, '#highlights')}
              >
                Key Takeaways
              </a>
            </div>
          </div>
        </section>

        {/* Quote Section */}
        <section className={styles.quoteSection}>
          <div className={styles.container}>
            <div className={styles.quoteContent}>
              <blockquote className={styles.quote}>
                "AI is underhyped. The software industry looks so different five to ten years from
                now."
              </blockquote>
              <div className={styles.quoteAttribution}>
                <div className={styles.quoteAuthor}>Ian Webster</div>
                <div className={styles.quoteRole}>CEO & Co-founder, Promptfoo</div>
              </div>
            </div>
          </div>
        </section>

        {/* Highlights Section */}
        <section id="highlights" className={styles.highlightsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Key Takeaways</h2>
              <p className={styles.sectionSubtitle}>Insights from the ScaleUp:AI feature</p>
            </div>

            <div className={styles.highlightsGrid}>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🔐</div>
                <h3>Closing the Security Gap</h3>
                <p>
                  Traditional cybersecurity tools were built for predictable software. LLMs operate
                  in natural language—attackers can manipulate them simply by talking to them.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🤖</div>
                <h3>Machines Testing Machines</h3>
                <p>
                  Promptfoo's AI models behave like attackers, red teaming applications through chat
                  interfaces and APIs to uncover vulnerabilities before deployment.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>📈</div>
                <h3>Rapid Adoption</h3>
                <p>
                  As featured by Insight Partners: 200,000+ developers and 80+ Fortune 500 companies
                  use Promptfoo, backed by an $18.4M Series A led by Insight.
                </p>
              </div>
              <div className={styles.highlightCard}>
                <div className={styles.cardIcon}>🔮</div>
                <h3>Future of AI Security</h3>
                <p>
                  As AI systems evolve into autonomous multi-agent systems, observability and
                  continuous security testing become critical for enterprise deployments.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Points Section */}
        <section className={styles.keyPointsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>From the Article</h2>
              <p className={styles.sectionSubtitle}>Why AI security matters now</p>
            </div>

            <div className={styles.keyPointsGrid}>
              <div className={styles.keyPoint}>
                <div className={styles.keyPointNumber}>01</div>
                <h3>The Problem</h3>
                <p>
                  "Old-school defenses aren't reliable because they're designed to read code, not
                  conversation." Traditional security can't protect systems that operate in natural
                  language.
                </p>
              </div>
              <div className={styles.keyPoint}>
                <div className={styles.keyPointNumber}>02</div>
                <h3>The Origin</h3>
                <p>
                  Ian Webster built the first version of Promptfoo while leading AI products at
                  Discord—shipping to 200 million users taught him "all of the wonderful things, and
                  also the terrible things" that follow.
                </p>
              </div>
              <div className={styles.keyPoint}>
                <div className={styles.keyPointNumber}>03</div>
                <h3>The Urgency</h3>
                <p>
                  "Global 2000 companies are going to be buying or making decisions in the AI
                  security space in the next 12 months. There's no time to lose."
                </p>
              </div>
              <div className={styles.keyPoint}>
                <div className={styles.keyPointNumber}>04</div>
                <h3>The Vision</h3>
                <p>
                  "If we want to see a world where AI really benefits people and companies, we need
                  to put those tools in the hands of developers." Building AI that's intelligent and
                  accountable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* About Insight Section */}
        <section className={styles.aboutSection}>
          <div className={styles.container}>
            <div className={styles.aboutContent}>
              <div className={styles.aboutText}>
                <h3>About ScaleUp:AI</h3>
                <p>
                  ScaleUp:AI is Insight Partners' premier content series highlighting insights from
                  the companies and leaders shaping the future of AI. As a global software investor
                  and operational partner, Insight Partners has backed many of the world's most
                  transformative technology companies.
                </p>
                <a
                  href="https://www.insightpartners.com/ideas/promptfoo-scale-up-ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.aboutLink}
                >
                  Read the Full Feature →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Ready to Secure Your AI?</h2>
              <p className={styles.ctaText}>
                Join {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers and{' '}
                {SITE_CONSTANTS.FORTUNE_500_COUNT}+ Fortune 500 companies who trust Promptfoo to
                find and fix vulnerabilities in their AI applications.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/intro" className={styles.primaryCta}>
                  Get Started Free
                </Link>
                <Link to="/contact" className={styles.secondaryCta}>
                  Talk to Sales
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
