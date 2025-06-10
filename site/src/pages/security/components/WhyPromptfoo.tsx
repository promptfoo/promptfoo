import React from 'react';
import GroupIcon from '@mui/icons-material/Group';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import styles from '../styles.module.css';

const reasons = [
  {
    icon: <SecurityIcon className={styles.statIcon} />,
    stat: '30+',
    title: 'Security Plugins',
    description: 'Comprehensive coverage for all aspects of LLM security',
  },
  {
    icon: <SpeedIcon className={styles.statIcon} />,
    stat: '100%',
    title: 'On-Premises',
    description: 'Full control with local deployment options',
  },
  {
    icon: <GroupIcon className={styles.statIcon} />,
    stat: '200+',
    title: 'Companies',
    description: 'Trust Promptfoo for LLM security & testing',
  },
];

export default function WhyPromptfoo(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.whyPromptfooSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Why Promptfoo Leads in LLM Security</h2>
        <div className={styles.statsGrid}>
          {reasons.map((reason, index) => (
            <div key={index} className={styles.statItem}>
              {reason.icon}
              <div className={styles.statNumber}>{reason.stat}</div>
              <h3 className={styles.statTitle}>{reason.title}</h3>
              <p className={styles.statDescription}>{reason.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
