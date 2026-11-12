import React from 'react';

import styles from './previews.module.css';

interface Series {
  label: string;
  values: number[];
  color: string;
}

export default function TrendChart({
  title,
  series,
  bounds,
  max,
  unit = '',
}: {
  title: string;
  series: Series[];
  bounds: string[];
  max: number;
  unit?: string;
}) {
  return (
    <figure className={styles.chart}>
      <figcaption>{title}</figcaption>
      <div className={styles.plot}>
        <span className={styles.scale} aria-hidden="true">
          {[max, max / 2, 0].map((n) => (
            <span key={n}>
              {n}
              {unit}
            </span>
          ))}
        </span>
        <svg
          viewBox="0 0 300 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={series
            .map(
              (s) =>
                `${s.label}: ${Math.min(...s.values)}${unit} to ${Math.max(...s.values)}${unit}`,
            )
            .join('. ')}
        >
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} />
          ))}
          {series.map((s) => {
            const points = s.values
              .map(
                (value, i) =>
                  `${(i * 300) / Math.max(s.values.length - 1, 1)},${100 - (value / max) * 100}`,
              )
              .join(' ');
            return (
              <g key={s.label}>
                <polygon points={`0,100 ${points} 300,100`} fill={s.color} opacity=".14" />
                <polyline
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.axis}>
        {bounds.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
