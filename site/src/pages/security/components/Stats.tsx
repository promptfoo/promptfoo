import React from 'react';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BugReportIcon from '@mui/icons-material/BugReport';
import Tooltip from '@mui/material/Tooltip';
import styles from '../styles.module.css';

const stats = [
  {
    icon: <AccessTimeIcon className={styles.statIcon} />,
    number: '678+',
    title: 'Hours Saved',
    description: 'On average compared to manual red teaming',
    tooltip: 'Using multiturn and iterative testing methods, 1 minute per attempt',
  },
  {
    icon: <BugReportIcon className={styles.statIcon} />,
    number: '82%',
    title: 'Unique findings',
    description: 'Not caught by guardrails',
    tooltip: 'Comparison with popular guardrail over 2,064 test cases',
  },
  {
    icon: <BugReportIcon className={styles.statIcon} />,
    number: '37',
    title: 'Issues Found',
    description: 'On average on the first scan',
    tooltip: 'Based on red teams performed on diverse industry use cases',
  },
];

export default function Stats(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.statsSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>
          Detect LLM vulnerabilities <em>before</em> deployment
        </h2>
        <div className={styles.statsGrid}>
          {stats.map((stat, index) => (
            <div key={index} className={styles.statItem}>
              {stat.icon}
              <div className={styles.statNumber}>{stat.number}</div>
              <h3 className={styles.statTitle}>{stat.title}</h3>
              <p className={styles.statDescription}>
                <Tooltip title={stat.tooltip} enterDelay={1000} enterNextDelay={1000} arrow>
                  <span>{stat.description}</span>
                </Tooltip>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
