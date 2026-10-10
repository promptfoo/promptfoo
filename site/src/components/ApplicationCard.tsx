import React from 'react';

import styles from '../pages/landing-page.module.css';

export function ApplicationCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.solutionCard}>
      <div className={styles.solutionTitle}>
        {icon}
        {title}
      </div>
      <p>{children}</p>
    </div>
  );
}
