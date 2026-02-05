import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CodeIcon from '@mui/icons-material/Code';
import CompareIcon from '@mui/icons-material/Compare';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import FlightIcon from '@mui/icons-material/Flight';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RouterIcon from '@mui/icons-material/Router';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import CountUp from 'react-countup';
import NewsletterForm from '../components/NewsletterForm';
import { SITE_CONSTANTS } from '../constants';
import styles from './index.module.css';

function HomepageHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          {/*
          <div className={styles.heroEyebrow}>
            Shift left AI security for enterprise teams
          </div>
          */}
          <h1 className={styles.heroTitle}>Ship agents, not vulnerabilities</h1>
          <p className={styles.heroSubtitle}>
            Automated testing that finds & fixes AI risk in development
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/contact/">
              Book a Demo
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/docs/intro/"
            >
              Try Open Source
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function TrustBar() {
  const marqueeItems = [
    { text: 'Top 5 global retailer', icon: <StorefrontIcon /> },
    { text: 'Top 3 U.S. wireless carrier', icon: <SignalCellularAltIcon /> },
    { text: 'Top 3 global strategy consultancy', icon: <BusinessCenterIcon /> },
    { text: 'Public legal & tax provider', icon: <AccountBalanceIcon /> },
    { text: 'Top 5 U.S. healthcare company', icon: <HealthAndSafetyIcon /> },
    { text: 'Nationwide 5G network operator', icon: <RouterIcon /> },
    { text: 'Top foundation model lab', icon: <PsychologyIcon /> },
    { text: 'Top 3 U.K. insurance provider', icon: <ShieldIcon /> },
    { text: 'Global ERP leader', icon: <DashboardIcon /> },
    { text: 'Top 3 travel site', icon: <FlightIcon /> },
  ];

  return (
    <section className={styles.trustBar}>
      <div className="container">
        {/*<div className={styles.trustBarHeading}>
          Trusted by {SITE_CONSTANTS.FORTUNE_500_COUNT} of the Fortune 500 to test AI before deployment
        </div>*/}
        <div
          className={styles.marquee}
          role="region"
          aria-label="Trusted by leading enterprises across industries"
        >
          <div className={styles.marqueeTrack}>
            {[...marqueeItems, ...marqueeItems].map((item, idx) => (
              <span key={idx} className={styles.marqueeItem}>
                <span className={styles.marqueeIcon}>{item.icon}</span>
                <span className={styles.marqueeText}>{item.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BridgeSection() {
  return (
    <section className={styles.bridgeSection}>
      <div className="container">
        <div className={styles.bridgeStatement}>
          <strong>{SITE_CONSTANTS.FORTUNE_500_COUNT} of the Fortune 500</strong> use Promptfoo in
          their AI development lifecycle. Here's how:
        </div>
      </div>
    </section>
  );
}

function HomepageWalkthrough() {
  const isDarkTheme = useColorMode().colorMode === 'dark';
  const [selectedStep, setSelectedStep] = React.useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#evals') {
        return 5;
      } else if (window.location.hash === '#redteam') {
        return 1;
      } else if (window.location.hash === '#guardrails') {
        return 2;
      } else if (window.location.hash === '#modelsecurity') {
        return 3;
      } else if (window.location.hash === '#mcp') {
        return 4;
      } else if (window.location.hash === '#codescanning') {
        return 6;
      }
    }
    return 1; // Default to Red Teaming
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const steps = [
    {
      id: 1,
      caption: 'Red Teaming',
      mobileCaption: 'Red Team',
      image: '/img/riskreport-1.png',
      image2x: '/img/riskreport-1@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Automated red teaming for agents & RAGs</p>
          <p>Promptfoo simulates real users to uncover application-specific vulnerabilities:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam setup</code>
          </pre>
          <p>Custom attacks generated for your target:</p>
          <ul>
            <li>Direct and indirect prompt injections</li>
            <li>Jailbreaks tailored to your guardrails</li>
            <li>Data and PII leaks</li>
            <li>Business rule violations</li>
            <li>Insecure tool use in agents</li>
            <li>Toxic content generation</li>
            <li>
              And <Link to="/docs/red-team/llm-vulnerability-types/">much more</Link>
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/red-teaming">&raquo; Learn more about Red Teaming</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/red-teaming',
    },
    {
      id: 6,
      caption: 'Code Scanning',
      mobileCaption: 'Code Scan',
      image: '/img/docs/code-scanning/github.png',
      image2x: '/img/docs/code-scanning/github.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Find AI vulnerabilities before they're merged</p>
          <p>
            SAST for AI workflows catches prompt injection, PII exposure, and jailbreak risks in
            your development workflow:
          </p>
          <ul>
            <li>
              <strong>IDE:</strong> Real-time scanning with inline fixes
            </li>
            <li>
              <strong>PR Review:</strong> Automated findings in pull requests
            </li>
            <li>
              <strong>CI/CD:</strong> CLI integration for any pipeline
            </li>
          </ul>
          <p>
            Deep data flow analysis finds LLM-specific risks that general security scanners miss.
          </p>
          <p>
            <strong>
              <Link to="/code-scanning">&raquo; Learn more about Code Scanning</Link>
            </strong>
          </p>
        </>
      ),
      icon: <CodeIcon />,
      destinationUrl: '/code-scanning',
    },
    {
      id: 3,
      caption: 'Model Security',
      mobileCaption: 'Models',
      image: '/img/model-ranking-framed.png',
      image2x: '/img/model-ranking-framed.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Complete lifecycle model security</p>
          <p>Secure models from development through deployment:</p>
          <ul>
            <li>Scan model files for malicious code and backdoors</li>
            <li>Test foundation model behavior against real attacks</li>
            <li>Compare security across models and versions</li>
            <li>Generate compliance reports (OWASP, NIST, EU AI Act)</li>
          </ul>
          <p>
            Works with open-weight models (PyTorch, TensorFlow, ONNX) and proprietary foundation
            models (OpenAI, Anthropic, etc.)
          </p>
          <p>
            <strong>
              <Link to="/model-security">&raquo; Learn more about Model Security</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/model-security',
    },
    {
      id: 5,
      caption: 'Evaluations',
      mobileCaption: 'Evals',
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      imageDark: '/img/claude-vs-gpt-example-dark.png',
      image2xDark: '/img/claude-vs-gpt-example-dark@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Build reliable prompts, RAGs, and agents</p>
          <p>Start testing the performance of your models, prompts, and tools in minutes:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>
            Promptfoo runs locally and integrates directly with your app - no SDKs, cloud
            dependencies, or logins.
          </p>
          <p>
            <strong>
              <Link to="/docs/intro/">&raquo; Get Started with Evaluations</Link>
            </strong>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
    },
    {
      id: 2,
      caption: 'Guardrails',
      mobileCaption: 'Guardrails',
      image: '/img/guardrails-framed.png',
      image2x: '/img/guardrails-framed.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>
            Self-improving guardrails that learn from attacks
          </p>
          <p>
            Unlike static guardrails, our system continuously improves through red team feedback:
          </p>
          <ul>
            <li>Automatically adapts to new attack patterns</li>
            <li>Enforces custom company policies</li>
            <li>Learns from real-world usage and attack attempts</li>
          </ul>
          <p>
            Deploy in minutes on cloud or on-premises with seamless integration into any AI
            workflow.
          </p>
          <p>
            <strong>
              <Link to="/guardrails">&raquo; Learn more about Guardrails</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/guardrails',
    },
    {
      id: 4,
      caption: 'MCP',
      mobileCaption: 'MCP',
      image: '/img/mcp-proxy-dashboard.png',
      image2x: '/img/mcp-proxy-dashboard.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>
            Enterprise MCP proxy for secure AI tool integration
          </p>
          <p>Control and monitor MCP servers in your organization:</p>
          <ul>
            <li>Whitelist approved MCP servers for enterprise use</li>
            <li>Grant access to approved MCP servers to your applications and users</li>
            <li>Real-time monitoring for PII and sensitive data</li>
            <li>Prevent security risks from untrusted MCP servers</li>
          </ul>
          <p>
            Restrict AI access to approved tools and data, with complete oversight of MCP activity.
          </p>
          <p>
            <strong>
              <Link to="/mcp">&raquo; Learn more about MCP Security</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/mcp',
    },
  ];

  const selectedStepData = steps.find((step) => step.id === selectedStep);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = React.useState(false);

  React.useEffect(() => {
    const checkScroll = () => {
      if (tabsRef.current && isMobile) {
        const { scrollWidth, clientWidth } = tabsRef.current;
        setShowScrollIndicator(scrollWidth > clientWidth);
      }
    };
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [isMobile]);

  return (
    <section className={styles.walkthroughSection}>
      <div className="container">
        <div className={styles.walkthroughContainer}>
          <div
            className={clsx(styles.walkthroughTabs, showScrollIndicator && styles.scrollable)}
            ref={tabsRef}
          >
            {steps.map((step) => (
              <button
                key={step.id}
                className={clsx(
                  styles.walkthroughTab,
                  selectedStep === step.id && styles.walkthroughTabActive,
                )}
                onClick={() => setSelectedStep(step.id)}
              >
                {isMobile ? step.mobileCaption : step.caption}
              </button>
            ))}
          </div>
          <div className={styles.walkthroughContent}>
            <div className={styles.walkthroughImageContainer}>
              <Link to={selectedStepData?.destinationUrl || '#'}>
                <img
                  src={
                    isDarkTheme && selectedStepData?.imageDark
                      ? selectedStepData.imageDark
                      : selectedStepData?.image
                  }
                  srcSet={
                    isDarkTheme && selectedStepData?.image2xDark
                      ? `${selectedStepData.imageDark} 1x, ${selectedStepData.image2xDark} 2x`
                      : `${selectedStepData?.image} 1x, ${selectedStepData?.image2x} 2x`
                  }
                  alt={`${selectedStepData?.caption}`}
                  className={styles.walkthroughImage}
                />
              </Link>
            </div>
            <div className={styles.walkthroughDescription}>
              {steps.find((step) => step.id === selectedStep)?.description}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section id="solution" className={styles.solutionSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>THE PROMPTFOO APPROACH</div>
        <h2 className={styles.sectionTitle}>
          AI security testing built into
          <br />
          your development workflow
        </h2>
        <p className={styles.sectionSubtitle}>
          From integration to remediation, Promptfoo meets you wherever you're building.
        </p>

        <div className={styles.solutionGrid}>
          <div className={styles.solutionCard}>
            <div className={styles.solutionNumber}>1</div>
            <h3 className={styles.solutionTitle}>
              <IntegrationInstructionsIcon className={styles.solutionIcon} />
              Connect
            </h3>
            <h4>Integrate Anywhere</h4>
            <p>Connect to your AI apps, agents, and workflows.</p>
            <ul className={styles.solutionList}>
              <li>CI/CD pipelines</li>
              <li>GitHub, GitLab, Jenkins, and more</li>
              <li>MCP and Agent frameworks</li>
              <li>On-premise or cloud</li>
            </ul>
            <Link to="/docs/category/integrations/" className={styles.solutionLink}>
              Learn about integrations →
            </Link>
          </div>

          <div className={styles.solutionCard}>
            <div className={styles.solutionNumber}>2</div>
            <h3 className={styles.solutionTitle}>
              <AutoFixHighIcon className={styles.solutionIcon} />
              Attack
            </h3>
            <h4>Test Everything</h4>
            <p>Create thousands of context-aware attacks tailored to your application.</p>
            <ul className={styles.solutionList}>
              <li>Real-time threat intel from {SITE_CONSTANTS.USER_COUNT_SHORT}+ user community</li>
              <li>Deep automation that scales beyond human-curated tests</li>
              <li>Customize attack flows to your business</li>
            </ul>
            <Link to="/red-teaming/" className={styles.solutionLink}>
              Explore red teaming →
            </Link>
          </div>

          <div className={styles.solutionCard}>
            <div className={styles.solutionNumber}>3</div>
            <h3 className={styles.solutionTitle}>
              <CheckCircleIcon className={styles.solutionIcon} />
              Fix
            </h3>
            <h4>Close the Loop</h4>
            <p>Get remediation guidance directly in pull requests and developer workflows.</p>
            <ul className={styles.solutionList}>
              <li>Security findings in PRs</li>
              <li>Actionable remediation steps</li>
              <li>Track fixes across teams</li>
              <li>Continuous monitoring</li>
            </ul>
            <Link to="/docs/enterprise/remediation-reports/" className={styles.solutionLink}>
              Learn more about remediation →
            </Link>
          </div>
        </div>

        {/*
        <div className={styles.featureHighlight}>
          <h3>💡 What Makes Promptfoo Different</h3>
          <p>
            Unlike runtime-only solutions that only catch issues in production, or manual testing
            that can't scale, Promptfoo embeds security testing into your development process—where
            fixes are 10x faster and cheaper.
          </p>
          <blockquote className={styles.testimonialQuote}>
            "We evaluated three solutions. Only Promptfoo could handle our scale, complexity, and
            integrate with our developer workflows without slowing them down."
            <cite>— Director of Product Security, Fortune 100 Financial Services Company</cite>
          </blockquote>
        </div>
        */}
      </div>
    </section>
  );
}

function AnimatedCounter({ target, suffix = '' }: { target: string; suffix?: string }) {
  const countUpRef = React.useRef(null);
  const [isVisible, setIsVisible] = React.useState(false);

  // Parse the target number (remove commas and convert to number)
  const targetNumber = React.useMemo(() => {
    return parseInt(target.replace(/,/g, ''), 10);
  }, [target]);

  React.useEffect(() => {
    const element = countUpRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      {
        threshold: 0.5,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  return (
    <div ref={countUpRef} className={styles.communityStatNumber}>
      {isVisible ? (
        <CountUp
          end={targetNumber}
          duration={3.5}
          separator=","
          suffix={suffix}
          useEasing={true}
          easingFn={(t, b, c, d) => {
            // easeOutExpo for smoother deceleration
            return t === d ? b + c : c * (-Math.pow(2, (-10 * t) / d) + 1) + b;
          }}
        />
      ) : (
        <>0{suffix}</>
      )}
    </div>
  );
}

function CommunitySection() {
  return (
    <section className={styles.communitySection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>THREAT INTELLIGENCE AT GLOBAL SCALE</div>
        <h2 className={styles.sectionTitle}>
          Built on the world's largest
          <br />
          AI security community
        </h2>
        <p className={styles.sectionSubtitle}>
          Get real-time threat intelligence and innovation you can't find anywhere else.
          <br />
          Our contributors are from companies like OpenAI, Google, Microsoft, and Amazon.
        </p>

        <div className={styles.communityStats}>
          <div className={styles.communityStatCard}>
            <AnimatedCounter target={SITE_CONSTANTS.USER_COUNT_DISPLAY} suffix="+" />
            <div className={styles.communityStatLabel}>Open Source Users</div>
            <p>Developers securing AI applications with Promptfoo</p>
          </div>
          <div className={styles.communityStatCard}>
            <AnimatedCounter target={SITE_CONSTANTS.CONTRIBUTOR_COUNT_DISPLAY} suffix="+" />
            <div className={styles.communityStatLabel}>Contributors</div>
            <p>From major foundation labs and tech companies</p>
          </div>
          <div className={styles.communityStatCard}>
            <AnimatedCounter target={SITE_CONSTANTS.WEEKLY_DOWNLOADS_DISPLAY} suffix="+" />
            <div className={styles.communityStatLabel}>Weekly Downloads</div>
            <p>Active deployments in production workflows worldwide</p>
          </div>
        </div>

        {/*
        <div className={styles.communityGrid}>
          <div className={styles.communityCard}>
            <h3>
              <GroupsIcon /> Open Source Foundation
            </h3>
            <p>
              Promptfoo's open source core is trusted by {SITE_CONSTANTS.USER_COUNT_DISPLAY}+
              developers worldwide—from solo developers to Fortune 100 security teams.
            </p>
            <h4>What This Means For You:</h4>
            <ul>
              <li>
                <strong>No vendor lock-in</strong> - Open source foundation gives you control
              </li>
              <li>
                <strong>Continuous innovation</strong> - New threats detected and addressed in
                real-time
              </li>
              <li>
                <strong>Battle-tested reliability</strong> - Millions of tests run daily across
                thousands of applications
              </li>
              <li>
                <strong>Transparency</strong> - See exactly how security decisions are made
              </li>
            </ul>
            <Link to="https://github.com/promptfoo/promptfoo" className="button button--secondary">
              Try Open Source
            </Link>
          </div>

          <div className={styles.communityCard}>
            <h3>
              <SecurityIcon /> Enterprise-Ready Platform
            </h3>
            <p>
              Trusted by Fortune 100 companies in healthcare, finance, retail, and technology.
            </p>
            <h4>What This Means For You:</h4>
            <ul>
              <li>
                <strong>Air-gapped on-premise deployments</strong> - For regulated industries with
                strict data governance
              </li>
              <li>
                <strong>SSO, RBAC, and team collaboration</strong> - Built-in enterprise identity and
                access management
              </li>
              <li>
                <strong>Framework reporting</strong> - NIST, OWASP, AI Act, ISO 42001 out of the box
              </li>
              <li>
                <strong>Security stack integration</strong> - Works with Datadog, Splunk, Jira, and
                your existing tools
              </li>
              <li>
                <strong>Scale without headcount</strong> - From 10 to 100+ AI applications with the
                same team
              </li>
              <li>
                <strong>Priority support with SLA</strong> - Dedicated security engineering when you
                need it
              </li>
            </ul>
            <Link to="/contact/" className="button button--secondary">
              Schedule Enterprise Demo
            </Link>
          </div>
        </div>
        */}
      </div>
    </section>
  );
}

function AsSeenOnSection() {
  return (
    <section className={styles.asSeenOnSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>Used by the best</div>
        <h2 className={styles.sectionTitle}>Trusted by AI Leaders</h2>
        <p className={styles.sectionSubtitle}>
          See how teams at OpenAI and Anthropic use Promptfoo to build better AI applications.
        </p>
        <div className={styles.asSeenOnGrid}>
          <a
            href="https://vimeo.com/1023317525/be082a1029"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/openai-logo.svg"
                  alt="OpenAI"
                  className={styles.asSeenOnLogoInline}
                />
                Build Hours
              </h3>
              <p>
                "Promptfoo is really powerful because you can iterate on prompts, configure tests in
                YAML, and view everything locally... it's faster and more straightforward"
              </p>
              <span className={styles.watchNow}>Watch the Video →</span>
            </div>
          </a>

          <a
            href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/anthropic-logo.svg"
                  alt="Anthropic"
                  className={styles.asSeenOnLogoInline}
                  style={{ maxWidth: 175 }}
                />
                Courses
              </h3>
              <p>
                "Promptfoo offers a streamlined, out-of-the-box solution that can significantly
                reduce the time and effort required for comprehensive prompt testing."
              </p>
              <span className={styles.watchNow}>See the Course →</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

function PersonaSection() {
  const [activePersona, setActivePersona] = React.useState('director');

  const personas = {
    ciso: {
      title: 'For CISOs & Security Leadership',
      subtitle: 'Strategy & Risk Management',
      description:
        "You're responsible for securing AI across the enterprise while enabling innovation. Promptfoo gives you the platform to scale security without scaling headcount.",
      benefits: [
        {
          title: 'Comprehensive AI security posture',
          description:
            'Red teaming + guardrails + compliance in one platform. Cover prevention, detection, and governance.',
        },
        {
          title: 'Board-ready reporting',
          description:
            'Executive dashboards showing risk across all AI deployments. Compliance status against NIST, OWASP, AI Act frameworks.',
        },
        {
          title: 'Scale without linear cost growth',
          description:
            'Automation enables security to grow with AI adoption. From 10 to 100+ AI applications with the same team.',
        },
        {
          title: 'Accelerate AI deployment timelines',
          description:
            'Security embedded in development = faster, safer launches. Reduce security review cycles from weeks to days.',
        },
      ],
      cta: { text: 'Schedule Demo', link: '/contact/' },
    },
    director: {
      title: 'For Security Directors',
      subtitle: 'Depth & Automation',
      description:
        'You need a solution that actually works at enterprise scale, integrates with your existing tools, and your team will adopt. Promptfoo delivers the depth you need without the complexity.',
      benefits: [
        {
          title: `Proven at global scale - ${SITE_CONSTANTS.FORTUNE_500_COUNT} of the Fortune 500`,
          description:
            'Leading healthcare, telecommunications, retail, and enterprise software companies trust us with their AI security.',
        },
        {
          title: 'Application-focused, not just model testing',
          description:
            'Tests understand your business logic, RAG, agents, integrations. Covers 50+ vulnerability types from injection to jailbreaks.',
        },
        {
          title: 'Deep automation that actually scales',
          description:
            'No manual scenario writing required. Continuous testing in CI/CD. Scales from 1 to 100+ applications.',
        },
        {
          title: 'Real-time threat intelligence',
          description: `Community of ${SITE_CONSTANTS.USER_COUNT_SHORT}+ users provides early warning. New attack vectors deployed automatically.`,
        },
      ],
      cta: { text: 'Schedule Demo', link: '/contact/' },
    },
    developer: {
      title: 'For Developers & AI Engineers',
      subtitle: 'Speed & Enablement',
      description:
        "You're building AI applications and need security testing that fits your workflow—not another blocker. Promptfoo was built by developers, for developers.",
      benefits: [
        {
          title: 'Security feedback in your pull requests',
          description:
            'See vulnerabilities before merging. Actionable remediation guidance in GitHub/GitLab. No context switching.',
        },
        {
          title: 'Visual config + code flexibility',
          description:
            'No-code UI for quick setup. Full Python/Node.js SDK for advanced use cases. YAML configuration for IaC.',
        },
        {
          title: 'Built on open source',
          description: `${SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers in the community. ${SITE_CONSTANTS.CONTRIBUTOR_COUNT}+ contributors from companies like OpenAI, Google, Microsoft, Amazon.`,
        },
        {
          title: 'Fast and unblocking',
          description: 'Run incremental tests locally in seconds.',
        },
      ],
      cta: { text: 'View Documentation', link: '/docs/intro/' },
    },
  };

  const currentPersona = personas[activePersona];

  return (
    <section className={styles.personaSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>SOLUTIONS FOR EVERY TEAM</div>
        <h2 className={styles.sectionTitle}>Security that works for everyone</h2>
        <p className={styles.sectionSubtitle}>
          Whether you're building AI security strategy or writing code, Promptfoo meets you where
          you are.
        </p>

        <div className={styles.personaTabs}>
          <button
            className={clsx(styles.personaTab, activePersona === 'ciso' && styles.personaTabActive)}
            onClick={() => setActivePersona('ciso')}
          >
            <div className={styles.personaTabTitle}>For CISOs</div>
            <div className={styles.personaTabSubtitle}>Strategy & Risk</div>
          </button>
          <button
            className={clsx(
              styles.personaTab,
              activePersona === 'director' && styles.personaTabActive,
            )}
            onClick={() => setActivePersona('director')}
          >
            <div className={styles.personaTabTitle}>For Security Directors</div>
            <div className={styles.personaTabSubtitle}>Depth & Automation</div>
          </button>
          <button
            className={clsx(
              styles.personaTab,
              activePersona === 'developer' && styles.personaTabActive,
            )}
            onClick={() => setActivePersona('developer')}
          >
            <div className={styles.personaTabTitle}>For Developers</div>
            <div className={styles.personaTabSubtitle}>Speed & Enablement</div>
          </button>
        </div>

        <div className={styles.personaContent}>
          <h3>{currentPersona.title}</h3>
          <p className={styles.personaSubtitle}>{currentPersona.subtitle}</p>
          <p className={styles.personaDescription}>{currentPersona.description}</p>

          <h4>What You Get:</h4>
          <div className={styles.benefitsList}>
            {currentPersona.benefits.map(
              (benefit: { title: string; description: string }, idx: number) => (
                <div key={idx} className={styles.benefitItem}>
                  <CheckCircleIcon className={styles.benefitIcon} />
                  <div>
                    <strong>{benefit.title}</strong>
                    <p>{benefit.description}</p>
                  </div>
                </div>
              ),
            )}
          </div>

          <Link to={currentPersona.cta.link} className="button button--primary button--lg">
            {currentPersona.cta.text}
          </Link>
        </div>
      </div>
    </section>
  );
}

/*
function FAQSection() {
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);

  const faqs = [
    {
      question: 'How is Promptfoo different from runtime security tools?',
      answer:
        "Promptfoo shifts left to catch vulnerabilities in development, not after deployment. We integrate with CI/CD to provide security feedback in pull requests. Runtime tools only protect production—by then, fixes are 10x more expensive and time-consuming. We also offer runtime guardrails, but they're informed by red team testing—creating a feedback loop that makes protection smarter.",
    },
    {
      question: "What's the difference between open source and enterprise?",
      answer:
        'Open Source includes full red teaming capabilities, self-hosted local testing, community support, but is limited to 10,000 probes/month. Enterprise adds unlimited testing, cloud or on-premise deployment, team collaboration with SSO and RBAC, remediation tracking & validation, runtime guardrails integration, priority support with SLA, and compliance reporting.',
    },
    {
      question: 'How long does implementation take?',
      answer:
        'Initial setup takes 30 minutes to 2 hours. Your first application can be tested the same day. CI/CD integration typically takes 1-2 days, and team-wide rollout is usually 2-4 weeks. Most customers run their first meaningful test within 24 hours.',
    },
    {
      question: 'Do you support on-premise deployment?',
      answer:
        'Yes. We support fully air-gapped on-premise deployments for organizations with strict data governance requirements (healthcare, financial services, government). Your data never leaves your infrastructure.',
    },
    {
      question: "What if we're already using another AI security tool?",
      answer:
        'Great! Many customers use Promptfoo alongside existing tools. We integrate with your security stack (Datadog, Splunk, Jira, etc.) and often find vulnerabilities other tools miss. Many customers run head-to-head evaluations and choose Promptfoo for our depth, automation, and application-focused approach.',
    },
    {
      question: 'How do you stay current with new threats?',
      answer: `Our open source community of ${SITE_CONSTANTS.USER_COUNT_DISPLAY}+ users provides real-time threat intelligence. When new attack vectors emerge, they're rapidly integrated into the platform. Contributors from companies like OpenAI, Anthropic, Google, Microsoft, and Amazon help us stay ahead.`,
    },
  ];

  return (
    <section className={styles.faqSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
        <div className={styles.faqList}>
          {faqs.map((faq, idx) => (
            <div key={idx} className={styles.faqItem}>
              <button
                className={styles.faqQuestion}
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              >
                <span>{faq.question}</span>
                <span className={styles.faqToggle}>{openFaq === idx ? '−' : '+'}</span>
              </button>
              {openFaq === idx && <div className={styles.faqAnswer}>{faq.answer}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
*/

function FinalCTA() {
  return (
    <section className={styles.finalCTA}>
      <div className="container">
        <h2 className={styles.finalCTATitle}>Ship Secure, Stay Secure</h2>
        <p className={styles.finalCTASubtitle}>
          Join hundreds of enterprises and thousands of developers securing AI applications from day
          one.
        </p>
        <div className={styles.finalCTAButtons}>
          <Link className="button button--primary button--lg" to="/contact/">
            Request Demo
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/docs/intro/"
          >
            Try Open Source
          </Link>
        </div>
        <div className={styles.finalCTATrust}>
          <p>
            ✓ {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers • ✓ Enterprise trusted • ✓ Zero vendor
            lock-in
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="Build Secure AI Applications"
      description={`The AI Security Platform that catches vulnerabilities in development. Trusted by ${SITE_CONSTANTS.FORTUNE_500_COUNT} of the Fortune 500 and ${SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers worldwide.`}
      wrapperClassName="homepage-wrapper"
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/homepage.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <HomepageHeader />
      <TrustBar />
      <BridgeSection />
      <HomepageWalkthrough />
      <main>
        <SolutionSection />
        <CommunitySection />
        <AsSeenOnSection />
        <PersonaSection />
        {/*}
        <FAQSection />
        */}
        <FinalCTA />
        {/*<NewsletterForm />*/}
      </main>
    </Layout>
  );
}
