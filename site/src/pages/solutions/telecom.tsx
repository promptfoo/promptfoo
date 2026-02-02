import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import CellTowerIcon from '@mui/icons-material/CellTower';
import GavelIcon from '@mui/icons-material/Gavel';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import LockIcon from '@mui/icons-material/Lock';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SecurityIcon from '@mui/icons-material/Security';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SpeedIcon from '@mui/icons-material/Speed';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from '../landing-page.module.css';

function RiskCard({ name, description }: { name: string; description: string }) {
  return (
    <div className={styles.vulnCard}>
      <h4 className={styles.vulnName}>{name}</h4>
      <p className={styles.vulnDescription}>{description}</p>
    </div>
  );
}

function ComplianceCard({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: { name: string; description: string }[];
}) {
  return (
    <div className={styles.solutionCard}>
      <div className={styles.solutionTitle}>
        <span className={styles.solutionIcon}>{icon}</span>
        {title}
      </div>
      <div className={styles.regulationBadges}>
        {items.map((item) => (
          <div key={item.name} className={styles.regulationBadge}>
            <span className={styles.badgeName}>{item.name}</span>
            <span className={styles.badgeDesc}>{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Telecom() {
  return (
    <Layout
      title="AI Security for Telecommunications"
      description="Red team voice and text AI agents for CPNI protection, SIM swap prevention, and FCC compliance. Audio-to-audio model testing for IVR systems and voice assistants at carrier scale."
    >
      <Head>
        <meta property="og:title" content="AI Security for Telecommunications | Promptfoo" />
        <meta
          property="og:description"
          content="Test voice and text AI agents at carrier scale. Audio-to-audio model support for IVR, voice assistants, and customer service AI."
        />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Telecommunications</p>
            <h1 className={styles.heroTitle}>
              Red team your AI agents, voice and text, at carrier scale
            </h1>
            <p className={styles.heroSubtitle}>
              Purpose-built security testing for IVR systems, voice assistants, and customer service
              AI with audio-to-audio model support
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/telecom/"
              >
                View 12 Telecom Plugins
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Trust Signal */}
        <section className={styles.section} style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
          <div className="container">
            <p
              style={{
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--ifm-color-emphasis-600)',
                margin: 0,
              }}
            >
              Trusted by tier-1 telecommunications providers worldwide
            </p>
          </div>
        </section>

        {/* Risk Categories */}
        <section className={styles.vulnerabilitySection}>
          <div className="container">
            <p className={styles.vulnEyebrow}>AI Agent Attack Scenarios</p>
            <h2 className={styles.vulnTitle}>Test how attackers exploit your AI</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built attack scenarios for the ways AI agents can be manipulated in customer
              service, account management, and self-service channels
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Account Takeover"
                description="AI agent processes SIM swaps or account changes without adequate identity verification, enabling fraud and 2FA bypass"
              />
              <RiskCard
                name="CPNI Disclosure"
                description="AI agent reveals call history, billing details, or service information without proper customer authentication"
              />
              <RiskCard
                name="Social Engineering"
                description="AI agent falls for pretexting attacks, helping attackers impersonate customers or bypass security controls"
              />
              <RiskCard
                name="Fraud Enablement"
                description="AI agent provides guidance on caller ID spoofing, subscription fraud, or service arbitrage schemes"
              />
              <RiskCard
                name="Location Data Exposure"
                description="AI agent discloses cell tower data, GPS coordinates, or movement patterns without proper authorization"
              />
              <RiskCard
                name="Unauthorized Changes"
                description="AI agent processes carrier switches, service additions, or billing changes without explicit consent"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/telecom/">
                View All 12 Attack Scenarios
              </Link>
            </div>
          </div>
        </section>

        {/* Voice AI Section - THE DIFFERENTIATOR */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Voice AI Testing</p>
            <h2 className={styles.sectionTitle}>Test voice AI with the same rigor as text</h2>
            <p className={styles.sectionSubtitle}>
              Most AI security tools only work with text. But telecom AI is voice-first. Promptfoo's
              audio-to-audio testing lets you red team voice models directly.
            </p>

            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>Audio-to-audio model testing</h3>
                <p>
                  Test voice AI models with actual audio input and evaluate audio output. No
                  transcription proxy required. Catch vulnerabilities that text-only tools miss,
                  including voice-specific attack vectors and audio hallucinations.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Direct voice input → voice output testing</li>
                  <li>IVR red teaming for CPNI and social engineering</li>
                  <li>Voice assistant security validation</li>
                  <li>Real-time transcription + response pipeline testing</li>
                  <li>Voice biometric bypass detection</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/solutions/telecom.png"
                  alt="Voice AI testing interface showing audio-to-audio model evaluation"
                  loading="lazy"
                  style={{ boxShadow: 'none', borderRadius: 0 }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Applications - Expanded for Voice */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Applications</p>
            <h2 className={styles.sectionTitle}>Every AI touchpoint, voice and text</h2>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <PhoneInTalkIcon className={styles.solutionIcon} />
                  IVR Systems
                </div>
                <p>
                  Test automated phone trees for CPNI disclosure, authentication bypass, and social
                  engineering vulnerabilities.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <RecordVoiceOverIcon className={styles.solutionIcon} />
                  Voice Assistants
                </div>
                <p>
                  Red team voice AI for account takeover, unauthorized changes, and fraud enablement
                  scenarios.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <HeadsetMicIcon className={styles.solutionIcon} />
                  Agent Assist
                </div>
                <p>
                  Validate real-time AI recommendations don&apos;t expose customer data or provide
                  incorrect guidance to human agents.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <SupportAgentIcon className={styles.solutionIcon} />
                  Customer Service Chatbots
                </div>
                <p>
                  Test text-based AI for the same attack scenarios: account security, CPNI
                  protection, and compliance.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <SmartToyIcon className={styles.solutionIcon} />
                  Self-Service Portals
                </div>
                <p>
                  Validate AI-powered account management, billing inquiries, and service changes
                  across web and mobile.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <CellTowerIcon className={styles.solutionIcon} />
                  Network Operations
                </div>
                <p>
                  Test coverage tools, service activation assistants, and troubleshooting bots for
                  accuracy and security.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Account Security Showcase */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <div className={clsx(styles.showcaseRow, styles.showcaseRowReverse)}>
              <div className={styles.showcaseText}>
                <h3>Stop account takeover at the AI layer</h3>
                <p>
                  SIM swap fraud costs consumers billions annually and enables downstream attacks
                  across banking, crypto, and every service using phone-based 2FA. Our testing
                  ensures your AI agents don&apos;t become the attack vector.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>SIM swap request verification testing</li>
                  <li>Authentication bypass detection</li>
                  <li>Social engineering resistance</li>
                  <li>Port-out authorization checks</li>
                  <li>Account recovery exploitation prevention</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-1.png"
                  srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
                  alt="Risk report showing account takeover vulnerability findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Regulatory Alignment */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the audits you face</h2>
            <p className={styles.sectionSubtitle}>
              Every attack scenario maps to specific regulatory requirements. Generate audit-ready
              reports that speak your compliance team&apos;s language.
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<LockIcon />}
                title="FCC/CPNI Compliance"
                items={[
                  {
                    name: '47 U.S.C. Section 222',
                    description: 'CPNI protection, call records, billing data, network usage',
                  },
                  {
                    name: 'CALEA',
                    description:
                      'Law enforcement request handling, proper legal process verification',
                  },
                  {
                    name: 'LNP Rules',
                    description: 'Number portability accuracy, port-out protection, PIN security',
                  },
                  {
                    name: 'Truth-in-Billing',
                    description: 'Accurate pricing, fee disclosure, coverage claims',
                  },
                ]}
              />
              <ComplianceCard
                icon={<GavelIcon />}
                title="Consumer Protection"
                items={[
                  {
                    name: 'TCPA',
                    description: 'Prior consent, Do Not Call compliance, robocall restrictions',
                  },
                  {
                    name: 'Section 258',
                    description: 'Anti-slamming, anti-cramming, unauthorized change prevention',
                  },
                  {
                    name: 'Section 255/CVAA',
                    description: 'Accessibility, TTY/TRS services, hearing aid compatibility',
                  },
                  {
                    name: "E911/Kari's Law",
                    description: 'Emergency services accuracy, location requirements',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>RAY BAUM&apos;s Act</span>
                <span className={styles.alsoSupportsBadge}>State PUC Regulations</span>
                <span className={styles.alsoSupportsBadge}>FTC Act</span>
                <span className={styles.alsoSupportsBadge}>ADA</span>
              </div>
            </div>
          </div>
        </section>

        {/* Enterprise Benefits */}
        <section className={styles.benefitsSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Built for carrier scale</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <SpeedIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Test at the scale you operate</h3>
                  <p>
                    Run thousands of attack scenarios in parallel. Integrate with CI/CD pipelines
                    for continuous security validation across every model update and prompt change.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <SecurityIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Your data never leaves</h3>
                  <p>
                    Deploy entirely on-premises. No customer data, voice or text, sent to external
                    systems. Meet the strictest CPNI requirements and data residency policies.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <VerifiedUserIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready from day one</h3>
                  <p>
                    Generate structured reports mapping directly to FCC, TCPA, and state PUC
                    requirements. Prove due diligence with reproducible, timestamped test results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Proof Banner */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.proofBanner}>
              <div className={styles.proofBannerContainer}>
                <GraphicEqIcon className={styles.proofBannerIcon} />
                <div className={styles.proofBannerContent}>
                  <h4 className={styles.proofBannerTitle}>
                    The only AI security platform with telecom-specific voice testing
                  </h4>
                  <p className={styles.proofBannerText}>
                    12 purpose-built plugins covering CPNI, account security, E911, TCPA, and more,
                    with full audio-to-audio model support for voice AI.
                  </p>
                </div>
                <Link className="button button--primary" to="/contact/">
                  Talk to an Expert
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure every AI touchpoint</h2>
            <p className={styles.finalCTASubtitle}>
              From IVR to chatbot, voice assistant to self-service portal. Test your AI agents
              before attackers do.
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/telecom/"
              >
                Explore Telecom Plugins
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
