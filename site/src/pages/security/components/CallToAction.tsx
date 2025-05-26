import React from 'react';
import Link from '@docusaurus/Link';
import styles from '../styles.module.css';

export default function CallToAction(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.ctaSection}`}>
      <div className={styles.container}>
        <h2 className={styles.ctaTitle}>Ready to Secure Your LLM Applications?</h2>
        <p className={styles.ctaDescription}>
          Try Promptfoo today and contact us to discuss how Promptfoo can improve your LLM security
          posture.
        </p>
        <div className={styles.ctaButtons}>
          <Link
            to="/docs/red-team/quickstart/"
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            Get Started
          </Link>
          <Link to="/contact/" className={`${styles.button} ${styles.buttonSecondary}`}>
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}
