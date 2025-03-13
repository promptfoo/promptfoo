import React from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import TimelineIcon from '@mui/icons-material/Timeline';
import dedent from 'dedent';
import styles from '../styles.module.css';

const features = [
  {
    icon: <AssessmentIcon className={styles.featureIcon} />,
    title: 'Adaptive Scans',
    description: dedent`
      Our LLM models generate thousands of dynamic probes tailored to your specific use case and architecture, outperforming generic fuzzing and guardrails.
    `,
    image: '/img/riskreport-1.png',
    infoLink: '/docs/red-team/quickstart/',
    infoLinkText: 'See how scans work',
  },
  {
    icon: <TimelineIcon className={styles.featureIcon} />,
    title: 'Continuous Monitoring',
    description: dedent`
      Integrate with your CI/CD pipeline for ongoing risk assessment, catching new vulnerabilities before they reach production.
    `,
    image: '/img/continuous-monitoring.png',
    //infoLink: '/continuous-monitoring',
    //infoLinkText: 'Discover the benefits of ongoing assessment',
  },
  {
    icon: <SecurityIcon className={styles.featureIcon} />,
    title: 'Guided Mitigation',
    description: dedent`
      Manage issues, track progress, and receive actionable recommendations to address vulnerabilities.
    `,
    image: '/img/issues.png',
    //infoLink: '/docs/red-team/',
    //infoLinkText: 'Learn about red teaming',
  },
  {
    icon: <SearchIcon className={styles.featureIcon} />,
    title: 'Comprehensive Coverage',
    description: dedent`
      Cover 30+ areas of harm including prompt injections, jailbreaks, data/PII leaks, and bias/toxicity. 
      
      Adhere to OWASP, NIST, and EU AI frameworks, or create custom policies to enforce your own organizational standards.
    `,
    image: '/img/riskreport-2.png',
    infoLink: '/docs/red-team/llm-vulnerability-types/',
    infoLinkText: 'View supported vulnerability and harm types',
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
                <p>
                  {feature.description.split('\n').map((line, index) => (
                    <React.Fragment key={index}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </p>
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
