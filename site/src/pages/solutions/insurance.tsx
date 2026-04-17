import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import LockIcon from '@mui/icons-material/Lock';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ShieldIcon from '@mui/icons-material/Shield';
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

export default function Insurance() {
  const canonicalUrl = useBaseUrl('/solutions/insurance/', { absolute: true });
  const ogImageUrl = useBaseUrl('/img/og/solutions-insurance-og.png', { absolute: true });

  return (
    <Layout
      title="AI Security for Insurance"
      description="Red team AI systems for HIPAA compliance, PHI protection, network accuracy, and coverage discrimination. Built for health insurers and payers."
    >
      <Head>
        <meta property="og:title" content="AI Security for Insurance | Promptfoo" />
        <meta
          property="og:description"
          content="Red team AI for HIPAA compliance, PHI protection, and coverage discrimination testing."
        />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AI Security for Insurance | Promptfoo" />
        <meta
          name="twitter:description"
          content="Red team AI for HIPAA compliance, PHI protection, and coverage discrimination testing."
        />
        <meta name="twitter:image" content={ogImageUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Insurance</p>
            <h1 className={styles.heroTitle}>Find the PHI leak before it becomes a lawsuit</h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming for health insurers, payers, and benefits administrators
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/insurance/"
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
            <h2 className={styles.vulnTitle}>Insurance-specific compliance testing</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for the unique risks facing AI in health insurance,
              claims processing, and member services
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="PHI Disclosure"
                description="Cross-member data leakage, social engineering attacks, unauthorized third-party disclosure"
              />
              <RiskCard
                name="Coverage Discrimination"
                description="ADA violations, Section 1557 non-compliance, GINA genetic information misuse"
              />
              <RiskCard
                name="Network Misinformation"
                description="Wrong network status, ghost networks, terminated contracts, surprise bill exposure"
              />
              <RiskCard
                name="Mental Health Parity"
                description="MHPAEA violations in coverage determinations, treatment limitations, prior auth requirements"
              />
              <RiskCard
                name="Improper Denials"
                description="Automated claim denials without proper medical review, appeal rights violations"
              />
              <RiskCard
                name="Benefits Misinformation"
                description="Incorrect coverage explanations, wrong cost-sharing details, misleading network status"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/insurance/">
                View Full Test Coverage
              </Link>
            </div>
          </div>
        </section>

        {/* Regulatory Alignment */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the audits you face</h2>
            <p className={styles.sectionSubtitle}>
              Purpose-built scenarios for health insurance&apos;s most demanding compliance
              requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<LockIcon />}
                title="HIPAA Requirements"
                items={[
                  {
                    name: 'Privacy Rule',
                    description:
                      'Cross-member data leakage, social engineering, disclosure controls',
                  },
                  {
                    name: 'Security Rule',
                    description: 'Auth bypass, session hijacking, access control failures',
                  },
                  {
                    name: 'Breach Notification',
                    description: 'Detect exposures before they require member notification',
                  },
                  {
                    name: 'Business Associates',
                    description: 'Inappropriate vendor disclosure, third-party leakage',
                  },
                ]}
              />
              <ComplianceCard
                icon={<AccessibilityNewIcon />}
                title="Civil Rights Compliance"
                items={[
                  {
                    name: 'ADA',
                    description: 'Disability-based coverage discrimination, accessibility gaps',
                  },
                  {
                    name: 'Section 1557',
                    description: 'Protected class bias in coverage decisions',
                  },
                  {
                    name: 'GINA',
                    description: 'Genetic information in coverage decisions, prohibited inquiries',
                  },
                  {
                    name: 'MHPAEA',
                    description: 'Mental health coverage disparity, treatment limitations',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>No Surprises Act</span>
                <span className={styles.alsoSupportsBadge}>Network Adequacy</span>
                <span className={styles.alsoSupportsBadge}>CMS Requirements</span>
                <span className={styles.alsoSupportsBadge}>State Insurance Laws</span>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Applications</p>
            <h2 className={styles.sectionTitle}>Tested across the insurance enterprise</h2>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <SupportAgentIcon className={styles.solutionIcon} />
                  Member Services
                </div>
                <p>
                  Benefits inquiry chatbots, eligibility verification, claims status assistants, and
                  member portal support.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <AssignmentIcon className={styles.solutionIcon} />
                  Coverage Decisions
                </div>
                <p>
                  Prior authorization tools, claims adjudication, medical necessity review, and
                  appeals processing.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <LocalHospitalIcon className={styles.solutionIcon} />
                  Provider Network
                </div>
                <p>
                  Network search tools, provider status verification, cost estimators, and directory
                  accuracy.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PHI Protection Section */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>Comprehensive PHI protection testing</h3>
                <p>
                  Insurance AI systems handle sensitive member data across millions of interactions.
                  Our specialized testing identifies PHI exposure risks before they become HIPAA
                  violations.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Cross-member PHI leakage detection</li>
                  <li>Social engineering vulnerability testing</li>
                  <li>Provider impersonation attack scenarios</li>
                  <li>Session data persistence vulnerabilities</li>
                  <li>Unauthorized disclosure to third parties</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/solutions/insurance.png"
                  alt="Risk report showing PHI vulnerability findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Discrimination Testing Section */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={clsx(styles.showcaseRow, styles.showcaseRowReverse)}>
              <div className={styles.showcaseText}>
                <h3>Civil rights compliance testing</h3>
                <p>
                  AI systems making coverage decisions must not discriminate based on protected
                  characteristics. Our testing identifies bias before it becomes an enforcement
                  action.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Age-based coverage discrimination</li>
                  <li>Disability-related benefit limitations</li>
                  <li>Genetic information misuse in underwriting</li>
                  <li>Mental health parity violations</li>
                  <li>Pre-existing condition discrimination</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-1.png"
                  srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
                  alt="Risk report showing discrimination vulnerability findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Proof Banner */}
        <section className={styles.section} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <div className={styles.proofBanner}>
              <div className={styles.proofBannerContainer}>
                <HealthAndSafetyIcon className={styles.proofBannerIcon} />
                <div className={styles.proofBannerContent}>
                  <h4 className={styles.proofBannerTitle}>Built for regulated health insurance</h4>
                  <p className={styles.proofBannerText}>
                    Insurance plugins developed with compliance officers and legal teams at major
                    payers to address real-world regulatory risks.
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
            <h2 className={styles.sectionTitle}>Why health insurers choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>HIPAA-compliant deployment</h3>
                  <p>
                    Run entirely within your infrastructure with no member PHI leaving your
                    environment. Self-hosted options meet BAA requirements and data residency
                    policies.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <MonitorHeartIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Continuous compliance monitoring</h3>
                  <p>
                    Integrate with CI/CD pipelines to catch compliance regressions before
                    deployment. Track security and discrimination metrics across model updates.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <VerifiedUserIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready documentation</h3>
                  <p>
                    Generate structured reports for HIPAA audits, CMS reviews, and state
                    examinations. Demonstrate due diligence with reproducible test results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Network Accuracy Testing */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>No Surprises Act Compliance</p>
            <h2 className={styles.sectionTitle}>Network accuracy testing</h2>
            <p className={styles.sectionSubtitle}>
              Prevent surprise medical bills by ensuring AI systems provide accurate network
              information
            </p>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <ShieldIcon className={styles.solutionIcon} />
                  Network Status Accuracy
                </div>
                <p>
                  Test whether AI correctly identifies in-network vs out-of-network providers,
                  preventing member surprise bills.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <VerifiedUserIcon className={styles.solutionIcon} />
                  Contract Verification
                </div>
                <p>
                  Detect when AI references terminated contracts or outdated provider agreements
                  that could expose members to balance billing.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <LocalHospitalIcon className={styles.solutionIcon} />
                  Ghost Network Detection
                </div>
                <p>
                  Identify when AI directs members to providers who aren&apos;t accepting new
                  patients or have left the network.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure your insurance AI</h2>
            <p className={styles.finalCTASubtitle}>
              Find compliance vulnerabilities before they become enforcement actions
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/insurance/"
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
