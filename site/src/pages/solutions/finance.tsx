import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import GavelIcon from '@mui/icons-material/Gavel';
import InsightsIcon from '@mui/icons-material/Insights';
import LockIcon from '@mui/icons-material/Lock';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ShieldIcon from '@mui/icons-material/Shield';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
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

export default function Finance() {
  const canonicalUrl = useBaseUrl('/solutions/finance/', { absolute: true });
  const ogImageUrl = useBaseUrl('/img/og/solutions-finance-og.png', { absolute: true });

  return (
    <Layout
      title="AI Security for Financial Services"
      description="Red team AI systems for FINRA, SEC, and SR 11-7 compliance. Test for MNPI disclosure, market manipulation, and financial misconduct."
    >
      <Head>
        <meta property="og:title" content="AI Security for Financial Services | Promptfoo" />
        <meta
          property="og:description"
          content="Red team AI for FINRA, SEC, and model risk management compliance."
        />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AI Security for Financial Services | Promptfoo" />
        <meta
          name="twitter:description"
          content="Red team AI for FINRA, SEC, and model risk management compliance."
        />
        <meta name="twitter:image" content={ogImageUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Financial Services</p>
            <h1 className={styles.heroTitle}>Find the MNPI leak before regulators do</h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming aligned with FINRA, SEC, and model risk management requirements
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/financial/"
              >
                Technical Documentation
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Risk Categories */}
        <section className={styles.vulnerabilitySection}>
          <div className="container">
            <p className={styles.vulnEyebrow}>Risk Coverage</p>
            <h2 className={styles.vulnTitle}>Financial services-specific testing</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for the unique risks facing AI in capital markets, wealth
              management, and banking
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Market Manipulation"
                description="Insider trading facilitation, front-running signals, spoofing guidance, pump-and-dump schemes"
              />
              <RiskCard
                name="Confidential Disclosure"
                description="MNPI leakage, proprietary trading strategies, M&A deal information, client portfolio data"
              />
              <RiskCard
                name="Regulatory Violations"
                description="Securities law circumvention, Reg BI suitability failures, anti-money laundering gaps"
              />
              <RiskCard
                name="Unsuitable Advice"
                description="Unauthorized recommendations, missing risk disclosures, fiduciary duty breaches"
              />
              <RiskCard
                name="Data Leakage"
                description="Customer account exposure, trading algorithm disclosure, position information"
              />
              <RiskCard
                name="Financial Hallucination"
                description="Fabricated market data, fictional instruments, invented corporate events"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/financial/">
                View Full Test Coverage
              </Link>
            </div>
          </div>
        </section>

        {/* Regulatory Alignment */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the exams you face</h2>
            <p className={styles.sectionSubtitle}>
              Purpose-built scenarios for financial services&apos; most demanding compliance
              requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<AccountBalanceIcon />}
                title="FINRA Requirements"
                items={[
                  {
                    name: 'Rule 3110',
                    description: 'Unsupervised recommendations, compliance gap exploitation',
                  },
                  {
                    name: 'Notice 24-09',
                    description: 'AI disclosure gaps, model explanation failures',
                  },
                  {
                    name: 'Rule 2210',
                    description: 'Misleading claims, missing disclosures, unbalanced presentation',
                  },
                  {
                    name: 'Rule 3120',
                    description: 'Control system bypass, exception handling gaps',
                  },
                ]}
              />
              <ComplianceCard
                icon={<GavelIcon />}
                title="SEC Regulations"
                items={[
                  {
                    name: 'Regulation BI',
                    description: 'Suitability failures, undisclosed conflicts, self-dealing',
                  },
                  {
                    name: 'Regulation S-P',
                    description: 'Customer data exposure, privacy control bypass',
                  },
                  {
                    name: 'Regulation S-ID',
                    description: 'Identity verification bypass, impersonation attacks',
                  },
                  {
                    name: 'Advisers Act',
                    description: 'Fiduciary breaches, undisclosed material conflicts',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>SR 11-7</span>
                <span className={styles.alsoSupportsBadge}>OCC MRM Handbook</span>
                <span className={styles.alsoSupportsBadge}>Interagency AI Guidance</span>
                <span className={styles.alsoSupportsBadge}>EU AI Act</span>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Applications</p>
            <h2 className={styles.sectionTitle}>Tested across the enterprise</h2>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <TrendingUpIcon className={styles.solutionIcon} />
                  Wealth & Advisory
                </div>
                <p>
                  Robo-advisors, investment assistants, portfolio analysis tools, and financial
                  planning copilots.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <InsightsIcon className={styles.solutionIcon} />
                  Capital Markets
                </div>
                <p>
                  Trading support, research synthesis, market analysis, and deal execution
                  assistance.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <AccountBalanceIcon className={styles.solutionIcon} />
                  Banking Services
                </div>
                <p>
                  Customer service bots, loan processing assistants, credit analysis, and account
                  management tools.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SR 11-7 Section */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>SR 11-7 validation support</h3>
                <p>
                  Model risk management requirements demand documented adversarial testing with
                  systematic vulnerability identification. Promptfoo provides the structured test
                  methodology, severity-rated findings, and reproducible documentation that
                  examiners expect.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Documented adversarial test methodology</li>
                  <li>Systematic vulnerability identification</li>
                  <li>Model boundary and limitation testing</li>
                  <li>Continuous monitoring via CI/CD integration</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/solutions/finance.png"
                  alt="Risk report showing severity-rated findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Proof Banner */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.proofBanner}>
              <div className={styles.proofBannerContainer}>
                <ShieldIcon className={styles.proofBannerIcon} />
                <div className={styles.proofBannerContent}>
                  <h4 className={styles.proofBannerTitle}>
                    Purpose-built for regulated industries
                  </h4>
                  <p className={styles.proofBannerText}>
                    Financial services plugins developed in partnership with compliance and risk
                    teams at leading institutions.
                  </p>
                </div>
                <Link className="button button--primary" to="/contact/">
                  Talk to an Expert
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className={styles.benefitsSection}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Why financial institutions choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Self-hosted deployment</h3>
                  <p>
                    Run entirely within your infrastructure. No data leaves your environment,
                    meeting the strictest data residency and security requirements.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <MonitorHeartIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Continuous monitoring</h3>
                  <p>
                    Integrate with CI/CD pipelines to catch regressions before deployment. Track
                    security posture across model updates and prompt changes.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <VerifiedUserIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready documentation</h3>
                  <p>
                    Generate structured reports that map directly to regulatory requirements.
                    Demonstrate due diligence with reproducible test results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure your financial AI</h2>
            <p className={styles.finalCTASubtitle}>
              Find regulatory vulnerabilities before examiners do
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/financial/"
              >
                Read the Docs
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
