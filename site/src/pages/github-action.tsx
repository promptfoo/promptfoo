import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CodeIcon from '@mui/icons-material/Code';
import GitHubIcon from '@mui/icons-material/GitHub';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './landing-page.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img
          src="/img/docs/code-scanning/github.png"
          alt="GitHub PR with security findings"
          className={styles.heroImage}
        />
      </div>
    </section>
  );
}

function GitHubActionHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Catch LLM vulnerabilities in pull requests</h1>
          <p className={styles.heroSubtitle}>
            Automated security review for every PR. Find prompt injection, PII exposure, and other
            AI risks before you merge.
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.buttonPrimary)}
              to="https://github.com/apps/promptfoo-scanner"
            >
              Get Started
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

function HowItWorksSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>GET STARTED IN MINUTES</div>
        <h2 className={styles.sectionTitle}>Three steps to automated security review</h2>
        <p className={styles.sectionSubtitle}>
          Install the GitHub App, review the setup PR, and get security feedback on every pull
          request
        </p>

        <div className={styles.securityFlowContainer}>
          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <GitHubIcon fontSize="large" />
            </div>
            <h3>Install GitHub App</h3>
            <p>Add the scanner to your repositories</p>
            <ul>
              <li>Go to github.com/apps/promptfoo-scanner</li>
              <li>Choose repositories to scan</li>
              <li>Submit email or sign in</li>
              <li>No API keys or account needed</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <Link
                to="https://github.com/apps/promptfoo-scanner"
                className="button button--primary button--sm"
              >
                Install App
              </Link>
            </div>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <CodeIcon fontSize="large" />
            </div>
            <h3>Review Setup PR</h3>
            <p>Automatic workflow configuration</p>
            <ul>
              <li>Auto-generated workflow file</li>
              <li>Tweak configuration if needed</li>
              <li>Merge when ready</li>
              <li>Scanning starts immediately</li>
            </ul>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <CheckCircleIcon fontSize="large" />
            </div>
            <h3>Get Security Feedback</h3>
            <p>Findings on every pull request</p>
            <ul>
              <li>Scanner runs on future PRs</li>
              <li>Findings posted as review comments</li>
              <li>Severity levels and fix suggestions</li>
              <li>Fix issues before merging</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
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
        <div className={styles.vulnEyebrow}>LLM-SPECIFIC VULNERABILITIES</div>
        <h2 className={styles.vulnTitle}>Find what other scanners miss</h2>
        <p className={styles.vulnSubtitle}>
          Purpose-built for AI security risks that general code scanners overlook
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

function SeeItInActionSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Security feedback in your PR workflow</h2>
        <p className={styles.sectionSubtitle}>
          The scanner analyzes code changes and traces data flows across your codebase to find
          vulnerabilities that span multiple files. Findings appear as review comments with severity
          levels and suggested fixes.
        </p>

        <div className={styles.showcaseRow}>
          <div className={styles.showcaseImage}>
            <img
              loading="lazy"
              src="/img/docs/code-scanning/github.png"
              alt="GitHub PR with security findings posted as review comments"
            />
          </div>
        </div>

        <div className={styles.showcaseBullets}>
          <ul>
            <li>Findings posted as PR review comments</li>
            <li>Severity levels (critical, high, medium, low)</li>
            <li>Actionable fix suggestions</li>
            <li>Configurable severity thresholds</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className={styles.benefitsSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>WHY USE IT</div>
        <h2 className={styles.sectionTitle}>Shift security left without slowing down</h2>
        <p className={styles.sectionSubtitle}>
          Catch vulnerabilities where fixes are fastest and cheapest—before code hits main
        </p>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <SearchIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Deep data flow analysis</h3>
              <p>
                AI agents trace data flows across your codebase. Catches subtle issues that span
                multiple files. High signal, low noise—no pattern matching.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <SecurityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>LLM-specific detection</h3>
              <p>
                Purpose-built for AI security risks. Finds issues general SAST tools miss. No alert
                fatigue from irrelevant findings.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <BuildIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Actionable fix suggestions</h3>
              <p>
                Every finding includes suggested remediation. Learn secure patterns while you code.
                Fix vulnerabilities in minutes, not hours.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <GitHubIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Zero setup for GitHub</h3>
              <p>
                Install app, merge setup PR, done. No API keys or tokens needed (OIDC). No Promptfoo
                account required.
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
        <h2 className={styles.finalCTATitle}>Start scanning your PRs today</h2>
        <p className={styles.finalCTASubtitle}>
          No account required—just install the GitHub App and you're ready to go
        </p>
        <div className={styles.finalCTAButtons}>
          <Link
            className="button button--primary button--lg"
            to="https://github.com/apps/promptfoo-scanner"
          >
            Get Started
          </Link>
          <Link
            className="button button--secondary button--lg"
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
          <HowItWorksSection />
          <VulnerabilityTypesSection />
          <SeeItInActionSection />
          <BenefitsSection />
          <CallToActionSection />
        </main>
      </div>
    </Layout>
  );
}
