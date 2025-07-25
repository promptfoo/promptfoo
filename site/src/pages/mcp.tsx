import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../components/LogoContainer';
import MCPProxyDiagram from '../components/McpProxyDiagram';
import NewsletterForm from '../components/NewsletterForm';
import styles from './mcp.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img src="/img/mcp-proxy-dashboard.png" alt="MCP Proxy" className={styles.heroImage} />
        <div className={styles.logoSection}>
          Promptfoo is trusted by teams at...
          <LogoContainer noBackground noBorder />
        </div>
      </div>
    </section>
  );
}

function McpHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className={styles.heroTitle}>Enterprise MCP Proxy</h1>
        <p className={styles.heroSubtitle}>
          Secure, monitor, and control Model Context Protocol servers in your organization
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

function BenefitsSection() {
  return (
    <section className={styles.benefitsSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Why choose our MCP proxy?</h2>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <SecurityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Whitelist approved MCP servers</h3>
              <p>
                Control which MCP servers can be accessed across your organization. Only approved,
                vetted servers are allowed, preventing unauthorized tool access and data exposure.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <AdminPanelSettingsIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Granular access control</h3>
              <p>
                Grant specific MCP server access to individual applications and users based on their
                needs. Ensure each application and user only has access to the tools and data it
                requires.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <VisibilityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Real-time monitoring & alerts</h3>
              <p>
                Monitor MCP interactions in real-time with special focus on PII and sensitive data
                exposure. Get instant alerts when suspicious activity is detected.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <VerifiedUserIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Centralized security management</h3>
              <p>
                Manage all MCP security policies from a single dashboard. Audit logs, access
                controls, and security policies are centralized for easy governance.
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
        <h2>Secure MCP server management</h2>
        <p>
          Our MCP proxy sits between your users and AI applications and MCP servers, providing
          enterprise-grade security, monitoring, and access control.
        </p>
        <MCPProxyDiagram />
      </div>
    </section>
  );
}

function SecurityMonitoringSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2>Comprehensive MCP Activity Monitoring</h2>
        <p>
          Track all MCP requests with detailed logging and real-time alerts for sensitive data
          exposure, unauthorized access attempts, and policy violations.
        </p>
        <div className={styles.screenshotPlaceholder}>
          <img loading="lazy" src="/img/mcp-alert-details.png" alt="MCP activity monitoring" />
        </div>
      </div>
    </section>
  );
}

function CallToActionSection() {
  return (
    <section className={styles.callToActionSection}>
      <div className="container">
        <h2>Secure your MCP integrations today</h2>
        <p>
          Don't let untrusted MCP servers compromise your AI applications and users. Deploy our
          enterprise MCP proxy and take control of your AI tool ecosystem.
        </p>
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

export default function Mcp(): JSX.Element {
  return (
    <Layout
      title="MCP Proxy"
      description="Enterprise-grade MCP proxy for secure AI tool integration. Whitelist approved MCP servers, grant granular permissions, and monitor for PII and sensitive data exposure."
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/mcp.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <McpHeader />
        <main className={styles.mainContent}>
          <ActionOrientedSection />
          <SecurityMonitoringSection />
          <BenefitsSection />
          <CallToActionSection />
          <NewsletterForm />
        </main>
      </div>
    </Layout>
  );
}
