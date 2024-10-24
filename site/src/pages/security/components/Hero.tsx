import React from 'react';
import Link from '@docusaurus/Link';
import styles from '../styles.module.css';

export default function Hero(): JSX.Element {
  return (
    <section className={styles.hero}>
      <div className={styles.container}>
        <h1 className={styles.heroTitle}>Secure Your LLM Applications</h1>
        <p className={styles.heroSubtitle}>
          Detect, mitigate, and monitor vulnerabilities in AI systems before deployment
        </p>
        <div className={styles.heroButtons}>
          <Link
            to="/docs/red-team/quickstart/"
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            Get started
          </Link>
          <Link to="/contact/" className={`${styles.button} ${styles.buttonSecondary}`}>
            Get a demo
          </Link>
        </div>
        <div className={styles.heroVideo}>
          <img src="/img/continuous-monitoring.png" alt="Promptfoo LLM Security Overview" />
        </div>
        {/*
        <div className={styles.heroVideo}>
          <iframe
            width="560"
            height="315"
            src="https://www.youtube.com/embed/your-video-id"
            title="Promptfoo LLM Security Overview"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
        */}
      </div>
    </section>
  );
}
