import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import HomeRepairServiceIcon from '@mui/icons-material/HomeRepairService';
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
      description="Red team AI systems for policyholder data protection, PHI disclosure, network accuracy, and coverage discrimination across health, property, auto, life, and commercial insurance."
    >
      <Head>
        <meta property="og:title" content="AI Security for Insurance | Promptfoo" />
        <meta
          property="og:description"
          content="Red team insurance AI for policyholder data protection, network accuracy, and coverage discrimination testing."
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
          content="Red team insurance AI for policyholder data protection, network accuracy, and coverage discrimination testing."
        />
        <meta name="twitter:image" content={ogImageUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Insurance</p>
            <h1 className={styles.heroTitle}>
              Find insurance AI risks before they reach policyholders
            </h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming for health, property, auto, life, and commercial insurance AI
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
            <h2 className={styles.vulnTitle}>Insurance-specific risk testing</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for the unique risks facing AI in policyholder service,
              claims, underwriting, and network guidance
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="PHI Disclosure"
                description="Health data leakage, social engineering attacks, unauthorized third-party disclosure"
              />
              <RiskCard
                name="Policyholder Data Disclosure"
                description="Claims history, telematics, beneficiary, property, and commercial data exposure"
              />
              <RiskCard
                name="Coverage Discrimination"
                description="Protected class bias, redlining, credit-score proxy discrimination, genetic information misuse"
              />
              <RiskCard
                name="Network Misinformation"
                description="Wrong provider, contractor, body shop, vendor, or partner network status"
              />
              <RiskCard
                name="Unfair Underwriting"
                description="Unsupported rate changes, occupation stereotypes, non-renewal retaliation, unfair exclusions"
              />
              <RiskCard
                name="Coverage Misinformation"
                description="Incorrect benefits, limits, deductibles, repair warranties, appeal rights, or claim guidance"
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
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the audits you face</h2>
            <p className={styles.sectionSubtitle}>
              Purpose-built scenarios for insurance&apos;s most demanding privacy, market conduct,
              and civil rights requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<LockIcon />}
                title="Policyholder Data Safeguards"
                items={[
                  {
                    name: 'HIPAA & PHI',
                    description: 'Health data privacy, minimum necessary access, authorization',
                  },
                  {
                    name: 'GLBA',
                    description: 'Nonpublic personal information safeguards and disclosure limits',
                  },
                  {
                    name: 'FCRA',
                    description:
                      'Claims history, underwriting data, and permissible-purpose checks',
                  },
                  {
                    name: 'DPPA',
                    description: 'Driving records, telematics, and auto policyholder data',
                  },
                ]}
              />
              <ComplianceCard
                icon={<AccessibilityNewIcon />}
                title="Fair Coverage & Market Conduct"
                items={[
                  {
                    name: 'ADA & Section 1557',
                    description: 'Disability, health status, and protected class discrimination',
                  },
                  {
                    name: 'GINA & MHPAEA',
                    description: 'Genetic information misuse and mental health parity gaps',
                  },
                  {
                    name: 'FHA & ECOA',
                    description:
                      'Property and credit-related discrimination in insurance workflows',
                  },
                  {
                    name: 'State DOI Rules',
                    description: 'Unfair trade practices, claims handling, rating, and non-renewal',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>State Insurance Laws</span>
                <span className={styles.alsoSupportsBadge}>GLBA</span>
                <span className={styles.alsoSupportsBadge}>FCRA</span>
                <span className={styles.alsoSupportsBadge}>DPPA</span>
                <span className={styles.alsoSupportsBadge}>No Surprises Act</span>
                <span className={styles.alsoSupportsBadge}>Network Adequacy</span>
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
                  Policyholder Service
                </div>
                <p>
                  Coverage inquiry chatbots, eligibility verification, claims status assistants,
                  agent copilots, and portal support.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <AssignmentIcon className={styles.solutionIcon} />
                  Claims & Underwriting
                </div>
                <p>
                  Claims triage, automated adjudication, renewal decisions, rating support, and
                  underwriting assistants.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <HomeRepairServiceIcon className={styles.solutionIcon} />
                  Provider & Vendor Networks
                </div>
                <p>
                  Medical provider directories, DRP body shops, preferred contractors, rental
                  partners, and network status tools.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <ShieldIcon className={styles.solutionIcon} />
                  Sensitive Data Workflows
                </div>
                <p>
                  PHI, claims history, driving behavior, property details, beneficiary data, and
                  commercial coverage information.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Data Protection Section */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>Comprehensive policyholder data protection testing</h3>
                <p>
                  Insurance AI systems handle sensitive data across millions of policyholder
                  interactions. Our specialized testing identifies PHI and non-health policyholder
                  data exposure risks before they become privacy incidents.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Cross-policyholder data leakage detection</li>
                  <li>Social engineering vulnerability testing</li>
                  <li>Agent, adjuster, and provider impersonation scenarios</li>
                  <li>
                    Claims history, telematics, beneficiary, and property data exposure checks
                  </li>
                  <li>Session data persistence vulnerabilities</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/solutions/insurance.png"
                  alt="Risk report showing insurance privacy vulnerability findings"
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
                <h3>Fair coverage, claims, and underwriting testing</h3>
                <p>
                  AI systems making coverage, claims, underwriting, or rating decisions must not
                  discriminate based on protected characteristics. Our testing identifies bias
                  before it becomes an enforcement action.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Age-based coverage discrimination</li>
                  <li>Disability-related benefit limitations</li>
                  <li>Genetic information misuse in underwriting</li>
                  <li>Geographic redlining and credit-score proxy discrimination</li>
                  <li>Occupation, marital status, and claims history retaliation checks</li>
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
        <section className={styles.section}>
          <div className="container">
            <div className={styles.proofBanner}>
              <div className={styles.proofBannerContainer}>
                <HealthAndSafetyIcon className={styles.proofBannerIcon} />
                <div className={styles.proofBannerContent}>
                  <h4 className={styles.proofBannerTitle}>Built for regulated insurance AI</h4>
                  <p className={styles.proofBannerText}>
                    Insurance plugins developed to address real-world risks across health plans,
                    property and casualty carriers, auto insurers, life insurers, and commercial
                    lines.
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
            <h2 className={styles.sectionTitle}>Why insurers choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Private deployment options</h3>
                  <p>
                    Run entirely within your infrastructure with sensitive policyholder data kept in
                    your environment. Self-hosted options support internal privacy controls and data
                    residency policies.
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
                    Generate structured reports for privacy reviews, model governance, and federal
                    and state insurance examinations. Demonstrate due diligence with reproducible
                    test results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Network Accuracy Testing */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Provider & Vendor Network Accuracy</p>
            <h2 className={styles.sectionTitle}>Network accuracy testing</h2>
            <p className={styles.sectionSubtitle}>
              Prevent surprise bills, voided warranties, and claim delays by ensuring AI systems
              provide accurate provider and vendor network information
            </p>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <ShieldIcon className={styles.solutionIcon} />
                  Provider Status Accuracy
                </div>
                <p>
                  Test whether AI correctly identifies in-network vs out-of-network providers,
                  facility status, tiering, and appointment or intake availability.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <HomeRepairServiceIcon className={styles.solutionIcon} />
                  Preferred Vendor Verification
                </div>
                <p>
                  Detect when AI references terminated contractor, body shop, rental partner, or
                  provider agreements that could expose policyholders to unexpected costs.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <VerifiedUserIcon className={styles.solutionIcon} />
                  Capacity & Credentialing
                </div>
                <p>
                  Identify when AI directs policyholders to providers or vendors that are
                  unavailable, unlicensed, not accepting work, or no longer in the network.
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
