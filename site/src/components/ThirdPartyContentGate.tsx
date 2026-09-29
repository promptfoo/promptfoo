import React from 'react';

import styles from './ThirdPartyContentGate.module.css';

type PrivacyWindow = Window & {
  __pf_consent?: { marketing: number } | null;
  __pf_third_party_loaded?: boolean;
};

interface ThirdPartyContentGateProps {
  children: React.ReactNode;
  className?: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
  loadLabel?: string;
  minHeight?: number | string;
  serviceName: string;
  title: string;
}

export default function ThirdPartyContentGate({
  children,
  className,
  description,
  linkHref,
  linkLabel,
  loadLabel,
  minHeight,
  serviceName,
  title,
}: ThirdPartyContentGateProps): React.ReactElement {
  const [enabled, setEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let previousMarketing = (window as PrivacyWindow).__pf_consent?.marketing;
    const refreshEnabledState = (event?: Event) => {
      const marketing = (window as PrivacyWindow).__pf_consent?.marketing;
      const withdrew =
        (event as CustomEvent | undefined)?.detail?.revokeManual ||
        (previousMarketing === 1 && marketing !== 1);
      previousMarketing = marketing;
      setEnabled((current) => marketing === 1 || (!withdrew && current === true));
    };
    refreshEnabledState();
    window.addEventListener('pf_consent_change', refreshEnabledState);
    return () => window.removeEventListener('pf_consent_change', refreshEnabledState);
  }, []);

  React.useEffect(() => {
    if (enabled) {
      (window as PrivacyWindow).__pf_third_party_loaded = true;
    }
  }, [enabled]);

  if (enabled === null) {
    return (
      <div
        className={className ? `${styles.loading} ${className}` : styles.loading}
        style={{ minHeight }}
      >
        <p>Loading privacy controls…</p>
      </div>
    );
  }

  if (enabled) {
    return <>{children}</>;
  }

  return (
    <div className={className ? `${styles.gate} ${className}` : styles.gate} style={{ minHeight }}>
      <p className={styles.eyebrow}>Third-Party Content</p>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{description}</p>
      <p className={styles.notice}>
        This content is served by {serviceName}. Loading it may share your IP address, browser
        metadata, and referrer with that provider.
      </p>
      <div className={styles.actions}>
        <button className={styles.primaryButton} onClick={() => setEnabled(true)} type="button">
          {loadLabel ?? `Load ${serviceName}`}
        </button>
        {linkHref ? (
          <a className={styles.secondaryLink} href={linkHref} rel="noreferrer" target="_blank">
            {linkLabel ?? `Open on ${serviceName}`}
          </a>
        ) : null}
      </div>
    </div>
  );
}
