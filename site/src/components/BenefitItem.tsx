import React from 'react';

import styles from '../pages/landing-page.module.css';

export function BenefitItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.benefitItem}>
      {icon}
      <div className={styles.benefitContent}>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
