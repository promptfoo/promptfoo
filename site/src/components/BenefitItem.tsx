import React from 'react';

// Keep stylesheet imports at the call site so extraction does not reorder the CSS cascade.
export function BenefitItem({
  styles,
  icon,
  title,
  children,
}: {
  styles: Readonly<Record<string, string>>;
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
