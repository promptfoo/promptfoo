import React, { useState } from 'react';

import { type FrameProps, Meter, Metric, PreviewFrame } from './PreviewFrame';
import styles from './previews.module.css';
import TrendChart from './TrendChart';

const dashboard = {
  title: 'Guardrails',
  heading: 'Guardrail activity',
  total: 'Total Requests',
  flagged: 'Flagged Requests',
  rate: 'Detection Rate',
  latency: 'Latency · P95',
  requestsChart: 'Requests Over Time',
  rateChart: 'Total Detection Rate',
  safeLabel: 'Safe',
  flaggedLabel: 'Flagged',
  types: 'Threat Types Flagged',
  requestsByType: 'Requests by Type',
  threatLabels: ['Prompt injection', 'PII exposure', 'Policy violation'],
  ranges: [
    {
      label: 'Past hour',
      bounds: ['12:00', '13:00'],
      safe: [2, 3, 1, 2, 3, 2],
      flagged: [3, 4, 2, 5, 4, 6],
      p95: 119,
      threats: [13, 7, 4],
    },
    {
      label: 'Last 24 hours',
      bounds: ['18:00', '06:00', '18:00'],
      safe: [6, 9, 10, 8, 6, 6, 8, 8, 12, 10, 5, 12, 11, 10, 8, 7, 6, 9, 14, 5, 13, 9, 4, 9],
      flagged: [
        12, 18, 21, 19, 24, 21, 18, 16, 19, 18, 22, 20, 24, 19, 17, 24, 20, 18, 31, 23, 14, 18, 21,
        17,
      ],
      p95: 125,
      threats: [231, 149, 94],
    },
    {
      label: 'Last 7 days',
      bounds: ['Thu', 'Wed'],
      safe: [98, 120, 156, 101, 89, 175, 205],
      flagged: [250, 310, 291, 350, 292, 413, 474],
      p95: 131,
      threats: [1170, 800, 410],
    },
    {
      label: 'Last 30 days',
      bounds: ['Oct 1', 'Oct 30'],
      safe: [480, 572, 430, 518, 674, 538],
      flagged: [987, 1300, 1150, 1400, 1276, 1687],
      p95: 134,
      threats: [3900, 2200, 1700],
    },
  ],
};

export default function GuardrailDashboard({
  data = dashboard,
  ...frame
}: FrameProps & { data?: typeof dashboard }) {
  const [selected, setSelected] = useState(1);
  const range = data.ranges[selected] ?? data.ranges[0];
  if (!range) {
    return (
      <PreviewFrame ratio={3330 / 2026} title={data.title} {...frame}>
        {data.heading}
      </PreviewFrame>
    );
  }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const flagged = sum(range.flagged);
  const safe = sum(range.safe);
  const total = flagged + safe;
  const traffic = [
    { label: data.flaggedLabel, values: range.flagged, color: 'var(--red)' },
    { label: data.safeLabel, values: range.safe, color: 'var(--green)' },
  ];
  return (
    <PreviewFrame ratio={3330 / 2026} title={data.title} {...frame}>
      <div className={styles.body}>
        <h3>{data.heading}</h3>
        <div className={styles.segments}>
          {data.ranges.map((r, i) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={r === range}
              onClick={() => setSelected(i)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={styles.metrics}>
          <Metric label={data.total} value={total.toLocaleString('en-US')} />
          <Metric label={data.flagged} value={flagged.toLocaleString('en-US')} />
          <Metric label={data.rate} value={`${((100 * flagged) / total).toFixed(1)}%`} />
          <Metric label={data.latency} value={`${range.p95}ms`} />
        </div>
        <div className={styles.dashboardGrid}>
          <TrendChart
            title={data.requestsChart}
            series={traffic}
            max={Math.ceil(Math.max(...range.safe, ...range.flagged) / 10) * 10}
            bounds={range.bounds}
          />
          <TrendChart
            title={data.rateChart}
            series={[
              {
                label: data.rate,
                values: range.flagged.map((v, i) => Math.round((100 * v) / (v + range.safe[i]))),
                color: 'var(--red)',
              },
            ]}
            max={100}
            unit="%"
            bounds={range.bounds}
          />
          <div className={styles.panel}>
            <h4>{data.types}</h4>
            {data.threatLabels.map((t, i) => (
              <div className={styles.barRow} key={t}>
                <span>{t}</span>
                <b>{range.threats[i]}</b>
                <Meter value={(100 * range.threats[i]) / flagged} color="var(--amber)" />
              </div>
            ))}
          </div>
          <div className={styles.panel}>
            <h4>{data.requestsByType}</h4>
            {traffic.map((s) => (
              <div className={styles.barRow} key={s.label}>
                <span>{s.label}</span>
                <b>{sum(s.values)}</b>
                <Meter value={(100 * sum(s.values)) / total} color={s.color} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}
