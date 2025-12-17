import React, { useEffect, useState } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './bsides-seattle-2025.module.css';

export default function BSidesSeattle2025(): React.ReactElement {
  const [rainEnabled, setRainEnabled] = useState(true);

  useEffect(() => {
    // This page supports both light and dark mode - use light as default
    document.documentElement.setAttribute('data-theme', 'light');

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
      description="Promptfoo joined the Pacific Northwest security community at BSides Seattle 2025. Workshops, demos, and great conversations over coffee."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at BSides Seattle 2025" />
        <meta
          property="og:description"
          content="Recap of Promptfoo at BSides Seattle 2025. Community-driven security, AI red teaming demos, and PNW vibes."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="/events/bsides-seattle-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://www.promptfoo.dev/img/events/bsides-seattle-2025.jpg" />
        <meta name="twitter:image" content="https://www.promptfoo.dev/img/events/bsides-seattle-2025.jpg" />
        <meta
          name="keywords"
          content="BSides Seattle 2025, security conference, AI security, LLM security, Pacific Northwest, Seattle"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/bsides-seattle-2025" />
      </Head>

      <main className={styles.bsidesPage}>
        {/* Rain Effect */}
        {rainEnabled && (
          <div className={styles.rainContainer}>
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className={styles.raindrop}
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            {/* Hero Image */}
            <div className={styles.heroImageContainer}>
              <img
                src="/img/events/bsides-seattle-2025.jpg"
                alt="BSides Seattle 2025"
                className={styles.heroImage}
              />
              <div className={styles.heroImageOverlay} />
            </div>
            {/* Mountain Silhouette */}
            <div className={styles.mountainSilhouette}>
              <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
                <path
                  fill="currentColor"
                  d="M0,320L48,304C96,288,192,256,288,234.7C384,213,480,203,576,213.3C672,224,768,256,864,261.3C960,267,1056,245,1152,234.7C1248,224,1344,224,1392,224L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                />
              </svg>
            </div>

            <div className={styles.heroContent}>
              <div className={styles.badge}>
                <span className={styles.coffeeIcon}>☕</span>
                BSides Seattle 2025
              </div>
              <h1 className={styles.heroTitle}>
                Security, Community,
                <br />
                <span className={styles.highlight}>Coffee</span>
              </h1>
              <p className={styles.heroSubtitle}>
                We joined the Pacific Northwest security community for a day of hands-on learning,
                great conversations, and way too much caffeine.
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
                  <span>May 10, 2025</span>
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
                  <span>The Collective Seattle</span>
                </div>
                <div className={styles.detail}>
                  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Community Con</span>
                </div>
              </div>
              <div className={styles.heroButtons}>
                <a
                  href="#recap"
                  className={styles.primaryButton}
                  onClick={(e) => handleSmoothScroll(e, '#recap')}
                >
                  See the Recap
                </a>
                <button
                  type="button"
                  className={styles.rainToggle}
                  onClick={() => setRainEnabled(!rainEnabled)}
                >
                  {rainEnabled ? '🌧️ Seattle Mode' : '☀️ Sunny (rare)'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* The BSides Spirit Section */}
        <section className={styles.spiritSection} id="recap">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>The BSides Spirit</h2>
            <p className={styles.sectionSubtitle}>
              BSides conferences are the heart of the security community. No corporate polish, just
              passionate people sharing knowledge.
            </p>
            <div className={styles.spiritGrid}>
              <div className={styles.spiritCard}>
                <div className={styles.spiritEmoji}>🌲</div>
                <h3>PNW Roots</h3>
                <p>
                  Seattle's security community is tight-knit and welcoming. From Boeing to Amazon to
                  countless startups, the talent here is incredible.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.spiritEmoji}>🤝</div>
                <h3>Community First</h3>
                <p>
                  BSides isn't about vendor pitches. It's about sharing real knowledge, making
                  connections, and helping each other level up.
                </p>
              </div>
              <div className={styles.spiritCard}>
                <div className={styles.spiritEmoji}>☕</div>
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
            <h2 className={styles.sectionTitle}>What We Shared</h2>
            <div className={styles.sharedGrid}>
              <div className={styles.sharedCard}>
                <div className={styles.sharedIcon}>🎯</div>
                <h3>AI Red Teaming Workshop</h3>
                <p>
                  Hands-on session showing attendees how to find vulnerabilities in LLM applications
                  using open source tools.
                </p>
                <div className={styles.sharedMeta}>
                  <span className={styles.tag}>Workshop</span>
                  <span className={styles.tag}>Hands-on</span>
                </div>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.sharedIcon}>🔓</div>
                <h3>Jailbreaking Demos</h3>
                <p>
                  Live demonstrations of prompt injection, jailbreaking, and data exfiltration
                  attacks against popular LLM providers.
                </p>
                <div className={styles.sharedMeta}>
                  <span className={styles.tag}>Live Demo</span>
                  <span className={styles.tag}>Interactive</span>
                </div>
              </div>
              <div className={styles.sharedCard}>
                <div className={styles.sharedIcon}>💬</div>
                <h3>Hallway Conversations</h3>
                <p>
                  Some of the best moments at BSides happen between sessions. We talked AI security
                  challenges with teams from across the PNW.
                </p>
                <div className={styles.sharedMeta}>
                  <span className={styles.tag}>Networking</span>
                  <span className={styles.tag}>Community</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Community Moments */}
        <section className={styles.momentsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Community Moments</h2>
            <div className={styles.quotesGrid}>
              <blockquote className={styles.quote}>
                <p>
                  "Finally, someone explaining AI security in a way that actually makes sense.
                  Promptfoo's approach is refreshingly practical."
                </p>
                <cite>— Security Engineer, Seattle Startup</cite>
              </blockquote>
              <blockquote className={styles.quote}>
                <p>
                  "The red teaming workshop was exactly what our team needed. We found three issues
                  in our chatbot the same week."
                </p>
                <cite>— DevSecOps Lead, Fortune 500</cite>
              </blockquote>
              <blockquote className={styles.quote}>
                <p>
                  "Love seeing security tools that are actually open source. The community around
                  Promptfoo is growing fast."
                </p>
                <cite>— Independent Security Researcher</cite>
              </blockquote>
            </div>
          </div>
        </section>

        {/* PNW Security Scene */}
        <section className={styles.sceneSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>The PNW Security Scene</h2>
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
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <div className={styles.ctaCard}>
              <h2>Join the Community</h2>
              <p>
                Whether you're in Seattle or anywhere else, the AI security community is growing.
                Let's connect.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="https://discord.gg/promptfoo" className={styles.primaryButton}>
                  Join Discord
                </Link>
                <Link to="https://github.com/promptfoo/promptfoo" className={styles.secondaryButton}>
                  Star on GitHub
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
