import React from 'react';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BugReportIcon from '@mui/icons-material/BugReport';
import SearchIcon from '@mui/icons-material/Search';
import Tooltip from '@mui/material/Tooltip';
import styles from '../styles.module.css';

const stats = [
  {
    icon: <BugReportIcon className={styles.statIcon} />,
    number: '37',
    title: 'Issues found & remediated',
    description: 'Average on the first scan',
    tooltip: 'Based on red teams performed on diverse industry use cases',
  },
  {
    icon: <AccessTimeIcon className={styles.statIcon} />,
    number: '14',
    title: 'Minutes',
    description: 'Average scan duration',
    tooltip: 'Using multiturn and iterative testing methods, 1 minute per attempt',
  },
  /*
  {
    icon: <AccessTimeIcon className={styles.statIcon} />,
    number: '678+',
    title: 'Hours saved',
    description: 'On average compared to manual red teaming',
    tooltip: 'Using multiturn and iterative testing methods, 1 minute per attempt',
  },
  */
  {
    icon: <SearchIcon className={styles.statIcon} />,
    number: '82%',
    title: 'Unique findings',
    description: 'Not caught by guardrails',
    tooltip: 'Comparison with popular guardrail over 2,064 test cases',
  },
];

export default function Stats(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.statsSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>
          Find and fix LLM vulnerabilities <em>before</em> deployment
        </h2>
        <div className={styles.statsGrid}>
          {stats.map((stat, index) => (
            <div key={index} className={styles.statItem}>
              {stat.icon}
              <div className={styles.statNumber}>{stat.number}</div>
              <h3 className={styles.statTitle}>{stat.title}</h3>
              <p className={styles.statDescription}>
                <Tooltip title={stat.tooltip} enterDelay={500} enterNextDelay={500} arrow>
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
