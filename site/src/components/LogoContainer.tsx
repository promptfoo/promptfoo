import React from 'react';
import clsx from 'clsx';
import styles from './LogoContainer.module.css';

interface LogoContainerProps {
  className?: string;
  noBackground?: boolean;
  noBorder?: boolean;
}

export default function LogoContainer({
  className,
  noBackground = false,
  noBorder = false,
}: LogoContainerProps) {
  return (
    <div
      className={clsx(
        styles.logoContainer,
        noBackground && styles.noBackground,
        noBorder && styles.noBorder,
        className,
      )}
    >
      <img className={styles.shopify} src="/img/brands/shopify-logo.svg" alt="Shopify" />
      <img src="/img/brands/discord-logo-blue.svg" alt="Discord" />
      <img className={styles.anthropic} src="/img/brands/anthropic-logo.svg" alt="Anthropic" />
      <img className={styles.microsoft} src="/img/brands/microsoft-logo.svg" alt="Microsoft" />
      <img src="/img/brands/doordash-logo.svg" alt="Doordash" />
      <img className={styles.carvana} src="/img/brands/carvana-logo.svg" alt="Carvana" />
    </div>
  );
}
