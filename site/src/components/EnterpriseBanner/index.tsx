import React from 'react';

import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function EnterpriseBanner(): React.ReactElement {
  return (
    <div className={styles.banner}>
      <div className={styles.iconWrapper}>
        <svg
          className={styles.icon}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <span className={styles.text}>
        This feature requires{' '}
        <Link to="/docs/enterprise/" className={styles.link}>
          Promptfoo Enterprise
        </Link>
        .
      </span>
    </div>
  );
}
