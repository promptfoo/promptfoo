import React, { useEffect, useRef } from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './ai-security-summit-2025.module.css';

interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
}

function NeuralNetwork(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NeuralNode[]>([]);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize nodes
    const nodeCount = 40;
    nodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 3 + 2,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    const animate = () => {
      if (!ctx || !canvas) {
        return;
      }

      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      const nodes = nodesRef.current;
      const time = Date.now() * 0.001;

      // Update nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.pulsePhase += 0.02;

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.offsetWidth) {
          node.vx *= -1;
        }
        if (node.y < 0 || node.y > canvas.offsetHeight) {
          node.vy *= -1;
        }
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            const opacity = (1 - distance / 150) * 0.4;
            const gradient = ctx.createLinearGradient(
              nodes[i].x,
              nodes[i].y,
              nodes[j].x,
              nodes[j].y,
            );
            gradient.addColorStop(0, `rgba(124, 58, 237, ${opacity})`);
            gradient.addColorStop(0.5, `rgba(59, 130, 246, ${opacity})`);
            gradient.addColorStop(1, `rgba(236, 72, 153, ${opacity})`);

            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = Math.sin(node.pulsePhase) * 0.3 + 0.7;
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius * 2,
        );
        gradient.addColorStop(0, `rgba(124, 58, 237, ${pulse})`);
        gradient.addColorStop(0.5, `rgba(59, 130, 246, ${pulse * 0.6})`);
        gradient.addColorStop(1, 'rgba(236, 72, 153, 0)');

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * (0.8 + pulse * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.neuralCanvas} aria-hidden="true" />;
}

export default function AISecuritySummit2025(): React.ReactElement {
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
      title="AI Security Summit 2025"
      description="Promptfoo at AI Security Summit 2025 in San Francisco. Panel discussions, live demos, and cutting-edge AI security research."
    >
      <Head>
        <meta property="og:title" content="Promptfoo at AI Security Summit 2025" />
        <meta
          property="og:description"
          content="Join us at AI Security Summit 2025. Expert panels on LLM vulnerabilities, red teaming demonstrations, and the future of AI security."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="/events/ai-security-summit-2025" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/events/ai-security-summit-2025.jpg"
        />
        <meta
          name="twitter:image"
          content="https://www.promptfoo.dev/img/events/ai-security-summit-2025.jpg"
        />
        <meta
          name="keywords"
          content="AI Security Summit 2025, LLM security, AI red teaming, San Francisco, AI vulnerabilities, machine learning security"
        />
        <link rel="canonical" href="https://promptfoo.dev/events/ai-security-summit-2025" />
      </Head>

      <main className={styles.summitPage}>
        {/* Hero Image Background */}
        <div className={styles.heroImageContainer}>
          <img
            src="/img/events/ai-security-summit-2025.jpg"
            alt="AI Security Summit 2025"
            className={styles.heroImage}
          />
          <div className={styles.heroImageOverlay} />
        </div>

        {/* Neural Network Background */}
        <div className={styles.neuralBackground}>
          <NeuralNetwork />
        </div>

        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>
              <span className={styles.badgeIcon}>🧠</span>
              AI Security Summit 2025
            </div>
            <h1 className={styles.heroTitle}>
              The Future of
              <br />
              <span className={styles.gradientText}>AI Security</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Two days of groundbreaking research, expert panels, and hands-on demonstrations
              shaping the future of AI security.
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
                <span>October 22-23, 2025</span>
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
                <span>Westin St. Francis, San Francisco</span>
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
                <span>Panel Speaker</span>
              </div>
            </div>
            <div className={styles.heroButtons}>
              <a
                href="#highlights"
                className={styles.primaryButton}
                onClick={(e) => handleSmoothScroll(e, '#highlights')}
              >
                View Highlights
              </a>
              <Link to="/docs/red-team/" className={styles.secondaryButton}>
                Learn Red Teaming
              </Link>
            </div>
          </div>
        </section>

        {/* Speaker Spotlight */}
        <section className={styles.speakerSection} id="highlights">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Speaker Spotlight</h2>
            <div className={styles.speakerCard}>
              <div className={styles.speakerInfo}>
                <div className={styles.speakerBadge}>Panel Speaker</div>
                <h3 className={styles.speakerName}>Ian Webster</h3>
                <p className={styles.speakerRole}>CEO & Co-founder, Promptfoo</p>
                <p className={styles.speakerBio}>
                  Ian joined industry leaders to discuss the evolving landscape of LLM
                  vulnerabilities, emerging attack vectors, and practical defense strategies for
                  enterprise AI deployments.
                </p>
                <div className={styles.speakerTopics}>
                  <span className={styles.topic}>LLM Security</span>
                  <span className={styles.topic}>Red Teaming</span>
                  <span className={styles.topic}>Enterprise AI</span>
                </div>
              </div>
              <div className={styles.speakerVisual}>
                <div className={styles.visualOrb}>
                  <div className={styles.orbInner} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Themes */}
        <section className={styles.themesSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Key Themes</h2>
            <p className={styles.sectionSubtitle}>
              Critical topics shaping the AI security landscape in 2025 and beyond.
            </p>
            <div className={styles.themesGrid}>
              <div className={styles.themeCard}>
                <div className={styles.themeIcon}>🎯</div>
                <h3>Adversarial AI</h3>
                <p>
                  Understanding how attackers exploit LLMs through prompt injection, jailbreaking,
                  and novel attack vectors targeting foundation models.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.themeIcon}>🔐</div>
                <h3>Defense Strategies</h3>
                <p>
                  Building robust guardrails and implementing comprehensive red teaming programs to
                  secure AI applications at scale.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.themeIcon}>🏢</div>
                <h3>Enterprise Readiness</h3>
                <p>
                  Navigating compliance requirements, governance frameworks, and security best
                  practices for production AI systems.
                </p>
              </div>
              <div className={styles.themeCard}>
                <div className={styles.themeIcon}>🔮</div>
                <h3>Future Threats</h3>
                <p>
                  Anticipating emerging vulnerabilities in multimodal models, agents, and
                  next-generation AI architectures.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Research Highlights */}
        <section className={styles.researchSection}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Research Highlights</h2>
            <div className={styles.researchGrid}>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>01</div>
                <h3>Automated Red Teaming</h3>
                <p>
                  Demonstrated how open-source tools can systematically discover vulnerabilities in
                  LLM applications through automated adversarial testing.
                </p>
                <Link to="/docs/red-team/quickstart/" className={styles.researchLink}>
                  Try it yourself →
                </Link>
              </div>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>02</div>
                <h3>Jailbreak Patterns</h3>
                <p>
                  Analyzed common jailbreak techniques and their effectiveness across different
                  model providers, revealing gaps in current safety measures.
                </p>
                <Link to="/docs/red-team/strategies/" className={styles.researchLink}>
                  View strategies →
                </Link>
              </div>
              <div className={styles.researchCard}>
                <div className={styles.researchNumber}>03</div>
                <h3>Data Exfiltration</h3>
                <p>
                  Showcased novel methods attackers use to extract sensitive information from RAG
                  systems and enterprise chatbots.
                </p>
                <Link to="/docs/red-team/plugins/pii/" className={styles.researchLink}>
                  Explore plugins →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={styles.statsSection}>
          <div className={styles.container}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statNumber}>500+</div>
                <div className={styles.statLabel}>Attendees</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>2</div>
                <div className={styles.statLabel}>Days</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>30+</div>
                <div className={styles.statLabel}>Sessions</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNumber}>1</div>
                <div className={styles.statLabel}>Mission</div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={styles.finalCta}>
          <div className={styles.container}>
            <div className={styles.ctaCard}>
              <h2>Secure Your AI</h2>
              <p>
                Start red teaming your LLM applications today with Promptfoo's open-source security
                testing framework.
              </p>
              <div className={styles.ctaButtons}>
                <Link to="/docs/red-team/quickstart/" className={styles.primaryButton}>
                  Get Started
                </Link>
                <Link
                  to="https://github.com/promptfoo/promptfoo"
                  className={styles.secondaryButton}
                >
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
