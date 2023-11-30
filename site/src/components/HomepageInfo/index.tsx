import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

export default function HomepageInfo(): JSX.Element {
  return (
    <>
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>Used by developers at</h2>
          <div className={styles.logoContainer}>
            <img src="/img/brands/discord-logo-blue.svg" />
            <img src="/img/brands/mathworks-logo.svg" />
            <img style={{ maxWidth: '85px' }} src="/img/brands/google-logo.svg" />
            <img style={{ maxWidth: '100px' }} src="/img/brands/microsoft-logo.svg" />
            <img style={{ maxHeight: '120px' }} src="/img/brands/carvana-logo.svg" />
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>How it works</h2>
        </div>
      </section>
    </>
  );
}
