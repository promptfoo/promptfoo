import React, { useState } from 'react';

import { type FrameProps, Metric, PreviewFrame } from './PreviewFrame';
import styles from './previews.module.css';
import TrendChart from './TrendChart';

const dashboard = {
  title: 'MCP Proxy',
  heading: 'MCP Proxy Dashboard',
  subtitle: 'Real-time monitoring of MCP traffic and security alerts',
  metrics: [
    { label: 'Total Requests (24h)', value: '128,453' },
    { label: 'Error Rate', value: '1.8%' },
    { label: 'Avg Response Time', value: '234ms' },
  ],
  trafficTitle: 'Traffic Over Time',
  trafficLabel: 'Requests',
  bounds: ['11:23 PM', '11:53 PM', '12:23 AM'],
  traffic: [
    42, 41, 30, 31, 26, 28, 21, 33, 30, 15, 11, 27, 28, 12, 26, 18, 21, 17, 33, 32, 37, 33, 39, 40,
    51, 38, 43, 52, 49, 70, 72, 63, 65, 82, 70, 79, 80, 75, 78, 70, 85, 77, 78, 77, 78, 66, 65, 80,
    73, 70, 67, 68, 64, 60, 47,
  ],
  alertsTitle: 'Open Alerts',
  show: 'View all',
  hide: 'Show fewer',
  alerts: [
    {
      name: 'AWS Secret Key Detected',
      app: 'Customer Support AI',
      detail: 'A tool response contained a string matching an AWS secret access key.',
    },
    {
      name: 'Social Security Numbers Found',
      app: 'Knowledge Bot',
      detail: 'The proxy detected a Social Security number in a document returned by search.',
    },
    {
      name: 'Unapproved MCP Server',
      app: 'AI Support Agent',
      detail: 'The requested server was outside the application’s allowlist.',
    },
    {
      name: 'Email Addresses Found',
      app: 'Knowledge Bot',
      detail: 'A tool response contained personal email addresses.',
    },
    {
      name: 'Unexpected Tool Call',
      app: 'Code Analysis Assistant',
      detail: 'An application requested a tool outside its approved tool set.',
    },
  ],
  lists: [
    {
      title: 'Top Servers by Traffic',
      rows: [
        { name: 'GitHub Enterprise Repository', value: '45,234' },
        { name: 'Zendesk Support System', value: '38,921' },
        { name: 'Confluence Knowledge Base', value: '21,453' },
      ],
    },
    {
      title: 'Top Applications by Traffic',
      rows: [
        { name: 'AI Support Agent', value: '52,341' },
        { name: 'Knowledge Bot', value: '31,234' },
        { name: 'Code Analysis Assistant', value: '23,456' },
      ],
    },
  ],
};

export default function McpDashboard({
  data = dashboard,
  ...frame
}: FrameProps & { data?: typeof dashboard }) {
  const [allAlerts, setAllAlerts] = useState(false);
  return (
    <PreviewFrame ratio={2808 / 1916} title={data.title} {...frame}>
      <div className={styles.body}>
        <div>
          <h3>{data.heading}</h3>
          <p className={styles.subtitle}>{data.subtitle}</p>
        </div>
        <div className={styles.metrics}>
          {data.metrics.map((m) => (
            <Metric key={m.label} {...m} />
          ))}
          <Metric label={data.alertsTitle} value={data.alerts.length} color="var(--amber)" />
        </div>
        <div className={styles.dashboardGrid}>
          <TrendChart
            title={data.trafficTitle}
            series={[{ label: data.trafficLabel, values: data.traffic, color: 'var(--blue)' }]}
            max={100}
            bounds={data.bounds}
          />
          <div className={styles.panel}>
            <div className={styles.headingLine}>
              <h4>{data.alertsTitle}</h4>
              {data.alerts.length > 2 && (
                <button
                  type="button"
                  className={styles.textButton}
                  aria-expanded={allAlerts}
                  onClick={() => setAllAlerts(!allAlerts)}
                >
                  {allAlerts ? data.hide : data.show}
                </button>
              )}
            </div>
            {(allAlerts ? data.alerts : data.alerts.slice(0, 2)).map((alert) => (
              <details key={alert.name} className={styles.alert}>
                <summary>{alert.name}</summary>
                <small>{alert.app}</small>
                <p>{alert.detail}</p>
              </details>
            ))}
          </div>
          {data.lists.map((list) => (
            <div className={styles.panel} key={list.title}>
              <h4>{list.title}</h4>
              {list.rows.map((row) => (
                <div className={styles.trafficRow} key={row.name}>
                  <span>{row.name}</span>
                  <b>{row.value}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}
