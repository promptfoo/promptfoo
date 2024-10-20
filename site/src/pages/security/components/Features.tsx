import React from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import TimelineIcon from '@mui/icons-material/Timeline';
import styles from '../styles.module.css';

const features = [
  {
    icon: <AssessmentIcon className={styles.featureIcon} />,
    title: 'Comprehensive Assessment',
    description:
      'Analyze your LLM application with dynamic adversarial tests tailored to your specific use case and architecture.',
  },
  {
    icon: <SearchIcon className={styles.featureIcon} />,
    title: 'Advanced Vulnerability Detection',
    description:
      'Uncover hidden risks with our 30+ configurable plugins, identifying issues that standard guardrails miss.',
  },
  {
    icon: <SecurityIcon className={styles.featureIcon} />,
    title: 'Guided Mitigation',
    description:
      'Receive actionable recommendations to address vulnerabilities, ensuring compliance with OWASP, NIST, and EU AI standards.',
  },
  {
    icon: <TimelineIcon className={styles.featureIcon} />,
    title: 'Continuous Monitoring',
    description:
      'Integrate with your CI/CD pipeline for ongoing risk assessment, catching new vulnerabilities before they reach production.',
  },
];

export default function Features(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.featuresSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>End-to-End LLM Security Workflow</h2>
        <p className={styles.featuresSummary}>
          Promptfoo provides a comprehensive solution for managing LLM vulnerabilities throughout
          your development lifecycle.
        </p>
        <div className={styles.featuresTimeline}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureItem}>
              <div className={styles.featureIconWrapper}>{feature.icon}</div>
              <div className={styles.featureContent}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
