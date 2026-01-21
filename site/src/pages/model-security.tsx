import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ScannerIcon from '@mui/icons-material/DocumentScanner';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import LogoContainer from '../components/LogoContainer';
import styles from './landing-page.module.css';

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <img
          src="/img/model-ranking-framed.png"
          alt="Model Security Reports"
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

function ModelSecurityHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Complete AI model security</h1>
          <p className={styles.heroSubtitle}>
            End-to-end protection from model files to deployed instances
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.buttonPrimary)}
              to="/contact/"
            >
              Request Demo
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
              to="/docs/model-audit/"
            >
              Try Model Scanner
            </Link>
          </div>
        </div>
      </div>
      <HeroSection />
    </header>
  );
}

function ComprehensiveApproachSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>COMPREHENSIVE PROTECTION</div>
        <h2 className={styles.sectionTitle}>Secure Models from Files to Deployment</h2>
        <p className={styles.sectionSubtitle}>
          Test open-weight and proprietary models for security vulnerabilities and backdoors.
        </p>

        <div className={styles.securityFlowContainer}>
          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <ScannerIcon fontSize="large" />
            </div>
            <h3>1. Model File Security</h3>
            <p>Analyze model files for security risks before deployment</p>
            <ul>
              <li>Detect malicious code or backdoors</li>
              <li>Identify risky model configurations</li>
              <li>Flag suspicious operations</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <p>
                <strong>Supported:</strong> PyTorch, TensorFlow, Keras, Pickle, JSON/YAML
              </p>
              <Link to="/docs/model-audit/" className="button button--secondary button--sm">
                Learn More
              </Link>
            </div>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <SecurityIcon fontSize="large" />
            </div>
            <h3>2. Behavioral Testing</h3>
            <p>Verify model behavior against advanced security threats</p>
            <ul>
              <li>Test against jailbreaks and injections</li>
              <li>Simulate real-world attacks</li>
              <li>Evaluate resilience under stress</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <p>
                <strong>Works with:</strong> Any foundation or fine-tuned model
              </p>
              <Link
                to="/docs/red-team/foundation-models/"
                className="button button--secondary button--sm"
              >
                Learn More
              </Link>
            </div>
          </div>

          <div className={styles.securityFlowArrow}>→</div>

          <div className={styles.securityFlowStep}>
            <div className={styles.approachIcon}>
              <AssessmentIcon fontSize="large" />
            </div>
            <h3>3. Compliance Mapping</h3>
            <p>Generate comprehensive compliance reports</p>
            <ul>
              <li>Map to regulatory frameworks</li>
              <li>Create custom compliance policies</li>
              <li>Document security posture</li>
            </ul>
            <div className={styles.capabilityDetails}>
              <p>
                <strong>Built-in:</strong> OWASP, NIST, EU AI Act, MITRE, custom
              </p>
              <Link
                to="/docs/red-team/owasp-llm-top-10/"
                className="button button--secondary button--sm"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComplianceFrameworksSection() {
  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>COMPLIANCE FRAMEWORKS</div>
        <h2 className={styles.sectionTitle}>Comprehensive Framework Coverage</h2>
        <p className={styles.sectionSubtitle}>
          Built-in support for major security and compliance frameworks
        </p>
        <div className={styles.features}>
          <div className={styles.featureItem}>
            <h3>OWASP Top 10 for LLMs</h3>
            <p>Map vulnerabilities directly to the OWASP Top 10 for Large Language Models.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>NIST AI RMF</h3>
            <p>Ensure compliance with the NIST AI Risk Management Framework requirements.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>EU AI Act</h3>
            <p>Prepare for compliance with the European Union's AI regulations.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>MITRE ATLAS</h3>
            <p>Check against the MITRE ATLAS framework for AI threat landscapes.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Regulatory Alignment</h3>
            <p>Introduce regulatory requirements specific to your industry.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Custom Policies</h3>
            <p>Create custom compliance policies for your industry or organization.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SecurityAssessmentSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>UNIFIED WORKFLOW</div>
        <h2 className={styles.sectionTitle}>Complete AI Model Security Assessment</h2>
        <p className={styles.sectionSubtitle}>
          A unified workflow to identify, test, and document all aspects of your AI model security
        </p>
        <div className={styles.securityAssessmentSteps}>
          <div className={styles.assessmentStep}>
            <h3>File-level security screening</h3>
            <div className={styles.screenshotPlaceholder}>
              <img
                loading="lazy"
                src="/img/docs/modelaudit/modelaudit-result.png"
                alt="Model scanner results"
              />
            </div>
            <p>Detect malicious code and suspicious operations before deployment</p>
          </div>

          <div className={styles.assessmentStep}>
            <h3>Behavioral security testing</h3>
            <div className={styles.screenshotPlaceholder}>
              <img
                loading="lazy"
                src="/img/foundationmodel-highlevelreport.png"
                alt="Foundation model security report"
              />
            </div>
            <p>Verify model behavior against real-world attack scenarios</p>
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
        <div className={styles.sectionEyebrow}>KEY BENEFITS</div>
        <h2 className={styles.sectionTitle}>Why choose our unified security platform?</h2>
        <p className={styles.sectionSubtitle}>
          Complete lifecycle protection with seamless integration and compliance mapping
        </p>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <ShieldIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Complete AI lifecycle protection</h3>
              <p>
                The only platform that secures models from development through deployment with a
                seamless, integrated security workflow.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <AssessmentIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Universal compliance mapping</h3>
              <p>
                Automatically map security findings to any framework (OWASP, NIST, EU AI Act, MITRE)
                or create custom policies for your organization.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <IntegrationInstructionsIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Enterprise-ready integration</h3>
              <p>
                Seamlessly fits into your existing AI pipeline with CI/CD support, API integration,
                and team collaboration features.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <MonitorHeartIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>AI model risk intelligence</h3>
              <p>
                Compare security across models, track improvement over time, and make data-driven
                decisions about your AI ecosystem.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <div className={styles.sectionEyebrow}>MODEL BENCHMARKING</div>
        <h2 className={styles.sectionTitle}>Compare and Benchmark Foundation Models</h2>
        <p className={styles.sectionSubtitle}>
          Run side-by-side security assessments of different models to identify the most secure
          option for your requirements.
        </p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/foundationmodelreport-comparison.png"
            alt="Model comparison dashboard"
          />
        </div>
      </div>
    </section>
  );
}

function CallToActionSection() {
  return (
    <section className={styles.finalCTA}>
      <div className="container">
        <h2 className={styles.finalCTATitle}>Get complete AI model security coverage</h2>
        <p className={styles.finalCTASubtitle}>
          Protect your entire AI pipeline with comprehensive security from model files to deployed
          instances.
        </p>
        <div className={styles.finalCTAButtons}>
          <Link className="button button--primary button--lg" to="/contact/">
            Request Demo
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
            to="/docs/model-audit/"
          >
            Try Model Scanner Free
          </Link>
        </div>
        <div className={styles.finalCTATrust}>
          <p>✓ File-level scanning • ✓ Behavioral testing • ✓ Framework compliance</p>
        </div>
      </div>
    </section>
  );
}

export default function ModelSecurity(): React.ReactElement {
  return (
    <Layout
      title="AI Model Security"
      description="Complete AI model security platform that protects your entire AI pipeline - from model files to deployed systems - with a unified security assessment workflow."
    >
      <Head>
        <meta property="og:image" content="https://www.promptfoo.dev/img/meta/model-security.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <div className={styles.pageContainer}>
        <ModelSecurityHeader />
        <main className={styles.mainContent}>
          <ComprehensiveApproachSection />
          <ComplianceFrameworksSection />
          <SecurityAssessmentSection />
          <ComparisonSection />
          <BenefitsSection />
          <CallToActionSection />
        </main>
      </div>
    </Layout>
  );
}
