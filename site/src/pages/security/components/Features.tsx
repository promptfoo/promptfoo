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
    image: '/img/riskreport-1.png',
    infoLink: '/assessment-details',
    infoLinkText: 'Learn what sets our scans apart',
  },
  {
    icon: <SearchIcon className={styles.featureIcon} />,
    title: 'Advanced Vulnerability Detection',
    description:
      'Uncover hidden risks with our 30+ configurable plugins, identifying issues that standard guardrails miss.',
    image: '/img/riskreport-2.png',
    infoLink: '/vulnerability-detection',
    infoLinkText: 'See why we are the most comprehensive',
  },
  {
    icon: <SecurityIcon className={styles.featureIcon} />,
    title: 'Guided Mitigation',
    description:
      'Manage issues and receive actionable recommendations to address vulnerabilities, ensuring compliance with OWASP, NIST, and EU AI standards.',
    image: '/img/remediation.png',
    infoLink: '/mitigation-guide',
    infoLinkText: 'Explore our mitigation strategies',
  },
  {
    icon: <TimelineIcon className={styles.featureIcon} />,
    title: 'Continuous Monitoring',
    description:
      'Integrate with your CI/CD pipeline for ongoing risk assessment, catching new vulnerabilities before they reach production.',
    image: '/img/continuous-monitoring.png',
    infoLink: '/continuous-monitoring',
    infoLinkText: 'Discover the benefits of ongoing assessment',
  },
];

export default function Features(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.featuresSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <p className={styles.featuresSummary}>
          Promptfoo provides a comprehensive solution for managing LLM vulnerabilities throughout
          your development lifecycle.
        </p>
        <div className={styles.featuresTimeline}>
          {features.map((feature, index) => (
            <div
              key={index}
              className={`${styles.featureItem} ${index % 2 === 0 ? styles.featureLeft : styles.featureRight}`}
            >
              <div className={styles.featureIconWrapper}>{feature.icon}</div>
              <div className={styles.featureContent}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <a href={feature.infoLink} className={styles.featureInfoLink}>
                  {feature.infoLinkText}
                </a>
              </div>
              <div className={styles.featureImageWrapper}>
                <img src={feature.image} alt={feature.title} className={styles.featureImage} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
