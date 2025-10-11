import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import GroupsIcon from '@mui/icons-material/Groups';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BoltIcon from '@mui/icons-material/Bolt';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import NewsletterForm from '../components/NewsletterForm';
import { SITE_CONSTANTS } from '../constants';
import styles from './index.module.css';

function HomepageHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            AI SECURITY PLATFORM • TRUSTED BY FORTUNE 100 COMPANIES
          </div>
          <h1 className={styles.heroTitle}>
            Catch AI vulnerabilities
            <br />
            in development, not production
          </h1>
          <p className={styles.heroSubtitle}>
            Security for apps & agents trusted by 200,000+ users
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/contact/">
              Book a Demo
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/docs/intro/"
            >
              Explore Open Source
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function TrustBar() {
  const marqueeItems = [
    'Top 5 global retailer',
    'Tier-1 telecom',
    'Top 3 global strategy consultancy',
    'Large public legal firm',
    'Top 5 U.S. healthcare company',
    'Nationwide 5G network operator',
    'Top European insurer',
    'Global ERP leader',
    'Top 5 travel site',
  ];

  return (
    <section className={styles.trustBar}>
      <div className="container">
        <h3 className={styles.trustBarTitle}>SECURING AI FOR LEADING ENTERPRISES</h3>
        <div
          className={styles.marquee}
          role="region"
          aria-label="Trusted by leading enterprises across industries"
        >
          <div className={styles.marqueeTrack}>
            {[...marqueeItems, ...marqueeItems].map((item, idx) => (
              <span key={idx} className={styles.marqueeItem}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <p className={styles.trustBarSubtext}>
          + Major financial institutions, technology companies, and{' '}
          {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers worldwide
        </p>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    {
      number: `${SITE_CONSTANTS.USER_COUNT_DISPLAY}+`,
      label: 'Active Users',
      sublabel: 'From OpenAI, Google, Microsoft, Amazon',
    },
    {
      number: 'OWASP + NIST + MITRE',
      label: 'Compliance Frameworks',
      sublabel: 'Built on industry standards',
    },
    { number: '2-3x', label: 'Annual AI Growth', sublabel: 'Your attack surface is exploding' },
  ];

  return (
    <section className={styles.statsBar}>
      <div className="container">
        <div className={styles.statsGrid}>
          {stats.map((stat, idx) => (
            <div key={idx} className={styles.statItem}>
              <div className={styles.statNumber}>{stat.number}</div>
              <div className={styles.statLabel}>{stat.label}</div>
              <div className={styles.statSublabel}>{stat.sublabel}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const challenges = [
    {
      icon: <BoltIcon />,
      title: 'Explosive Growth',
      description: 'GenAI deployments growing 2-3x per year in enterprise organizations',
    },
    {
      icon: <IntegrationInstructionsIcon />,
      title: 'Complex Architectures',
      description: 'Agents, RAG, and tool integrations create exponential new attack vectors',
    },
    {
      icon: <SpeedIcon />,
      title: "Manual Testing Can't Scale",
      description: 'Testing 50,000+ scenarios manually takes weeks per application',
    },
    {
      icon: <SecurityIcon />,
      title: 'Traditional Tools Miss AI',
      description:
        "Network security and static scans don't catch prompt injection, jailbreaks, or data leaks",
    },
  ];

  return (
    <section className={styles.problemSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>THE AI SECURITY CRISIS</div>
        <h2 className={styles.sectionTitle}>
          Your AI Attack Surface Is Growing Faster
          <br />
          Than Your Security Team Can Keep Up
        </h2>
        <p className={styles.sectionSubtitle}>
          Enterprise AI adoption isn't slowing down—it's accelerating. Security and product teams
          are racing to deploy GenAI applications while organizations project 2-3x growth in AI
          deployments annually.
        </p>
        <p className={styles.sectionSubtitle}>
          But traditional security approaches weren't built for AI. And manual pen testing can't
          scale at the speed of development.
        </p>

        <div className={styles.challengesGrid}>
          {challenges.map((challenge, idx) => (
            <div key={idx} className={styles.challengeCard}>
              <div className={styles.challengeIcon}>{challenge.icon}</div>
              <h3 className={styles.challengeTitle}>{challenge.title}</h3>
              <p className={styles.challengeDescription}>{challenge.description}</p>
            </div>
          ))}
        </div>

        <div className={styles.pullQuote}>
          <p>
            "Security teams at Fortune 100 companies tell us the same thing: AI is moving too fast
            for traditional security processes. They need automation that understands their
            applications, not just models."
          </p>
          <cite>— Promptfoo Customer Research, 2025</cite>
        </div>

        <div className={styles.transitionText}>
          <p>
            There's a better way. Security doesn't have to slow down innovation—when it's built into
            development from the start.
          </p>
          <Link to="#solution" className={styles.transitionLink}>
            See How It Works →
          </Link>
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
          Shift Left: Security That Moves at the
          <br />
          Speed of Development
        </h2>
        <p className={styles.sectionSubtitle}>
          Promptfoo integrates directly into your development workflow to catch AI vulnerabilities
          before they reach production—not after. Automated, application-specific, and built for
          developers.
        </p>

        <div className={styles.solutionGrid}>
          <div className={styles.solutionCard}>
            <div className={styles.solutionNumber}>1</div>
            <h3 className={styles.solutionTitle}>
              <IntegrationInstructionsIcon className={styles.solutionIcon} />
              Connect
            </h3>
            <h4>Integrate Anywhere</h4>
            <p>Connect to your AI apps, LLMs, and workflows in minutes—not months.</p>
            <ul className={styles.solutionList}>
              <li>CI/CD pipelines</li>
              <li>GitHub, GitLab, Jenkins</li>
              <li>Any LLM or model provider</li>
              <li>On-premise or cloud</li>
              <li>Agent frameworks (LangChain, AutoGPT, custom)</li>
            </ul>
            <Link to="/docs/intro/" className={styles.solutionLink}>
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
            <p>Comprehensive adversarial testing tailored to your application's specific risks.</p>
            <ul className={styles.solutionList}>
              <li>Application-focused testing (not just model-level)</li>
              <li>50+ vulnerability types across 6 risk categories</li>
              <li>Real-time threat intel from 200K+ user community</li>
              <li>Compliance frameworks (NIST, OWASP, MITRE, AI Act)</li>
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
            <h4>Fix Fast</h4>
            <p>Get remediation guidance directly in pull requests and developer workflows.</p>
            <ul className={styles.solutionList}>
              <li>Security findings in PRs</li>
              <li>Actionable remediation steps</li>
              <li>Track fixes across teams</li>
              <li>Continuous monitoring</li>
              <li>Validate remediations work</li>
            </ul>
            <Link to="/docs/intro/" className={styles.solutionLink}>
              See developer experience →
            </Link>
          </div>
        </div>

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
      </div>
    </section>
  );
}

function CommunitySection() {
  return (
    <section className={styles.communitySection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>TRUSTED BY INNOVATORS, PROVEN AT SCALE</div>
        <h2 className={styles.sectionTitle}>
          Built on the World's Largest
          <br />
          AI Security Community
        </h2>
        <p className={styles.sectionSubtitle}>
          When the teams building AI at OpenAI, Google, Microsoft, and Amazon contribute to
          Promptfoo, you get real-time threat intelligence and innovation you can't find anywhere
          else.
        </p>

        <div className={styles.communityStats}>
          <div className={styles.communityStatCard}>
            <div className={styles.communityStatNumber}>{SITE_CONSTANTS.USER_COUNT_DISPLAY}+</div>
            <div className={styles.communityStatLabel}>Open Source Users</div>
            <p>Developers securing AI applications with Promptfoo</p>
          </div>
          <div className={styles.communityStatCard}>
            <div className={styles.communityStatNumber}>200+</div>
            <div className={styles.communityStatLabel}>Contributors</div>
            <p>From major foundation labs and tech companies</p>
          </div>
          <div className={styles.communityStatCard}>
            <div className={styles.communityStatNumber}>68,000+</div>
            <div className={styles.communityStatLabel}>Weekly Downloads</div>
            <p>Active deployments in production workflows worldwide</p>
          </div>
        </div>

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
              Explore Open Source
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
                <strong>Compliance reporting</strong> - NIST, OWASP, AI Act, ISO 42001 out of the box
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
      cta: { text: 'Download AI Security Strategy Guide', link: '/contact/' },
    },
    director: {
      title: 'For Security Directors',
      subtitle: 'Depth & Automation',
      description:
        'You need a solution that actually works at enterprise scale, integrates with your existing tools, and your team will adopt. Promptfoo delivers the depth you need without the complexity.',
      benefits: [
        {
          title: 'Proven in Fortune 100 environments',
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
          description:
            'Community of 200K+ users provides early warning. New attack vectors deployed automatically.',
        },
      ],
      cta: { text: 'Schedule Technical Deep Dive', link: '/contact/' },
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
          description:
            '200,000+ developers in the community. 200+ contributors from OpenAI, Google, Microsoft, Amazon.',
        },
        {
          title: 'Fast and unblocking',
          description:
            'Run tests locally in seconds. Parallel execution for fast CI/CD. Incremental testing (only changed prompts).',
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
        <h2 className={styles.sectionTitle}>
          Security That Works for Everyone—
          <br />
          From CISOs to Developers
        </h2>
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
            {currentPersona.benefits.map((benefit, idx) => (
              <div key={idx} className={styles.benefitItem}>
                <CheckCircleIcon className={styles.benefitIcon} />
                <div>
                  <strong>{benefit.title}</strong>
                  <p>{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>

          <Link to={currentPersona.cta.link} className="button button--primary button--lg">
            {currentPersona.cta.text}
          </Link>
        </div>
      </div>
    </section>
  );
}

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
      answer:
        "Our open source community of 200,000+ users provides real-time threat intelligence. When new attack vectors emerge, they're rapidly integrated into the platform. Contributors from OpenAI, Anthropic, Google, Microsoft, and Amazon help us stay ahead.",
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

function FinalCTA() {
  return (
    <section className={styles.finalCTA}>
      <div className="container">
        <h2 className={styles.finalCTATitle}>Stop Scrambling. Start Securing.</h2>
        <p className={styles.finalCTASubtitle}>
          Join Fortune 100 companies and {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers building
          secure AI applications from day one.
        </p>
        <div className={styles.finalCTAButtons}>
          <Link className="button button--primary button--lg" to="/contact/">
            Request Enterprise Demo
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
            ✓ {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ active users • ✓ Fortune 100 trusted • ✓ Zero
            vendor lock-in (open source foundation)
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Build Secure AI Applications"
      description={`The AI Security Platform that catches vulnerabilities in development. Trusted by Fortune 100 companies and ${SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers worldwide.`}
      wrapperClassName="homepage-wrapper"
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/homepage.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <HomepageHeader />
      <TrustBar />
      <StatsBar />
      <main>
        <ProblemSection />
        <SolutionSection />
        <CommunitySection />
        <PersonaSection />
        <FAQSection />
        <FinalCTA />
        <NewsletterForm />
      </main>
    </Layout>
  );
}
