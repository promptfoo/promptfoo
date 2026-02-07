import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ApartmentIcon from '@mui/icons-material/Apartment';
import BalanceIcon from '@mui/icons-material/Balance';
import CampaignIcon from '@mui/icons-material/Campaign';
import GavelIcon from '@mui/icons-material/Gavel';
import HomeIcon from '@mui/icons-material/Home';
import LockIcon from '@mui/icons-material/Lock';
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

export default function RealEstate() {
  return (
    <Layout
      title="AI Security for Real Estate"
      description="Red team real estate AI for Fair Housing Act compliance across 7 protected classes, anti-steering, lending discrimination, and valuation bias."
    >
      <Head>
        <meta property="og:title" content="AI Security for Real Estate | Promptfoo" />
        <meta
          property="og:description"
          content="Red team AI for fair housing compliance and discrimination testing in real estate."
        />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Real Estate</p>
            <h1 className={styles.heroTitle}>Fair housing compliance across every AI touchpoint</h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming for 7 protected classes across property search, listings,
              lending, and advertising AI
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/realestate/"
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
            <h2 className={styles.vulnTitle}>Real estate-specific testing</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for the unique risks facing AI in property search,
              listings, lending, and property management
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Steering"
                description="Neighborhood recommendations based on race, religion, or national origin; school district proxies for demographic filtering"
              />
              <RiskCard
                name="Discriminatory Listings"
                description="Exclusionary language in property descriptions, discriminatory preference statements, coded demographic signals"
              />
              <RiskCard
                name="Lending Discrimination"
                description="Rate disparities by protected class, discouraged applications, differential qualification standards"
              />
              <RiskCard
                name="Valuation Bias"
                description="Appraisal disparities correlated with neighborhood demographics, historical redlining patterns in AVMs"
              />
              <RiskCard
                name="Advertising Discrimination"
                description="Targeted ad exclusion by protected class, preferential audience selection, discriminatory imagery or language"
              />
              <RiskCard
                name="Source of Income Rejection"
                description="Housing voucher discrimination, Section 8 refusal, blanket income-source policies, disability income exclusion"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/realestate/">
                View Full Test Coverage
              </Link>
            </div>
          </div>
        </section>

        {/* Regulatory Alignment */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the laws you face</h2>
            <p className={styles.sectionSubtitle}>
              Purpose-built scenarios for real estate&apos;s most demanding fair housing and lending
              compliance requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<BalanceIcon />}
                title="Fair Housing Act"
                items={[
                  {
                    name: '7 Protected Classes',
                    description:
                      'Race, color, religion, national origin, sex, familial status, disability',
                  },
                  {
                    name: 'Anti-Steering (Sec. 3604)',
                    description: 'Neighborhood direction based on protected characteristics',
                  },
                  {
                    name: 'Advertising (Sec. 3604c)',
                    description:
                      'Discriminatory statements, preferences, or limitations in listings',
                  },
                  {
                    name: 'Disparate Impact',
                    description: 'Facially neutral policies with discriminatory effects',
                  },
                ]}
              />
              <ComplianceCard
                icon={<GavelIcon />}
                title="Lending & Accessibility"
                items={[
                  {
                    name: 'ECOA',
                    description:
                      'Equal Credit Opportunity Act, prohibited basis discrimination in lending',
                  },
                  {
                    name: 'ADA/FHA Disability',
                    description:
                      'Reasonable accommodation, accessibility requirements, service animals',
                  },
                  {
                    name: 'HUD Guidance',
                    description: 'AI-specific fair housing guidance, algorithmic accountability',
                  },
                  {
                    name: 'PAVE Task Force',
                    description: 'Property Appraisal and Valuation Equity, bias in AVMs',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>State Source-of-Income Laws</span>
                <span className={styles.alsoSupportsBadge}>DOJ Pattern-or-Practice</span>
                <span className={styles.alsoSupportsBadge}>Facebook Housing Ad Settlement</span>
                <span className={styles.alsoSupportsBadge}>RESPA</span>
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
                  <HomeIcon className={styles.solutionIcon} />
                  Property Search & Recommendations
                </div>
                <p>
                  Home search assistants, neighborhood recommendation engines, property matching
                  tools, and school district comparison features.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <AccountBalanceIcon className={styles.solutionIcon} />
                  Mortgage & Lending
                </div>
                <p>
                  Pre-qualification bots, rate comparison tools, loan officer assistants, and
                  automated underwriting support systems.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <ApartmentIcon className={styles.solutionIcon} />
                  Property Management
                </div>
                <p>
                  Tenant screening assistants, lease management bots, maintenance request handlers,
                  and rental listing generators.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Showcase 1 */}
        <section className={styles.solutionSection} style={{ backgroundColor: '#f8f9fa' }}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>8 plugins. 7 protected classes. One systematic test.</h3>
                <p>
                  Fair housing violations carry penalties up to $150,000 per offense, plus private
                  litigation. Promptfoo&apos;s real estate plugins systematically test every AI
                  touchpoint&mdash;from property search to lending to advertising&mdash;across all 7
                  federally protected classes.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Steering and neighborhood recommendation testing</li>
                  <li>Discriminatory listing language detection</li>
                  <li>Lending disparity analysis across protected classes</li>
                  <li>Advertising exclusion and targeting tests</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-1.png"
                  srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
                  alt="Risk report showing fair housing vulnerability findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Showcase 2 (reverse) */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={clsx(styles.showcaseRow, styles.showcaseRowReverse)}>
              <div className={styles.showcaseText}>
                <h3>Valuation equity testing</h3>
                <p>
                  Historical redlining patterns persist in automated valuation models. The PAVE Task
                  Force identified algorithmic bias in property appraisals as a key barrier to
                  housing equity. Promptfoo tests your AVM and appraisal AI for demographic
                  correlation in valuations.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>AVM demographic correlation testing</li>
                  <li>Historical redlining pattern detection</li>
                  <li>Comparable selection bias analysis</li>
                  <li>Neighborhood boundary fairness checks</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-2.png"
                  srcSet="/img/riskreport-2.png 1x, /img/riskreport-2@2x.png 2x"
                  alt="Risk report showing valuation equity test findings"
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
                    The most comprehensive fair housing testing available
                  </h4>
                  <p className={styles.proofBannerText}>
                    Real estate plugins developed to test every AI touchpoint for fair housing
                    compliance across all 7 federally protected classes.
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
            <h2 className={styles.sectionTitle}>Why real estate teams choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Self-hosted deployment</h3>
                  <p>
                    Run entirely within your infrastructure. No applicant or transaction data leaves
                    your environment, meeting the strictest data residency and security
                    requirements.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <MonitorHeartIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Continuous compliance monitoring</h3>
                  <p>
                    Integrate with CI/CD pipelines to catch fair housing regressions before
                    deployment. Track compliance posture across model updates and listing changes.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <VerifiedUserIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready documentation</h3>
                  <p>
                    Generate structured reports that map directly to Fair Housing Act and ECOA
                    requirements. Demonstrate due diligence with reproducible test results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure your real estate AI</h2>
            <p className={styles.finalCTASubtitle}>
              Find fair housing violations before they become enforcement actions
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/realestate/"
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
