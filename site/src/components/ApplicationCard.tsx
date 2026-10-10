import React from 'react';

// Keep stylesheet imports at the call site so extraction does not reorder the CSS cascade.
export function ApplicationCard({
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
    <div className={styles.solutionCard}>
      <div className={styles.solutionTitle}>
        {icon}
        {title}
      </div>
      <p>{children}</p>
    </div>
  );
}
