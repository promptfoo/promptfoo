import React, { useEffect, useState } from 'react';
// Import Swiper React components
import { Swiper, SwiperSlide } from 'swiper/react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BugReportIcon from '@mui/icons-material/BugReport';
import CodeIcon from '@mui/icons-material/Code';
import ReportIcon from '@mui/icons-material/Report';
import SecurityIcon from '@mui/icons-material/Security';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { Navigation, Pagination } from 'swiper/modules';
import LogoContainer from '../components/LogoContainer';
import NewsletterForm from '../components/NewsletterForm';
import { SITE_CONSTANTS } from '../constants';
import styles from './landing-page.module.css';
import 'swiper/css';

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
          Promptfoo is trusted by teams at...
          <LogoContainer noBackground noBorder className={styles.heroLogos} />
        </div>
        <h2>Move beyond fuzzing and canned attacks</h2>
        <p>Our agentic red teamers specifically target your application use case.</p>
      </div>
    </section>
  );
}

function RedTeamingHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className={styles.heroTitle}>Red Teaming for AI Applications</h1>
        <p className={styles.heroSubtitle}>
          The most widely adopted platform for LLM security testing
        </p>
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
            <h3>Prompt Injection & Jailbreaking</h3>
            <p>
              Prevent attackers from bypassing safety guardrails or manipulating your AI system.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>RAG Document Exfiltration</h3>
            <p>
              Detect and prevent attackers from extracting sensitive documents from your knowledge
              base.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>System Prompt Override</h3>
            <p>
              Protect against techniques that can manipulate your AI to ignore or override its core
              instructions.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>Malicious Resource Fetching</h3>
            <p>
              Prevent server-side request forgery (SSRF) attacks that trick your AI into accessing
              unauthorized resources.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>Data Privacy & PII Leaks</h3>
            <p>
              Protect sensitive personal information across sessions, APIs, and direct interactions.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>Harmful Content Generation</h3>
            <p>Block illegal, toxic, or dangerous content across dozens of risk categories.</p>
          </div>
          <div className={styles.featureItem}>
            <h3>Unauthorized Data Access</h3>
            <p>
              Prevent broken object level authorization (BOLA) vulnerabilities that expose data to
              unauthorized users.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>Tool & Function Discovery</h3>
            <p>
              Stop attackers from discovering and exploiting AI system capabilities and
              integrations.
            </p>
          </div>
          <div className={styles.featureItem}>
            <h3>Unsupervised Contracts</h3>
            <p>Prevent your AI from creating unauthorized business or legal commitments.</p>
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
        <h2 className={styles.sectionTitle}>Why choose Promptfoo for red teaming?</h2>
        <div className={styles.benefitsList}>
          <div className={styles.benefitItem}>
            <SecurityIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Battle-tested with wide industry adoption</h3>
              <p>
                Used by foundation model labs, Fortune 50 enterprises, and{' '}
                {SITE_CONSTANTS.USER_COUNT_DISPLAY} open source users - we're the closest thing to
                an industry standard tool for AI security testing.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <BugReportIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Custom attack generation</h3>
              <p>
                Unlike static jailbreaks, our agents are trained with the latest ML techniques to
                generate dynamic attacks tailored to your application.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <ReportIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Detailed vulnerability reports with remediations</h3>
              <p>
                Get comprehensive analysis of vulnerabilities with actionable remediation steps.
              </p>
            </div>
          </div>
          <div className={styles.benefitItem}>
            <AutorenewIcon className={styles.benefitIcon} />
            <div className={styles.benefitContent}>
              <h3>Continuous monitoring</h3>
              <p>
                Integrate with CI/CD pipelines or run on a schedule to maintain a complete timeline
                of your risk posture as your application evolves.
              </p>
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
  const [domLoaded, setDomLoaded] = useState(false);

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  const steps = [
    {
      number: 1,
      title: 'Tell us about your application',
      image: '/img/application-details-framed.png',
    },
    {
      number: 2,
      title: 'Our models generate application-specific attacks',
      image: '/img/riskreport-2-framed.png',
    },
    {
      number: 3,
      title: 'Receive detailed vulnerability reports',
      image: '/img/risk-assessment-framed.png',
    },
    {
      number: 4,
      title: 'Review and apply remediations',
      image: '/img/vulnerability-list-framed.png',
    },
  ];

  return (
    <section className={`${styles.actionOrientedSection} ${styles.carouselWrapper}`}>
      <div className={`container ${styles.carouselContainer}`}>
        <h2>We implement the latest ML research so you don't have to</h2>
        <p>
          Stay on top of the latest attack vectors and vulnerabilities through our simple interface.
        </p>

        {domLoaded && (
          <div className={styles.processCarousel}>
            <Swiper
              modules={[Navigation, Pagination]}
              spaceBetween={20}
              slidesPerView={1.3}
              centeredSlides={true}
              loop={false}
              navigation
              pagination={{ clickable: true }}
              className={styles.swiper}
              breakpoints={{
                480: {
                  slidesPerView: 1.1,
                  spaceBetween: 15,
                },
                640: {
                  slidesPerView: 1.2,
                  spaceBetween: 20,
                },
                768: {
                  slidesPerView: 1.3,
                  spaceBetween: 25,
                },
                1024: {
                  slidesPerView: 1.5,
                  spaceBetween: 30,
                },
                1280: {
                  slidesPerView: 1.8,
                  spaceBetween: 40,
                },
              }}
            >
              {steps.map((step) => (
                <SwiperSlide key={step.number} className={styles.swiperSlide}>
                  <div className={styles.slideContent}>
                    <div className={styles.stepNumber}>{step.number}</div>
                    <h3 className={styles.slideTitle}>{step.title}</h3>
                    <div className={styles.slideImageContainer}>
                      <img src={step.image} alt={step.title} className={styles.slideImage} />
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}
      </div>
    </section>
  );
}

function ContinuousMonitoringSection() {
  return (
    <section className={styles.actionOrientedSection}>
      <div className="container">
        <h2>Continuous Monitoring</h2>
        <p>Detect and respond to new vulnerabilities as they emerge with real-time monitoring.</p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/continuous-monitoring-framed.png"
            alt="Continuous monitoring dashboard"
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
        <p>Enforce compliance with industry frameworks and standards.</p>
        <div className={styles.screenshotPlaceholder}>
          <img
            loading="lazy"
            src="/img/compliance-frameworks.png"
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
          <ContinuousMonitoringSection />
          <ComplianceSection />
          <DifferentiatorsSection />
          <CallToActionSection />
          <NewsletterForm />
        </main>
      </div>
    </Layout>
  );
}
