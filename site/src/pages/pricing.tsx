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
      <p>Choose the plan that's right for your team.</p>
    </header>
  );
}

function PricingTable() {
  const plans = [
    {
      name: 'Community',
      price: 'Free Forever',
      description: 'Our open-source tool, perfect for individual developers and small teams.',
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
      description: (
        <>
          For teams that need advanced features. <Link to="/docs/enterprise/">Learn more</Link>
        </>
      ),
      features: [
        'All Community features',
        'Team sharing & collaboration',
        'Continuous monitoring',
        'Centralized security/compliance dashboard',
        'Customizable scan templates and target settings',
        'SSO and granular permission profiles',
        'Promptfoo API access',
        'Managed cloud deployment',
        'Professional services support',
        'Priority support & SLA guarantees',
      ],
      cta: 'Schedule Demo',
      ctaLink: 'https://cal.com/team/promptfoo/intro2',
      highlighted: true,
    },
    {
      name: 'On-Premise',
      price: 'Custom',
      description: 'For organizations that require full control over their infrastructure.',
      features: [
        'All Enterprise features',
        'Deployment on your own infrastructure',
        'Complete data isolation',
        'Dedicated runner',
        'Assigned deployment engineer',
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

function FeatureComparisonTable() {
  const features = [
    {
      category: 'Security & Testing',
      items: [
        {
          name: 'LLM evaluation capabilities',
          community: true,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Basic vulnerability scanning',
          community: true,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Advanced vulnerability detection',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Remediation recommendations',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Centralized guardrail dashboard',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Customized red teaming plugins',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Organization-specific scan templates',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Saved target configurations',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Searchable scan history',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
      ],
    },
    {
      category: 'Team & Collaboration',
      items: [
        {
          name: 'Teams-based access control and SSO',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Team sharing & collaboration',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Custom roles & permissions',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Centralized dashboard',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
      ],
    },
    {
      category: 'Integrations',
      items: [
        { name: 'CI/CD integration', community: true, enterprise: true, enterpriseOnPrem: true },
        {
          name: 'Promptfoo API integration',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        { name: 'Webhooks', community: false, enterprise: true, enterpriseOnPrem: true },
      ],
    },
    {
      category: 'Infrastructure',
      items: [
        { name: 'Cloud deployment', community: false, enterprise: true, enterpriseOnPrem: false },
        {
          name: 'On-premise deployment',
          community: false,
          enterprise: false,
          enterpriseOnPrem: true,
        },
        {
          name: 'Complete data isolation',
          community: false,
          enterprise: false,
          enterpriseOnPrem: true,
        },
      ],
    },
    {
      category: 'Support & Services',
      items: [
        { name: 'Community support', community: true, enterprise: true, enterpriseOnPrem: true },
        {
          name: 'Priority support & SLA guarantees',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Dedicated support team',
          community: false,
          enterprise: true,
          enterpriseOnPrem: true,
        },
        {
          name: 'Dedicated deployment engineer',
          community: false,
          enterprise: false,
          enterpriseOnPrem: true,
        },
      ],
    },
  ];

  return (
    <section className={styles.comparisonSection}>
      <h2>Feature Comparison</h2>
      <div className={styles.tableWrapper}>
        <table className={styles.comparisonTable}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Community</th>
              <th>Enterprise</th>
              <th>Enterprise On-Premise</th>
            </tr>
          </thead>
          <tbody>
            {features.map((featureGroup, groupIndex) => (
              <React.Fragment key={groupIndex}>
                <tr className={styles.categoryRow}>
                  <td colSpan={4}>{featureGroup.category}</td>
                </tr>
                {featureGroup.items.map((feature, featureIndex) => (
                  <tr key={featureIndex}>
                    <td>{feature.name}</td>
                    <td className={styles.centerCell}>
                      {feature.community ? <CheckIcon className={styles.checkIcon} /> : '—'}
                    </td>
                    <td className={styles.centerCell}>
                      {feature.enterprise ? <CheckIcon className={styles.checkIcon} /> : '—'}
                    </td>
                    <td className={styles.centerCell}>
                      {feature.enterpriseOnPrem ? <CheckIcon className={styles.checkIcon} /> : '—'}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnterpriseFeatures() {
  const features = [
    {
      title: 'Reports & Continuous Monitoring',
      description:
        'Understand your LLM security status across all projects with real-time alerts and automated evaluations.',
      image: '/img/continuous-monitoring-framed.png',
    },
    {
      title: 'Issue Tracking & Guided Remediation',
      description: 'Track remediation progress and get suggested steps for each issue.',
      image: '/img/vulnerability-list-framed.png',
    },
    {
      title: 'Comprehensive Scanning & Compliance',
      description: 'Verify compliance with industry frameworks and standards.',
      image: '/img/compliance-frameworks.png',
    },
    {
      title: 'Organization-Specific Configurations',
      description:
        'Create customizable plugin collections, scan configurations, and target settings that can be shared among colleagues.',
      image: '/img/enterprise-docs/create-plugin-collection.gif',
    },
    {
      title: 'Teams-Based Controls',
      description:
        'Manage your LLM applications with teams-based access control and SSO, granular permission profiles, and customizable API access.',
      image: '/img/enterprise-docs/add-team-members.png',
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

function DemoCTA() {
  return (
    <section className={styles.demoCTA}>
      <h2>Ready to get started?</h2>
      <p>Schedule a demo to see how Promptfoo can help secure your LLM applications.</p>
      <Link
        to="https://cal.com/team/promptfoo/intro2"
        className={clsx('button', 'button--lg', 'button--primary', styles.demoButton)}
      >
        Schedule a Demo
      </Link>
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
        <FeatureComparisonTable />
        <FAQSection />
        <DemoCTA />
      </main>
    </Layout>
  );
}
