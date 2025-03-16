import React from 'react';
import Link from '@docusaurus/Link';
import CheckIcon from '@mui/icons-material/Check';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './pricing.module.css';

function PricingHeader() {
  return (
    <header className={styles.pricingHeader}>
      <h1>LLM security and testing for teams of all sizes</h1>
      <p>Choose the plan that's right for your team</p>
    </header>
  );
}

function PricingTable() {
  const plans = [
    {
      name: 'Community',
      price: 'Free Forever',
      description: 'Our open-source tool, perfect for individual developers and small teams',
      features: [
        'All LLM evaluation features',
        'All model providers and integrations',
        'No usage limits',
        'Custom integration with your own app',
        //'Data visualizations',
        //'Dataset generation',
        //'Run locally on your machine',
        'Run locally or self-host on your own infrastructure',
        'Vulnerability scanning',
        'Community support',
      ],
      cta: 'Get Started',
      ctaLink: '/docs/intro/',
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: 'For teams that need advanced features and cloud-based support',
      features: [
        'All Community features',
        'Team sharing & collaboration',
        'Continuous monitoring',
        'Centralized security/compliance dashboard',
        'Customized red teaming plugins',
        'SSO and Access Control',
        'Cloud deployment',
        'Priority support & SLA guarantees',
      ],
      cta: 'Schedule Demo',
      ctaLink: 'https://cal.com/team/promptfoo/intro2',
      highlighted: true,
    },
    {
      name: 'On-Premise',
      price: 'Custom',
      description: 'For organizations that require full control over their infrastructure',
      features: [
        'All Enterprise features',
        'Deployment on your own infrastructure',
        'Complete data isolation',
        'Dedicated support team',
      ],
      cta: 'Contact Us',
      ctaLink: '/contact/',
      highlighted: false,
    },
  ];

  return (
    <div className={styles.pricingTableContainer}>
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={clsx(styles.pricingCard, plan.highlighted && styles.highlightedCard)}
        >
          <div className={styles.cardContent}>
            <h2>{plan.name}</h2>
            <div className={styles.price}>{plan.price}</div>
            <p className={styles.description}>{plan.description}</p>
            <ul className={styles.featureList}>
              {plan.features.map((feature, index) => (
                <li key={index}>
                  <CheckIcon className={styles.checkIcon} />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <Link
            to={plan.ctaLink}
            className={clsx(
              'button',
              'button--lg',
              plan.highlighted ? 'button--primary' : 'button--secondary',
              styles.ctaButton,
            )}
          >
            {plan.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}

function EnterpriseFeatures() {
  const features = [
    {
      title: 'Reports & Continuous Monitoring',
      description:
        'Understand your LLM security status across all projects with real-time alerts and automated evaluations.',
      image: '/img/continuous-monitoring@2x.png',
    },
    {
      title: 'Issue Tracking & Guided Remediation',
      description: 'Track remediation progress and get suggested steps for each issue.',
      image: '/img/riskreport-2@2x.png',
    },
    {
      title: 'Comprehensive Scanning & Compliance',
      description:
        'Additional plugins, help with creating custom plugins, and support for common standards frameworks.',
      image: '/img/report-with-compliance@2x.png',
    },
  ];

  return (
    <section className={styles.enterpriseFeaturesSection}>
      <h2>Enterprise Features</h2>
      {features.map((feature, index) => (
        <div key={index} className={clsx(styles.featureRow, index % 2 === 1 && styles.reverse)}>
          <div className={styles.featureContent}>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
          <div className={styles.featureImageWrapper}>
            <img src={feature.image} alt={feature.title} className={styles.featureImage} />
          </div>
        </div>
      ))}
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      question: `What's included in the Community version?`,
      answer: `The Community version includes all core features for local testing, evaluation, and vulnerability scanning.`,
    },
    {
      question: 'Who needs the Enterprise version?',
      answer:
        'Larger teams and organizations that want to continuously monitor risk in development and production.',
    },
    {
      question: 'How does Enterprise pricing work?',
      answer: `Enterprise pricing is customized based on your team's size and needs. Contact us for a personalized quote.`,
    },
    {
      question: 'Can I upgrade from Community to Enterprise?',
      answer:
        'Yes, you can easily upgrade to Enterprise at any time to access additional features and support.',
    },
  ];

  return (
    <section className={styles.faqSection}>
      <h2>Frequently Asked Questions</h2>
      <div className={styles.faqGrid}>
        {faqs.map((faq, index) => (
          <div key={index} className={styles.faqItem}>
            <h3>{faq.question}</h3>
            <p>{faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Pricing(): JSX.Element {
  return (
    <Layout
      title="Pricing"
      description="Choose the right solution for your team. Compare our Community (free, open-source) and Enterprise offerings."
    >
      <main className={styles.pricingPage}>
        <PricingHeader />
        <PricingTable />
        <EnterpriseFeatures />
        <FAQSection />
      </main>
    </Layout>
  );
}
