import React from 'react';
import styles from './CTAButton.module.css';

const CTAButton: React.FC = () => {
  return (
    <div className={styles.ctaContainer}>
      <a href="https://www.promptfoo.dev/docs/red-team/strategies/goat/" className={styles.ctaButton}>
        Try Red Teaming with GOAT
        <svg
          className={styles.arrow}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>
  );
};

export default CTAButton;