import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import LockIcon from '@mui/icons-material/Lock';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ShieldIcon from '@mui/icons-material/Shield';
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

export default function Healthcare() {
  const { siteConfig } = useDocusaurusContext();
  const siteUrl = siteConfig.url;

  return (
    <Layout
      title="AI Security for Healthcare"
      description="Red team clinical AI for medical accuracy, patient safety, PHI protection, and regulatory compliance. HIPAA-ready testing for healthcare and life sciences."
    >
      <Head>
        <meta property="og:title" content="AI Security for Healthcare | Promptfoo" />
        <meta
          property="og:description"
          content="Red team clinical AI for medical accuracy, patient safety, and PHI protection."
        />
        <meta property="og:image" content={`${siteUrl}/img/og/solutions-healthcare-og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/solutions/healthcare`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AI Security for Healthcare | Promptfoo" />
        <meta
          name="twitter:description"
          content="Red team clinical AI for medical accuracy, patient safety, and PHI protection."
        />
        <meta name="twitter:image" content={`${siteUrl}/img/og/solutions-healthcare-og.png`} />
        <link rel="canonical" href={`${siteUrl}/solutions/healthcare`} />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Healthcare & Life Sciences</p>
            <h1 className={styles.heroTitle}>
              Find the hallucinated drug interaction before patients do
            </h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming for clinical AI, patient-facing systems, and pharmacy
              applications
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/medical/"
              >
                Technical Documentation
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Medical Risk Categories */}
        <section className={styles.vulnerabilitySection}>
          <div className="container">
            <p className={styles.vulnEyebrow}>Clinical Accuracy Testing</p>
            <h2 className={styles.vulnTitle}>Patient safety-focused red teaming</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for the unique risks of AI in clinical decision support,
              patient communication, and medical documentation
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Medical Hallucination"
                description="Fabricated studies, fictional medications, invented drug interactions, non-existent treatment protocols"
              />
              <RiskCard
                name="Dangerous Misinformation"
                description="Incorrect dosing, contraindicated treatments, outdated clinical practices, harmful medical advice"
              />
              <RiskCard
                name="Triage Failures"
                description="Missed emergencies, inappropriate symptom downgrading, delayed care recommendations"
              />
              <RiskCard
                name="Clinical Anchoring Bias"
                description="Fixation on irrelevant information while missing critical diagnostic signals"
              />
              <RiskCard
                name="Off-Label Guidance"
                description="Inappropriate medication recommendations without proper disclaimers or specialist referrals"
              />
              <RiskCard
                name="Medical Sycophancy"
                description="Agreeing with incorrect patient self-diagnoses to appear helpful rather than accurate"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/medical/">
                View Full Test Coverage
              </Link>
            </div>
          </div>
        </section>

        {/* Pharmacy Plugins */}
        <section className={styles.vulnerabilitySection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.vulnEyebrow}>Pharmacy Safety Testing</p>
            <h2 className={styles.vulnTitle}>Pharmaceutical-specific risk coverage</h2>
            <p className={styles.vulnSubtitle}>
              Specialized testing for medication management, prescription verification, and
              controlled substance compliance
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Drug Interaction Detection"
                description="CYP450 interactions, QT prolongation risks, serotonin syndrome, dangerous polypharmacy"
              />
              <RiskCard
                name="Dosage Calculation Errors"
                description="Weight-based dosing mistakes, renal adjustment failures, pediatric calculation errors"
              />
              <RiskCard
                name="Controlled Substance Compliance"
                description="DEA schedule violations, early refill red flags, prescription diversion indicators"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/pharmacy/">
                View Pharmacy Test Coverage
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
              Purpose-built scenarios for healthcare&apos;s most demanding compliance requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<LockIcon />}
                title="HIPAA Compliance"
                items={[
                  {
                    name: 'Privacy Rule',
                    description: 'PHI disclosure attempts, social engineering, unauthorized access',
                  },
                  {
                    name: 'Security Rule',
                    description: 'Access control bypass, session persistence, auth weaknesses',
                  },
                  {
                    name: 'Breach Notification',
                    description: 'Detect exposures before they trigger reporting',
                  },
                  {
                    name: 'Business Associates',
                    description: 'Inappropriate third-party sharing, vendor leakage',
                  },
                ]}
              />
              <ComplianceCard
                icon={<MedicalServicesIcon />}
                title="FDA & Clinical Safety"
                items={[
                  {
                    name: 'AI/ML SaMD Guidance',
                    description: 'Clinical accuracy, scope limitations, required disclaimers',
                  },
                  {
                    name: 'GMLP Principles',
                    description: 'Bias detection, hallucination, model boundary violations',
                  },
                  {
                    name: 'PCCP Framework',
                    description: 'Behavior consistency across updates, drift detection',
                  },
                  {
                    name: 'Post-Market Surveillance',
                    description: 'Accuracy regression, emerging failure modes',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>HITECH Act</span>
                <span className={styles.alsoSupportsBadge}>State Privacy Laws</span>
                <span className={styles.alsoSupportsBadge}>HITRUST AI Assurance</span>
                <span className={styles.alsoSupportsBadge}>EU AI Act + MDR</span>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Applications</p>
            <h2 className={styles.sectionTitle}>Tested across the healthcare enterprise</h2>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <LocalHospitalIcon className={styles.solutionIcon} />
                  Clinical Decision Support
                </div>
                <p>
                  EHR-embedded diagnostic assistants, treatment recommendation engines, and clinical
                  documentation tools.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <MonitorHeartIcon className={styles.solutionIcon} />
                  Patient-Facing Systems
                </div>
                <p>
                  Symptom checkers, triage bots, patient education tools, and care navigation
                  assistants.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <LocalPharmacyIcon className={styles.solutionIcon} />
                  Pharmacy & Medication
                </div>
                <p>
                  Prescription verification, drug interaction checking, dosage calculation, and
                  controlled substance compliance.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PHI Protection Section */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>Comprehensive PHI protection testing</h3>
                <p>
                  Healthcare AI systems handle the most sensitive patient data. Our specialized
                  testing identifies PHI exposure risks across multiple attack vectors before they
                  become breaches.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Cross-patient PHI leakage detection</li>
                  <li>Social engineering vulnerability testing</li>
                  <li>Provider impersonation attack scenarios</li>
                  <li>Session data persistence checks</li>
                  <li>Unauthorized third-party disclosure risks</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/solutions/healthcare.png"
                  alt="Risk report showing PHI vulnerability findings"
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
                  <h4 className={styles.proofBannerTitle}>Patient safety is non-negotiable</h4>
                  <p className={styles.proofBannerText}>
                    Healthcare plugins developed with clinical informaticists and healthcare
                    security teams to address real-world patient safety risks.
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
            <h2 className={styles.sectionTitle}>Why healthcare organizations choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>HIPAA-compliant deployment</h3>
                  <p>
                    Run entirely within your infrastructure with no PHI leaving your environment.
                    Self-hosted options meet BAA requirements and data residency policies.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <MonitorHeartIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Continuous safety monitoring</h3>
                  <p>
                    Integrate with CI/CD pipelines to catch clinical accuracy regressions before
                    deployment. Track safety metrics across model updates and prompt changes.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <ShieldIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready documentation</h3>
                  <p>
                    Generate structured reports for FDA submissions, HIPAA audits, and clinical
                    validation requirements. Demonstrate due diligence with reproducible test
                    results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure your clinical AI</h2>
            <p className={styles.finalCTASubtitle}>
              Find patient safety vulnerabilities before they reach production
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/medical/"
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
