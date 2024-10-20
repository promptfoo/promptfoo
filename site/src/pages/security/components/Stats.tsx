import React from 'react';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BugReportIcon from '@mui/icons-material/BugReport';
import styles from '../styles.module.css';

const stats = [
  {
    icon: <AccessTimeIcon className={styles.statIcon} />,
    number: '678+',
    title: 'Hours Saved',
    description: 'On average compared to manual red teaming',
  },
  {
    icon: <BugReportIcon className={styles.statIcon} />,
    number: '82%',
    title: 'Unique findings',
    description: 'Not caught by guardrails',
  },
  {
    icon: <BugReportIcon className={styles.statIcon} />,
    number: '37',
    title: 'Issues Found',
    description: 'On average on the first scan',
  },
];

export default function Stats(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.statsSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>
          Detect LLM vulnerabilities <em>before</em> deployment
        </h2>
        {/*
        <p className={styles.statsSummary}>
          Uncover vulnerabilities in your LLM systems <em>before</em> deployment
        </p>
        */}
        <div className={styles.statsGrid}>
          {stats.map((stat, index) => (
            <div key={index} className={styles.statItem}>
              {stat.icon}
              <div className={styles.statNumber}>{stat.number}</div>
              <h3 className={styles.statTitle}>{stat.title}</h3>
              <p className={styles.statDescription}>{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
