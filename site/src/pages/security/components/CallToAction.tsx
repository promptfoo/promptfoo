import React from 'react';
import Link from '@docusaurus/Link';
import styles from '../styles.module.css';

export default function CallToAction(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.ctaSection}`}>
      <div className={styles.container}>
        <h2 className={styles.ctaTitle}>Ready to Secure Your LLM Applications?</h2>
        <p className={styles.ctaDescription}>
          Contact our sales team today for a personalized demo and to discuss how Promptfoo can
          improve your LLM security posture.
        </p>
        <div className={styles.ctaButtons}>
          <Link to="/contact" className={styles.button}>
            Get Started
          </Link>
          <a
            href="mailto:sales@promptfoo.dev"
            className={`${styles.button} ${styles.buttonSecondary}`}
          >
            Email Us
          </a>
        </div>
      </div>
    </section>
  );
}
