import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import ArticleIcon from '@mui/icons-material/Article';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BiotechIcon from '@mui/icons-material/Biotech';
import GitHubIcon from '@mui/icons-material/GitHub';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../../components/LogoContainer';
import styles from '../landing-page.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img
          src="/img/docs/code-scanning/github.png"
          alt="GitHub PR with security findings"
          className={clsx(styles.heroImage, styles.heroImageGitHubScanner)}
        />
        <div className={styles.logoSection}>
          Promptfoo is trusted by teams at...
          <LogoContainer className={styles.heroLogos} noBackground noBorder />
        </div>
      </div>
    </section>
  );
}

function GitHubActionHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Security scanning for LLM apps</h1>
          <p className={styles.heroSubtitle}>
            Find AI-based vulnerabilities in pull requests before you merge.
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.buttonPrimary)}
              to="https://github.com/apps/promptfoo-scanner"
            >
              <GitHubIcon />
              Install on GitHub
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/docs/code-scanning/github-action/"
            >
              View Docs
            </Link>
          </div>
        </div>
      </div>
      <HeroSection />
    </header>
  );
}

function VulnerabilityTypesSection() {
  const vulnerabilities = [
    {
      severity: 'critical',
      name: 'Prompt Injection',
      description: 'Untrusted input reaches LLM prompts without proper sanitization or boundaries.',
    },
    {
      severity: 'critical',
      name: 'Data Exfiltration',
      description: 'Indirect prompt injection vectors that could extract data through agent tools.',
    },
    {
      severity: 'high',
      name: 'PII Exposure',
      description:
        'Code that may leak sensitive user data to LLMs or log confidential information.',
    },
    {
      severity: 'high',
      name: 'Insecure Output Handling',
      description: 'LLM outputs used in dangerous contexts like SQL queries or shell commands.',
    },
    {
      severity: 'medium',
      name: 'Excessive Agency',
      description: 'LLMs with overly broad tool access or missing approval gates for actions.',
    },
    {
      severity: 'medium',
      name: 'Jailbreak Risks',
      description: 'Weak system prompts and guardrail bypasses that could allow harmful outputs.',
    },
  ];

  return (
    <section className={styles.vulnerabilitySection}>
      <div className="container">
        <div className={styles.vulnEyebrow}>LLM-specific vulnerabilities</div>
        <h2 className={styles.vulnTitle}>Catch issues that other review tools miss</h2>
        <p className={styles.vulnSubtitle}>
          Our scanner is laser-focused on the kinds of vulnerabilities that apps built on LLMs and
          agents are uniquely susceptible to.
        </p>
        <div className={styles.vulnGrid}>
          {vulnerabilities.map((vuln) => (
            <div key={vuln.name} className={styles.vulnCard}>
              <div className={`${styles.vulnSeverity} ${styles[vuln.severity]}`}>
                {vuln.severity}
              </div>
              <h3 className={styles.vulnName}>{vuln.name}</h3>
              <p className={styles.vulnDescription}>{vuln.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofBannerSection() {
  return (
    <section className={styles.proofBanner}>
      <div className={clsx('container', styles.proofBannerContainer)}>
        <ArticleIcon className={styles.proofBannerIcon} />
        <div className={styles.proofBannerContent}>
          <h3 className={styles.proofBannerTitle}>See it in action</h3>
          <p className={styles.proofBannerText}>
            We tested the scanner against real CVEs in LangChain, Vanna.AI, and LlamaIndex. Read the
            technical deep dive to see how it catches vulnerabilities that other tools miss.
          </p>
        </div>
        <Link
          className={clsx('button button--secondary', styles.proofBannerButton)}
          to="/blog/building-a-security-scanner-for-llm-apps"
        >
          Read the technical breakdown
        </Link>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className={styles.benefitsSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>Built for developers</div>
        <h2 className={styles.sectionTitle}>Real security that fits your workflow</h2>
        <p className={styles.sectionSubtitle}>Flag dangerous code without adding friction.</p>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <BiotechIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Deep tracing</h3>
              <p>
                Beyond the PR itself, the scanner agentically traces LLM inputs, outputs, and
                capability changes deep into the larger repository to identify subtle yet critical
                issues that human reviewers can struggle to catch.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <VolumeOffIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>No noise</h3>
              <p>
                Despite the comprehensive approach, it has a high bar for reporting, avoiding false
                positives and alert fatigue. Maintainers can configure severity levels and provide
                custom instructions to tailor sensitivity to their needs.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <AutoFixHighIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Fix suggestions</h3>
              <p>
                Every finding includes a suggested remediation, as well as a prompt that can be
                passed straight to an AI coding agent to further investigate and address the issue.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToActionSection() {
  return (
    <section className={styles.finalCTA}>
      <div className="container">
        <h2 className={styles.finalCTATitle}>Start scanning PRs right now</h2>
        <p className={styles.finalCTASubtitle}>No account, credit card, or API keys required.</p>
        <div className={styles.finalCTAButtons}>
          <Link
            className={clsx('button button--primary button--lg', styles.buttonPrimary)}
            to="https://github.com/apps/promptfoo-scanner"
          >
            <GitHubIcon />
            Install on GitHub
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/docs/code-scanning/github-action/"
          >
            Read the Docs
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function GitHubAction(): React.ReactElement {
  return (
    <Layout
      title="GitHub Action for LLM Security Scanning"
      description="Automatically scan pull requests for LLM vulnerabilities. Find prompt injection, PII exposure, and AI security risks before you merge."
    >
      <Head>
        <meta
          property="og:image"
          content="https://www.promptfoo.dev/img/docs/code-scanning/github.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <GitHubActionHeader />
        <main className={styles.mainContent}>
          <VulnerabilityTypesSection />
          <ProofBannerSection />
          <BenefitsSection />
          <CallToActionSection />
        </main>
      </div>
    </Layout>
  );
}
