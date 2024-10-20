import React from 'react';
import styles from '../styles.module.css';

const features = [
  {
    title: 'Automated Red Teaming',
    description:
      "Dynamic adversarial tests specific to your application's use case and architecture.",
  },
  {
    title: 'End-to-End Risk Measurement',
    description: 'Ensure security, privacy, and compliance across your entire LLM stack.',
  },
  {
    title: 'Framework Alignment',
    description: 'Ensure compliance with OWASP, NIST, MITRE, and EU AI standards.',
  },
  {
    title: 'Comprehensive Protection',
    description: 'Scan with 30+ configurable plugins for various vulnerabilities and threats.',
  },
  {
    title: 'Continuous Monitoring',
    description: 'Integrate with CI/CD pipelines to catch vulnerabilities before production.',
  },
  {
    title: 'Guided Remediations',
    description: 'Accelerate issue resolution with actionable recommendations.',
  },
];

export default function Features(): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Comprehensive Security Features</h2>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureItem}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
