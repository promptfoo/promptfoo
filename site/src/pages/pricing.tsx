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
      description: 'For teams that need advanced features and support',
      features: [
        'All Community features',
        'Team sharing & collaboration',
        'Continuous monitoring',
        'Centralized security/compliance dashboard',
        'Customized red teaming plugins',
        'SSO and Access Control',
        'On-premises or private cloud deployment',
        'Priority support & SLA guarantees',
      ],
      cta: 'Schedule Demo',
      ctaLink: 'https://cal.com/team/promptfoo/intro2',
      highlighted: true,
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
        <FAQSection />
      </main>
    </Layout>
  );
}
