import styles from './LogoContainer.module.css';

export default function LogoContainer() {
  return (
    <div className={styles.logoContainer}>
      <img style={{ maxWidth: '100px' }} src="/img/brands/shopify-logo.svg" alt="Shopify" />
      <img src="/img/brands/discord-logo-blue.svg" alt="Discord" />
      <img style={{ maxWidth: '85px' }} src="/img/brands/google-logo.svg" alt="Google" />
      <img style={{ maxWidth: '100px' }} src="/img/brands/microsoft-logo.svg" alt="Microsoft" />
      <img style={{ maxHeight: '50px' }} src="/img/brands/salesforce-logo.svg" alt="Salesforce" />
      <img style={{ maxHeight: '120px' }} src="/img/brands/carvana-logo.svg" alt="Carvana" />
    </div>
  );
}
