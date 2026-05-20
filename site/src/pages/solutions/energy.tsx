import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssignmentIcon from '@mui/icons-material/Assignment';
import GavelIcon from '@mui/icons-material/Gavel';
import InsightsIcon from '@mui/icons-material/Insights';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LockIcon from '@mui/icons-material/Lock';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PublicIcon from '@mui/icons-material/Public';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
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

export default function Energy() {
  const canonicalUrl = useBaseUrl('/solutions/energy/', { absolute: true });
  const ogImageUrl = useBaseUrl('/img/og/solutions-energy-og.png', { absolute: true });

  return (
    <Layout
      title="AI Security for Energy"
      description="Red team energy AI for electric utilities, gas operations, oil and gas, nuclear, renewables, grid operations, energy markets, and large-load workflows."
    >
      <Head>
        <meta property="og:title" content="AI Security for Energy | Promptfoo" />
        <meta
          property="og:description"
          content="Red team energy AI before unsafe answers reach customers, crews, regulators, or markets."
        />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AI Security for Energy | Promptfoo" />
        <meta
          name="twitter:description"
          content="Red team energy AI before unsafe answers reach customers, crews, regulators, or markets."
        />
        <meta name="twitter:image" content={ogImageUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Head>

      {/* Hero */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Energy</p>
            <h1 className={styles.heroTitle}>
              Find the unsafe energy AI answer before customers, crews, or markets do
            </h1>
            <p className={styles.heroSubtitle}>
              Automated red teaming for AI assistants across electric utilities, gas operations, oil
              and gas, nuclear, renewables, grid operations, energy markets, and large-load
              workflows
            </p>
            <div className={styles.heroButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/energy/"
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
            <h2 className={styles.vulnTitle}>Energy-specific risk testing</h2>
            <p className={styles.vulnSubtitle}>
              Purpose-built test scenarios for AI that can mislead customers, expose sensitive load
              or infrastructure data, cross market-disclosure boundaries, or bypass energy
              operations approvals
            </p>

            <div className={styles.vulnGrid}>
              <RiskCard
                name="Customer & Rates Misinformation"
                description="TOU rates, tariffs, EV and solar rebates, medical baseline, life-support accounts, disconnection holds, DER interconnection"
              />
              <RiskCard
                name="Outage & Emergency Safety"
                description="Downed conductors, gas odor, public safety power shutoffs, restoration ETAs, generator safety, wildfire communications"
              />
              <RiskCard
                name="AMI & Load Privacy"
                description="Smart-meter interval data, occupancy inference, tenant accounts, C&I load profiles, data-center ramps"
              />
              <RiskCard
                name="Grid & Pipeline Disclosure"
                description="Substation names, feeder maps, relay settings, pipeline integrity data, control-center dependencies, physical-security gaps"
              />
              <RiskCard
                name="Markets, PPAs & Green Claims"
                description="ISO/RTO data, generation derates, fuel hedges, trading strategy, PPA terms, REC matching, emissions claims"
              />
              <RiskCard
                name="Nuclear, Oil & Gas, Research Boundaries"
                description="NRC procedure boundaries, HSE procedures, refinery turnarounds, reservoir data, export-reviewed fusion and battery research"
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <Link className="button button--primary" to="/docs/red-team/plugins/energy/">
                View Full Test Coverage
              </Link>
            </div>
          </div>
        </section>

        {/* Regulatory Alignment */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Regulatory Alignment</p>
            <h2 className={styles.sectionTitle}>Tests mapped to the reviews you face</h2>
            <p className={styles.sectionSubtitle}>
              Purpose-built scenarios for energy&apos;s most demanding customer, safety, market,
              reliability, nuclear, infrastructure, and research governance requirements
            </p>

            <div className={styles.complianceGridTwo}>
              <ComplianceCard
                icon={<AccountBalanceIcon />}
                title="Customer, Safety & Privacy"
                items={[
                  {
                    name: 'PUC & PSC tariff review',
                    description:
                      'Rate schedules, bill credits, assistance programs, rebates, deposits, and DER interconnection claims',
                  },
                  {
                    name: 'Protected customer handling',
                    description:
                      'Medical baseline, life-support, hardship, shutoff notices, disconnection holds, and verification workflows',
                  },
                  {
                    name: 'Emergency communications',
                    description:
                      'Gas odor, downed wire, wildfire, generator, PSPS, restoration, and public-safety escalation guidance',
                  },
                  {
                    name: 'AMI and load privacy',
                    description:
                      'Interval usage, tenant data, occupancy inference, C&I load patterns, and data-center confidentiality',
                  },
                ]}
              />
              <ComplianceCard
                icon={<GavelIcon />}
                title="Operations, Markets & Controlled Information"
                items={[
                  {
                    name: 'NERC CIP & CEII-style boundaries',
                    description:
                      'Critical infrastructure details, restricted diagrams, cyber context, access controls, and control-center dependencies',
                  },
                  {
                    name: 'FERC and ISO/RTO market conduct',
                    description:
                      'Non-public outages, derates, dispatch constraints, congestion, fuel, hedges, bids, PPAs, and forecasts',
                  },
                  {
                    name: 'Nuclear and HSE workflows',
                    description:
                      'Procedure use, work control, corrective actions, reporting thresholds, refinery turnarounds, and pipeline integrity data',
                  },
                  {
                    name: 'Green claims and export review',
                    description:
                      'REC matching, PPA claims, offsets, avoided emissions, advanced nuclear, fusion, battery, hydrogen, and lab data',
                  },
                ]}
              />
            </div>

            <div className={styles.alsoSupportsSection}>
              <p className={styles.alsoSupportsLabel}>Also supports</p>
              <div className={styles.alsoSupportsBadges}>
                <span className={styles.alsoSupportsBadge}>State PUC/PSC Reviews</span>
                <span className={styles.alsoSupportsBadge}>NERC CIP Programs</span>
                <span className={styles.alsoSupportsBadge}>CEII Handling</span>
                <span className={styles.alsoSupportsBadge}>FERC Market Conduct</span>
                <span className={styles.alsoSupportsBadge}>NRC Boundaries</span>
                <span className={styles.alsoSupportsBadge}>FTC Green Guides</span>
                <span className={styles.alsoSupportsBadge}>Export Controls</span>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className={styles.solutionSection}>
          <div className="container">
            <p className={styles.sectionEyebrow}>Applications</p>
            <h2 className={styles.sectionTitle}>Tested across the energy enterprise</h2>

            <div className={styles.solutionGrid}>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <SupportAgentIcon className={styles.solutionIcon} />
                  Customer Operations
                </div>
                <p>
                  Billing bots, TOU rate explainers, rebate assistants, disconnection workflows,
                  protected customer handling, and complaint triage.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <LocalFireDepartmentIcon className={styles.solutionIcon} />
                  Outage & Gas Emergency
                </div>
                <p>
                  Storm response copilots, PSPS messaging, gas odor guidance, restoration estimates,
                  downed conductor escalation, and generator safety.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <AssignmentIcon className={styles.solutionIcon} />
                  Field, NOC & Work Management
                </div>
                <p>
                  OMS, DMS, ADMS-adjacent copilots, outage tickets, switching support, clearances,
                  safety holds, and crew briefings.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <SpeedIcon className={styles.solutionIcon} />
                  Large-Load Accounts
                </div>
                <p>
                  Data-center load ramps, capacity queues, interconnection studies, service dates,
                  priority restoration language, and PPA summaries.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <InsightsIcon className={styles.solutionIcon} />
                  Markets & Generation
                </div>
                <p>
                  ISO/RTO research, generation outage summaries, derate explanations, fuel
                  procurement, hedge exposure, green claims, and forecast analysis.
                </p>
              </div>
              <div className={styles.solutionCard}>
                <div className={styles.solutionTitle}>
                  <PublicIcon className={styles.solutionIcon} />
                  Oil, Gas, Nuclear & R&D
                </div>
                <p>
                  Pipeline integrity assistants, refinery and upstream knowledge tools, nuclear
                  work-control support, HSE records, and export-reviewed lab data rooms.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Showcase 1 */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={styles.showcaseRow}>
              <div className={styles.showcaseText}>
                <h3>10 plugins. Every energy context switch. One systematic test.</h3>
                <p>
                  Energy AI fails differently depending on whether it is answering a billing
                  question, summarizing a pipeline integrity file, drafting a large-load update, or
                  advising a nuclear work-control user. Promptfoo tests each workflow with the right
                  operational vocabulary and evidence requirements.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>Electric utility customer, outage, wildfire, and AMI privacy scenarios</li>
                  <li>Gas emergency, pipeline integrity, oilfield, and refinery HSE scenarios</li>
                  <li>ISO/RTO, PPA, generation, hedge, and green-claims disclosure scenarios</li>
                  <li>Nuclear procedure, corrective-action, and controlled research boundaries</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-1.png"
                  srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
                  alt="Risk report showing energy AI vulnerability findings"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Showcase 2 */}
        <section className={styles.solutionSection}>
          <div className="container">
            <div className={clsx(styles.showcaseRow, styles.showcaseRowReverse)}>
              <div className={styles.showcaseText}>
                <h3>Promptable surfaces, not raw plant or grid control</h3>
                <p>
                  Promptfoo evaluates the AI layer: what an assistant says, retrieves, summarizes,
                  drafts, queues, simulates, or claims through tools. It does not test relays,
                  turbines, valves, PLCs, SCADA networks, nuclear protection systems, or physical
                  safety mechanisms directly.
                </p>
                <ul style={{ marginTop: '1.5rem', paddingLeft: '1.25rem' }}>
                  <li>
                    Customer and IVR bots answering billing, outage, gas, and program questions
                  </li>
                  <li>
                    RAG apps over tariff books, engineering drawings, market memos, and HSE files
                  </li>
                  <li>
                    NOC, field, outage, and account-team copilots connected to ticketing tools
                  </li>
                  <li>Tool traces and mock results for workflow agents before production access</li>
                </ul>
              </div>
              <div className={styles.showcaseImage}>
                <img
                  src="/img/riskreport-2.png"
                  srcSet="/img/riskreport-2.png 1x, /img/riskreport-2@2x.png 2x"
                  alt="Risk report showing promptable energy workflow boundary findings"
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
                  <h4 className={styles.proofBannerTitle}>Built for high-consequence energy AI</h4>
                  <p className={styles.proofBannerText}>
                    Energy plugins address real-world risks across utilities, gas operations, oil
                    and gas, generation fleets, energy markets, nuclear workflows, renewables, and
                    advanced-energy research.
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
            <h2 className={styles.sectionTitle}>Why energy teams choose Promptfoo</h2>

            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <LockIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Private deployment options</h3>
                  <p>
                    Run tests in your environment with customer, AMI, market, infrastructure, HSE,
                    nuclear, and research data kept under your controls.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <MonitorHeartIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Continuous release gates</h3>
                  <p>
                    Integrate with CI/CD to catch regressions before AI changes reach customer
                    operations, field teams, account teams, market analysts, or research groups.
                  </p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <VerifiedUserIcon className={styles.benefitIcon} />
                <div className={styles.benefitContent}>
                  <h3>Audit-ready documentation</h3>
                  <p>
                    Generate reproducible findings for security, AI governance, customer operations,
                    safety, privacy, legal, market compliance, nuclear, and HSE review.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.finalCTA}>
          <div className="container">
            <h2 className={styles.finalCTATitle}>Secure your energy AI</h2>
            <p className={styles.finalCTASubtitle}>
              Find safety, privacy, market, infrastructure, and workflow failures before launch
            </p>
            <div className={styles.finalCTAButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Request Demo
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/red-team/plugins/energy/"
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
