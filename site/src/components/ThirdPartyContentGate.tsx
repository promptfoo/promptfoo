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

function canAutoloadThirdPartyContent(): boolean {
  const consent = (window as PrivacyWindow).__pf_consent;
  return consent?.marketing === 1;
}

function getClassName(className?: string): string {
  return className ? `${styles.gate} ${className}` : styles.gate;
}

function getStyle(minHeight?: number | string): React.CSSProperties | undefined {
  if (minHeight === undefined) {
    return undefined;
  }
  return { minHeight };
}

function GateFallback({
  className,
  minHeight,
}: Pick<ThirdPartyContentGateProps, 'className' | 'minHeight'>): React.ReactElement {
  const fallbackClassName = className ? `${styles.loading} ${className}` : styles.loading;

  return (
    <div className={fallbackClassName} style={getStyle(minHeight)}>
      <p>Loading privacy controls…</p>
    </div>
  );
}

function ClientThirdPartyContentGate({
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
  const [enabled, setEnabled] = React.useState(canAutoloadThirdPartyContent);

  React.useEffect(() => {
    const refreshEnabledState = () => setEnabled(canAutoloadThirdPartyContent());
    refreshEnabledState();
    window.addEventListener('pf_consent_change', refreshEnabledState);
    return () => window.removeEventListener('pf_consent_change', refreshEnabledState);
  }, []);

  React.useEffect(() => {
    if (enabled) {
      (window as PrivacyWindow).__pf_third_party_loaded = true;
    }
  }, [enabled]);

  if (enabled) {
    return <>{children}</>;
  }

  return (
    <div className={getClassName(className)} style={getStyle(minHeight)}>
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

export default function ThirdPartyContentGate(
  props: ThirdPartyContentGateProps,
): React.ReactElement {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <GateFallback className={props.className} minHeight={props.minHeight} />;
  }

  return <ClientThirdPartyContentGate {...props} />;
}
