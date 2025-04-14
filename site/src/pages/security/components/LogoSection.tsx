import React from 'react';
import styles from '../styles.module.css';

const logos = [
  { src: '/img/brands/shopify-logo.svg', alt: 'Shopify' },
  { src: '/img/brands/doordash-logo.svg', alt: 'Doordash' },
  { src: '/img/brands/anthropic-logo.svg', alt: 'Anthropic' },
  { src: '/img/brands/microsoft-logo.svg', alt: 'Microsoft' },
];

export default function LogoSection(): JSX.Element {
  return (
    <section className={styles.logoSection}>
      <div className={styles.container}>
        <p className={styles.logoIntro}>
          Promptfoo has run{' '}
          <strong>
            <u>16 million+</u>
          </strong>{' '}
          probes at companies like
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
