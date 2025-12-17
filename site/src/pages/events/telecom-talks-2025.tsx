import React, { useEffect, useRef } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './telecom-talks-2025.module.css';

function SignalWave(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      if (!ctx || !canvas) {
        return;
      }

      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      time += 0.02;

      // Draw multiple signal waves
      const waves = [
        { color: 'rgba(0, 212, 255, 0.3)', amplitude: 30, frequency: 0.02, phase: 0 },
        { color: 'rgba(0, 255, 136, 0.2)', amplitude: 20, frequency: 0.015, phase: 2 },
        { color: 'rgba(0, 212, 255, 0.15)', amplitude: 40, frequency: 0.01, phase: 4 },
      ];

      for (const wave of waves) {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 2;

        for (let x = 0; x < canvas.offsetWidth; x++) {
          const y =
            canvas.offsetHeight / 2 +
            Math.sin(x * wave.frequency + time + wave.phase) * wave.amplitude +
            Math.sin(x * wave.frequency * 2 + time * 1.5) * (wave.amplitude / 3);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.signalCanvas} />;
}

export default function TelecomTalks2025(): React.ReactElement {
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
      title="Telecom Talks 2025"
      description="Promptfoo at Telecom Talks 2025. Ian Webster on stage with Swisscom Outpost discussing AI security in telecommunications."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at Telecom Talks 2025" />
        <meta
          property="og:description"
          content="AI security for telecommunications. Ian Webster joined Swisscom Outpost on stage at Telecom Talks 2025 in Menlo Park."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="/events/telecom-talks-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/telecom-talks-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/telecom-talks-2025.jpg"
        />
        <meta
          name="keywords"
          content="Telecom Talks 2025, telecommunications security, AI security, LLM security, Swisscom, 5G security"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/telecom-talks-2025" />
      </Head>

      <main className={styles.telecomPage}>
        {/* Hero Image Background */}
        <div className={styles.heroImageContainer}>
          <img
            src="/img/events/telecom-talks-2025.jpg"
            alt="Telecom Talks 2025"
            className={styles.heroImage}
          />
          <div className={styles.heroImageOverlay} />
        </div>

        {/* Circuit Pattern Background */}
        <div className={styles.circuitPattern}>
          <svg className={styles.circuitSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern
                id="circuit"
                x="0"
                y="0"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M10 0 L10 8 M0 10 L8 10 M12 10 L20 10 M10 12 L10 20"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  fill="none"
                />
                <circle cx="10" cy="10" r="2" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#circuit)" />
          </svg>
        </div>

        {/* Signal Wave Animation */}
        <div className={styles.signalBackground}>
          <SignalWave />
        </div>

        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>
              <span className={styles.signalIcon}>📡</span>
              Telecom Talks 2025
            </div>
            <h1 className={styles.heroTitle}>
              Securing the
              <br />
              <span className={styles.highlight}>Signal</span>
            </h1>
            <p className={styles.heroSubtitle}>
              AI security meets telecom. Ian Webster joined Swisscom Outpost on stage to discuss
              practical GenAI security challenges for real deployments.
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
                <span>April 9, 2025</span>
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
                <span>SRI International, Menlo Park</span>
              </div>
              <div className={styles.detail}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span>On Stage with Swisscom Outpost</span>
              </div>
            </div>
            <div className={styles.heroButtons}>
              <a
                href="#session"
                className={styles.primaryButton}
                onClick={(e) => handleSmoothScroll(e, '#session')}
              >
                View Session
              </a>
              <Link to="/docs/red-team/" className={styles.secondaryButton}>
                Explore Red Teaming
              </Link>
            </div>
          </div>
        </section>

        {/* Terminal Event Log */}
        <section className={styles.terminalSection}>
          <div className={styles.container}>
            <div className={styles.terminal}>
              <div className={styles.terminalHeader}>
                <div className={styles.terminalDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.terminalTitle}>event.log</span>
              </div>
              <div className={styles.terminalBody}>
                <div className={styles.logLine}>
                  <span className={styles.timestamp}>[CONNECTED]</span>
                  <span className={styles.logSuccess}>LOCATION</span>
                  <span className={styles.logText}>Telecom Talks 2025 • SRI International</span>
                </div>
                <div className={styles.logLine}>
                  <span className={styles.timestamp}>[SESSION]</span>
                  <span className={styles.logInfo}>PANEL</span>
                  <span className={styles.logText}>
                    GenAI security challenges with Swisscom Outpost
                  </span>
                </div>
                <div className={styles.logLine}>
                  <span className={styles.timestamp}>[DEMO]</span>
                  <span className={styles.logWarning}>LIVE</span>
                  <span className={styles.logText}>LLM red teaming concepts and failure modes</span>
                </div>
                <div className={styles.logLine}>
                  <span className={styles.timestamp}>[NETWORK]</span>
                  <span className={styles.logSuccess}>CONNECT</span>
                  <span className={styles.logText}>
                    Conversations with telecom security leaders
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Session Section */}
        <section className={styles.sessionSection} id="session">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>The Session</h2>
            <div className={styles.sessionCard}>
              <div className={styles.sessionMeta}>
                <span className={styles.sessionBadge}>Joint Presentation</span>
                <span className={styles.sessionTime}>
                  April 9, 2025 • SRI International, Menlo Park
                </span>
              </div>
              <h3 className={styles.sessionTitle}>AI Security in Telecommunications</h3>
              <p className={styles.sessionDescription}>
                Ian Webster joined Swisscom's security team on stage to discuss the unique
                challenges of securing AI systems in telecommunications infrastructure. From
                customer service chatbots to network operations assistants, telecom companies are
                deploying LLMs at scale—and facing new security challenges.
              </p>
              <div className={styles.sessionSpeakers}>
                <div className={styles.speaker}>
                  <div className={styles.speakerAvatar}>IW</div>
                  <div>
                    <div className={styles.speakerName}>Ian Webster</div>
                    <div className={styles.speakerCompany}>Promptfoo</div>
                  </div>
                </div>
                <div className={styles.speakerDivider}>+</div>
                <div className={styles.speaker}>
                  <div className={styles.speakerAvatar}>SC</div>
                  <div>
                    <div className={styles.speakerName}>Swisscom Outpost</div>
                    <div className={styles.speakerCompany}>Security Team</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Telecom Challenges Section */}
        <section className={styles.challengesSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Telecom Security Challenges</h2>
            <p className={styles.sectionSubtitle}>
              Why AI security is critical for the telecommunications industry.
            </p>
            <div className={styles.challengesGrid}>
              <div className={styles.challengeCard}>
                <div className={styles.challengeIcon}>🌐</div>
                <h3>5G & Edge Computing</h3>
                <p>
                  AI at the network edge introduces new attack surfaces. From base stations to
                  customer premises equipment, LLMs are everywhere.
                </p>
              </div>
              <div className={styles.challengeCard}>
                <div className={styles.challengeIcon}>🔌</div>
                <h3>API Exposure</h3>
                <p>
                  Telecom APIs increasingly use AI for routing, fraud detection, and customer
                  service. Each endpoint is a potential vulnerability.
                </p>
              </div>
              <div className={styles.challengeCard}>
                <div className={styles.challengeIcon}>📱</div>
                <h3>Customer Data</h3>
                <p>
                  Call records, location data, billing information. AI systems processing this data
                  need rigorous security testing.
                </p>
              </div>
              <div className={styles.challengeCard}>
                <div className={styles.challengeIcon}>⚡</div>
                <h3>Critical Infrastructure</h3>
                <p>
                  Networks that power emergency services, hospitals, and financial systems. The
                  stakes for AI security couldn't be higher.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Discussions */}
        <section className={styles.discussionsSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Key Discussions</h2>
            <div className={styles.discussionsList}>
              <div className={styles.discussionItem}>
                <div className={styles.discussionNumber}>01</div>
                <div className={styles.discussionContent}>
                  <h3>Carrier-Grade LLM Security</h3>
                  <p>
                    How major telecom providers are approaching AI security at scale, including
                    lessons learned from early deployments and best practices emerging across the
                    industry.
                  </p>
                </div>
              </div>
              <div className={styles.discussionItem}>
                <div className={styles.discussionNumber}>02</div>
                <div className={styles.discussionContent}>
                  <h3>Network API Protection</h3>
                  <p>
                    Strategies for securing AI-powered network APIs against prompt injection, data
                    exfiltration, and unauthorized access attempts.
                  </p>
                </div>
              </div>
              <div className={styles.discussionItem}>
                <div className={styles.discussionNumber}>03</div>
                <div className={styles.discussionContent}>
                  <h3>Regulatory Compliance</h3>
                  <p>
                    Navigating GDPR, telecommunications regulations, and emerging AI governance
                    frameworks while deploying innovative AI solutions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Signal Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>1</div>
                <div className={styles.statLabel}>Day</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>200+</div>
                <div className={styles.statLabel}>Attendees</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>0ms</div>
                <div className={styles.statLabel}>Latency to Security</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>5G</div>
                <div className={styles.statLabel}>Speed</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <div className={styles.ctaCard}>
              <h2>Establish Connection</h2>
              <p>
                Ready to secure your telecom AI deployments? Start testing with Promptfoo's
                open-source red teaming framework.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/red-team/quickstart/" className={styles.primaryButton}>
                  Get Started
                </Link>
                <Link
                  to="https://github.com/promptfoo/promptfoo"
                  className={styles.secondaryButton}
                >
                  View Source
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
