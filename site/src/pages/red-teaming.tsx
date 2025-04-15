import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import BugReportIcon from '@mui/icons-material/BugReport';
import CodeIcon from '@mui/icons-material/Code';
import ReportIcon from '@mui/icons-material/Report';
import SecurityIcon from '@mui/icons-material/Security';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../components/LogoContainer';
import NewsletterForm from '../components/NewsletterForm';
import styles from './llm-vulnerability-scanner.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img
          srcSet="/img/riskreport-1.png 1x, /img/riskreport-1@2x.png 2x"
          src="/img/riskreport-1.png"
          alt="Red Teaming for AI"
          className={styles.heroImage}
        />
        <div className={styles.logoSection}>
          Trusted by security teams at...
          <LogoContainer noBackground noBorder />
        </div>
        <h2>Customized red teaming for your AI application</h2>
        <p>
          Our red teaming solution generates adaptive attacks specifically tailored to your application's use case.
        </p>
      </div>
    </section>
  );
}

function RedTeamingHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className={styles.heroTitle}>Red Teaming for AI Applications</h1>
        <p className={styles.heroSubtitle}>The most widely adopted platform for LLM security testing</p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--primary button--lg', styles.buttonPrimary)}
            to="/docs/red-team/quickstart"
          >
            Get Started
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/contact/"
          >
            Request a demo
          </Link>
        </div>
      </div>
      <HeroSection />
    </header>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <h2>Comprehensive Coverage of AI Security Risks</h2>
        <div className={styles.features}>
          <div className={styles.featureItem}>
            <h3>Prompt Injections</h3>
            <p>Detect and prevent unauthorized manipulation of your system's prompts.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>PII Leaks</h3>
            <p>Protect sensitive personally identifiable information from being exposed.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Jailbreaking</h3>
            <p>Ensure users cannot bypass your system's safety restrictions.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Insecure Tool Use</h3>
            <p>Identify and mitigate risks associated with AI systems executing external actions.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Context Leakage</h3>
            <p>Prevent cross-session data leaks that could expose confidential information.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Harmful Content</h3>
            <p>Ensure your system doesn't generate toxic, illegal, or dangerous content.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>System Prompt Extractions</h3>
            <p>Protect your proprietary system instructions from being revealed.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Unintended Contracts</h3>
            <p>Avoid AI-generated content that could create legal obligations.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Hallucinations</h3>
            <p>Reduce the generation of false or misleading information.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DifferentiatorsSection() {
  return (
    <section className={styles.benefitsSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Why choose promptfoo for red teaming?</h2>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <SecurityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Most widely adopted red teaming platform</h3>
              <p>
                Battle-tested and recommended by foundation model labs and major enterprises, our
                solution is the industry standard for AI security testing.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <BugReportIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Custom attack generation</h3>
              <p>
                Unlike static jailbreaks, our models generate dynamic attacks specifically tailored to
                your application's use case and vulnerabilities.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <ReportIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Detailed vulnerability reports</h3>
              <p>Get comprehensive analysis of vulnerabilities with actionable remediation steps.</p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <CodeIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Flexible deployment options</h3>
              <p>
                Deploy our solution in the cloud or on-premises to meet your security and compliance
                requirements.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionOrientedSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2>Generate application-specific attack scenarios</h2>
        <p>Our models create attacks that specifically target your application's weaknesses.</p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/redteam-reports.png"
            alt="Red team vulnerability report"
          />
        </div>
      </div>
    </section>
  );
}

function ComplianceSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2>Framework Compliance</h2>
        <p>
          Ensure your AI applications comply with industry frameworks and standards, including OWASP,
          NIST, and AWS plugins for the top 10 AI vulnerabilities.
        </p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/report-with-compliance@2x.png"
            alt="Compliance framework reporting"
          />
        </div>
      </div>
    </section>
  );
}

function CallToActionSection() {
  return (
    <section className={styles.callToActionSection}>
      <div className="container">
        <h2>Start securing your AI applications today</h2>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/red-team/quickstart">
            Get Started
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/contact/"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function RedTeaming(): JSX.Element {
  return (
    <Layout
      title="AI Red Teaming"
      description="The most widely adopted platform for AI red teaming. Generate adaptive attacks for your specific application, not just static jailbreak tests. Detect prompt injections, PII leaks, jailbreaks, and more."
    >
      <Head>
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/meta/vulnerability-scanner.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <RedTeamingHeader />
        <main className={styles.mainContent}>
          <FeaturesSection />
          <ActionOrientedSection />
          <ComplianceSection />
          <DifferentiatorsSection />
          <CallToActionSection />
          <NewsletterForm />
        </main>
      </div>
    </Layout>
  );
}