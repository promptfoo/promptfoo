import React from 'react';
import styles from '../styles.module.css';

const logos = [
  { src: '/img/logos/openai.svg', alt: 'OpenAI' },
  { src: '/img/logos/anthropic.svg', alt: 'Anthropic' },
  { src: '/img/logos/shopify.svg', alt: 'Shopify' },
  { src: '/img/logos/doordash.svg', alt: 'DoorDash' },
  // Add more logos as needed
];

export default function LogoSection(): JSX.Element {
  return (
    <section className={styles.logoSection}>
      <div className={styles.container}>
        <p className={styles.logoIntro}>
          Promptfoo has run{' '}
          <strong>
            <u>16 million</u>
          </strong>{' '}
          adversarial probes this year at companies like
        </p>
        <div className={styles.logoGrid}>
          {logos.map((logo, index) => (
            <img key={index} src={logo.src} alt={logo.alt} className={styles.logoItem} />
          ))}
        </div>
      </div>
    </section>
  );
}
