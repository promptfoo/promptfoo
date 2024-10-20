import React from 'react';
import BuildIcon from '@mui/icons-material/Build';
import CodeIcon from '@mui/icons-material/Code';
import GroupIcon from '@mui/icons-material/Group';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import styles from '../styles.module.css';

const reasons = [
  {
    icon: <SecurityIcon className={styles.reasonIcon} />,
    title: 'Comprehensive Security',
    description:
      'The most advanced gen AI scanning solution, covering all aspects of LLM security.',
  },
  {
    icon: <CodeIcon className={styles.reasonIcon} />,
    title: 'Built by Experts',
    description: 'Developed by practitioners with extensive real-world LLM security experience.',
  },
  {
    icon: <SpeedIcon className={styles.reasonIcon} />,
    title: 'Flexible Deployment',
    description: 'Deploy anywhere - on-premises, cloud, or air-gapped environments.',
  },
  {
    icon: <BuildIcon className={styles.reasonIcon} />,
    title: 'Highly Customizable',
    description: 'Tailor attack types and frameworks to your specific needs and use cases.',
  },
  {
    icon: <GroupIcon className={styles.reasonIcon} />,
    title: 'Active Community',
    description: 'Benefit from our open-source foundation and vibrant developer community.',
  },
  {
    icon: <VerifiedUserIcon className={styles.reasonIcon} />,
    title: 'Enterprise-Trusted',
    description: 'Relied upon by 30,000+ developers at leading companies worldwide.',
  },
];

export default function WhyPromptfoo(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.whyPromptfooSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Why Choose Promptfoo?</h2>
        <div className={styles.reasonsGrid}>
          {reasons.map((reason, index) => (
            <div key={index} className={styles.reasonItem}>
              <div className={styles.reasonIconWrapper}>{reason.icon}</div>
              <h3 className={styles.reasonTitle}>{reason.title}</h3>
              <p className={styles.reasonDescription}>{reason.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
