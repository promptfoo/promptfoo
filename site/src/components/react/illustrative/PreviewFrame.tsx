import React from 'react';

import clsx from 'clsx';
import styles from './previews.module.css';

export interface FrameProps {
  className?: string;
  backgroundImage?: string;
  sampleLabel?: string;
}

export function PreviewFrame({
  title,
  product = 'promptfoo',
  ratio,
  logo = <img src="/img/logo-panda.svg" alt="" width="19" height="19" />,
  sampleLabel = 'Sample data',
  className,
  backgroundImage,
  children,
  header,
}: FrameProps & {
  header?: React.ReactNode;
  title: string;
  ratio: number;
  logo?: React.ReactNode;
  product?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.sizing}>
      <section
        aria-label={`${title} · ${sampleLabel}`}
        className={clsx(styles.frame, className)}
        style={
          {
            '--preview-ratio': ratio,
            backgroundImage: backgroundImage && `url("${backgroundImage}")`,
          } as React.CSSProperties
        }
      >
        {header ?? (
          <div className={styles.chrome}>
            {logo}
            <b>{product}</b>
            <span className={styles.divider} aria-hidden="true">
              /
            </span>
            <span>{title}</span>
            <small>{sampleLabel}</small>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  color?: string;
}) {
  return (
    <div
      className={styles.metric}
      style={color ? ({ '--accent': color } as React.CSSProperties) : undefined}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Meter({ value, color }: { value: number; color?: string }) {
  return (
    <span className={styles.meter} aria-hidden="true">
      <i style={{ width: `${value}%`, backgroundColor: color }} />
    </span>
  );
}
