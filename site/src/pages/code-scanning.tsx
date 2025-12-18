import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import ArticleIcon from '@mui/icons-material/Article';
import CodeIcon from '@mui/icons-material/Code';
import GitHubIcon from '@mui/icons-material/GitHub';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import TerminalIcon from '@mui/icons-material/Terminal';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../components/LogoContainer';
import styles from './landing-page.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img
          src="/img/code-scanning-hero.svg"
          alt="LLM Security Code Scanning"
          className={styles.heroImage}
        />
        <div className={styles.logoSection}>
          Promptfoo is trusted by teams at...
          <LogoContainer className={styles.heroLogos} noBackground noBorder />
        </div>
      </div>
    </section>
  );
}

function CodeScanningHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Secure AI code in development</h1>
          <p className={styles.heroSubtitle}>
            Find LLM vulnerabilities in your IDE and CI/CD - before they reach production
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.buttonPrimary)}
              to="/contact/"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </div>
      <HeroSection />
    </header>
  );
}

function IntegrationOptionsSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>SHIFT-LEFT SECURITY</div>
        <h2 className={styles.sectionTitle}>Coverage across your development workflow</h2>
        <p className={styles.sectionSubtitle}>
          Catch vulnerabilities at the earliest possible moment—from the first line of code to
          deployment
        </p>

        <div className={styles.securityFlowContainer}>
          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <CodeIcon fontSize="large" />
            </div>
            <h3>IDE Integration</h3>
            <p>Real-time scanning as developers write code</p>
            <ul>
              <li>Inline diagnostics and severity indicators</li>
              <li>One-click quick fixes</li>
              <li>AI-assisted remediation prompts</li>
              <li>Scan on save or on demand</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <Link to="/contact/" className="button button--primary button--sm">
                Request Access
              </Link>
            </div>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <GitHubIcon fontSize="large" />
            </div>
            <h3>Pull Request Review</h3>
            <p>Automated security review before code merges</p>
            <ul>
              <li>Findings posted as PR comments</li>
              <li>Suggested fixes inline</li>
              <li>Severity-based blocking</li>
              <li>Easy GitHub integration</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <Link
                to="/code-scanning/github-action/"
                className="button button--primary button--sm"
                target="_blank"
              >
                Learn More
              </Link>
            </div>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <TerminalIcon fontSize="large" />
            </div>
            <h3>CI/CD Pipeline</h3>
            <p>Integrate into any build and deployment process</p>
            <ul>
              <li>Jenkins, GitLab, CircleCI, and more</li>
              <li>JSON output for automation</li>
              <li>Configurable severity thresholds</li>
              <li>Fail builds on critical findings</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <Link to="/docs/code-scanning/cli/" className="button button--secondary button--sm">
                CLI Documentation
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SeeItInActionSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>SEE IT IN ACTION</div>
        <h2 className={styles.sectionTitle}>Security feedback where developers work</h2>
        <p className={styles.sectionSubtitle}>
          AI agents trace data flows across your codebase to find vulnerabilities that span multiple
          files—then surface findings with actionable remediation
        </p>

        <div className={styles.showcaseRow}>
          <div className={styles.showcaseText}>
            <h3>Real-time IDE scanning</h3>
            <p>
              Inline diagnostics, severity indicators, and one-click fixes as you write code. Catch
              vulnerabilities the moment they're introduced—before they ever leave your editor.
            </p>
          </div>
          <div className={styles.showcaseImage}>
            <img
              loading="lazy"
              src="/img/docs/code-scanning/vscode-extension.png"
              alt="VS Code extension showing inline security diagnostics"
            />
          </div>
        </div>

        <div className={clsx(styles.showcaseRow, styles.showcaseRowReverse)}>
          <div className={styles.showcaseText}>
            <h3>Automated PR review</h3>
            <p>
              Security findings posted as PR comments with suggested fixes before code merges. Block
              risky changes automatically based on severity thresholds.
            </p>
          </div>
          <div className={styles.showcaseImage}>
            <img
              loading="lazy"
              src="/img/docs/code-scanning/github.png"
              alt="GitHub PR with security findings posted as review comments"
            />
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
        <div className={styles.vulnEyebrow}>LLM-SPECIFIC DETECTION</div>
        <h2 className={styles.vulnTitle}>Find what other scanners miss</h2>
        <p className={styles.vulnSubtitle}>
          Purpose-built for AI security risks that general SAST tools overlook
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
        <div className={styles.sectionEyebrow}>WHY CODE SCANNING</div>
        <h2 className={styles.sectionTitle}>Security that scales with AI adoption</h2>
        <p className={styles.sectionSubtitle}>
          Find vulnerabilities where fixes are 10x faster and cheaper—without slowing down
          development
        </p>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <SearchIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Deep data flow analysis</h3>
              <p>
                AI agents trace how user inputs flow through your code to LLM prompts, catching
                subtle vulnerabilities that span multiple files and modules—not just surface-level
                pattern matching.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <SecurityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>LLM-specific detection</h3>
              <p>
                Purpose-built for AI security risks that general SAST tools miss. High signal, low
                noise—no alert fatigue from irrelevant findings.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <IntegrationInstructionsIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Embedded in developer workflow</h3>
              <p>
                Security feedback in the IDE and PR comments with actionable remediation. Developers
                fix issues without context switching or separate dashboards.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <CodeIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Complete development coverage</h3>
              <p>
                From the first line of code to deployment. IDE catches issues immediately, PR review
                prevents merges, CI/CD ensures nothing slips through.
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
        <h2 className={styles.finalCTATitle}>Secure AI development from day one</h2>
        <p className={styles.finalCTASubtitle}>
          Get complete coverage across your development workflow—IDE, pull requests, and CI/CD.
        </p>
        <div className={styles.finalCTAButtons}>
          <Link className="button button--primary button--lg" to="/contact/">
            Request Demo
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function CodeScanning(): React.ReactElement {
  return (
    <Layout
      title="Code Scanning for LLM Security"
      description="AI-powered code scanning that finds LLM security vulnerabilities in pull requests. Detect prompt injection, PII exposure, and jailbreak risks before you merge."
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/code-scanning.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <CodeScanningHeader />
        <main className={styles.mainContent}>
          <IntegrationOptionsSection />
          <SeeItInActionSection />
          <VulnerabilityTypesSection />
          <ProofBannerSection />
          <BenefitsSection />
          <CallToActionSection />
        </main>
      </div>
    </Layout>
  );
}
