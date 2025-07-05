import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SecurityUpdateGoodIcon from '@mui/icons-material/SecurityUpdateGood';
import ShieldIcon from '@mui/icons-material/Shield';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../components/LogoContainer';
import NewsletterForm from '../components/NewsletterForm';
import styles from './llm-vulnerability-scanner.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img src="/img/guardrails-framed.png" alt="AI Guardrails" className={styles.heroImage} />
        <div className={styles.logoSection}>
          Promptfoo is trusted by teams at...
          <LogoContainer noBackground noBorder />
        </div>
        {/*
        <h2>Guardrails that evolve with emerging threats</h2>
        <p>
          Break free from static guardrails with our adaptive system that learns from red team
          findings and real-world attacks.
        </p>
        */}
      </div>
    </section>
  );
}

function GuardrailsHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className={styles.heroTitle}>AI Guardrails that learn & adapt</h1>
        <p className={styles.heroSubtitle}>
          Self-improving protection powered by continuous red teaming feedback
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonPrimary)}
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
        <div className={styles.features}>
          <div className={styles.featureItem}>
            <h3>Self-Improving Security</h3>
            <p>Guardrails that continuously learn from red team findings.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Third-Party Validation</h3>
            <p>Test and verify any guardrail system, including existing third-party solutions.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Comprehensive Content Protection</h3>
            <p>
              Advanced filtering against harmful content, PII exposure, and inappropriate outputs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className={styles.benefitsSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Why choose our adaptive guardrails?</h2>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <ShieldIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Self-improving protection</h3>
              <p>
                Unlike static guardrails, our system continuously learns from red team findings,
                becoming more effective against new and evolving threats over time.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <SecurityUpdateGoodIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Validate any guardrail system</h3>
              <p>
                Use our red teaming capabilities to test and improve third-party guardrails you
                already have in place, providing an independent verification layer.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <AccountBalanceIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Fast, flexible deployment</h3>
              <p>
                Implement in minutes with minimal code changes, on cloud or on-premises, supporting
                all major LLM providers and custom models.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <VerifiedUserIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Data-driven improvement</h3>
              <p>
                Our system uses actual attack data to refine defenses, creating a feedback loop that
                makes your guardrails stronger with every attempted breach.
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
        <h2>Guardrails that get smarter over time</h2>
        <p>
          Our unique feedback loop between red teaming and guardrails creates a continuously
          improving defense system.
        </p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/guardrails-table.png"
            alt="Adaptive guardrails implementation"
          />
        </div>
      </div>
    </section>
  );
}

function ContinuousMonitoringSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2>Third-Party Guardrail Validation</h2>
        <p>
          Already using another guardrail system? Our platform can validate and improve any
          guardrail solution.
        </p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/continuous-monitoring.png"
            srcSet="/img/continuous-monitoring.png 1x, /img/continuous-monitoring@2x.png 2x"
            alt="Third-party guardrail validation"
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
        <h2>Upgrade to guardrails that learn and adapt</h2>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/contact/"
          >
            Request a Demo
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Guardrails(): JSX.Element {
  return (
    <Layout
      title="AI Guardrails"
      description="Comprehensive AI guardrails to ensure safe, compliant, and brand-aligned outputs. Protect against harmful content, PII exposure, prompt injections, and regulatory violations."
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/guardrails.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <GuardrailsHeader />
        <main className={styles.mainContent}>
          {/*<FeaturesSection />*/}
          <ActionOrientedSection />
          <ContinuousMonitoringSection />
          <BenefitsSection />
          <CallToActionSection />
          <NewsletterForm />
        </main>
      </div>
    </Layout>
  );
}
