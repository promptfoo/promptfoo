import React from 'react';
import Link from '@docusaurus/Link';
import styles from '../styles.module.css';

export default function Hero(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.hero}`}>
      <div className={styles.container}>
        <h1 className={styles.heroTitle}>LLM Vulnerability Management for Enterprises</h1>
        <p className={styles.heroSubtitle}>
          Detect, mitigate, and monitor risks for LLM-based systems before deployment
        </p>
        <div className={styles.heroButtons}>
          <Link to="/contact" className={styles.button}>
            Get Started
          </Link>
          <Link to="/docs/security" className={`${styles.button} ${styles.buttonSecondary}`}>
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
